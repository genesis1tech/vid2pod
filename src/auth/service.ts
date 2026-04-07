import { getDb } from '../db/client.js';
import { users, feeds } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { hash, compare } from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { nanoid } from 'nanoid';
import { signAccessToken, signRefreshToken, JwtPayload } from './jwt.js';
import { createChildLogger } from '../shared/logger.js';
import { AppError, NotFoundError } from '../shared/errors.js';
import { getConfig } from '../config.js';
import { uploadToPodcastBucket } from '../publishing/storage.js';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const log = createChildLogger('auth-service');

export async function register(email: string, password: string, displayName: string) {
  const db = getDb();
  const config = getConfig();

  if (!displayName || !displayName.trim()) {
    throw new AppError('Display name is required', 400, 'DISPLAY_NAME_REQUIRED');
  }

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  const passwordHash = await hash(password, 10);
  const id = uuid();

  await db.insert(users).values({
    id,
    email,
    passwordHash,
    displayName,
    role: 'editor',
  });

  const ownershipToken = nanoid();
  const feedId = uuid();
  const feedName = displayName;

  const firstName = feedName.split(/\s+/)[0];
  const feedTitle = `${firstName}'s ViddyPod Library`;

  // Use the static ViddyPod cover image. Try multiple paths in case
  // of dev vs production layout differences.
  let coverBuffer: Buffer | null = null;
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    resolve(__dirname, '../../static/viddypod-cover.png'),  // dist/auth → /app/static
    resolve(__dirname, '../../../static/viddypod-cover.png'), // src/auth → /app/static
    resolve(process.cwd(), 'static/viddypod-cover.png'),
  ];
  for (const p of candidatePaths) {
    try {
      coverBuffer = await readFile(p);
      log.info({ coverPath: p }, 'Loaded ViddyPod cover');
      break;
    } catch {
      // try next path
    }
  }
  if (!coverBuffer) {
    log.error({ candidatePaths }, 'Could not find viddypod-cover.png in any location');
    throw new AppError('Cover image not found on server', 500, 'COVER_NOT_FOUND');
  }
  const coverKey = `covers/${id}/cover.png`;
  await uploadToPodcastBucket(coverKey, coverBuffer, 'image/png');
  const imageUrl = `${config.BASE_URL}/storage/${coverKey}`;

  await db.insert(feeds).values({
    id: feedId,
    userId: id,
    title: feedTitle,
    description: `${firstName}'s personal podcast feed`,
    author: feedName,
    categoryPrimary: 'Technology',
    ownershipToken,
    visibility: 'private',
    baseUrl: config.BASE_URL,
    imageUrl,
  });

  log.info({ userId: id, email, feedId }, 'User registered with personal feed');

  const payload: JwtPayload = { sub: id, email, role: 'editor' };
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(payload),
    signRefreshToken(payload),
  ]);

  const feedUrl = `${config.BASE_URL}/feed/${ownershipToken}.xml`;

  return {
    user: { id, email, displayName: displayName || null, role: 'editor' as const },
    feedUrl,
    accessToken,
    refreshToken,
  };
}

export async function login(email: string, password: string) {
  const db = getDb();

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const valid = await compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(payload),
    signRefreshToken(payload),
  ]);

  log.info({ userId: user.id }, 'User logged in');

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    accessToken,
    refreshToken,
  };
}

export async function getUser(userId: string) {
  const db = getDb();
  const rows = await db.select({
    id: users.id,
    email: users.email,
    displayName: users.displayName,
    role: users.role,
    agentLastSeen: users.agentLastSeen,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (rows.length === 0) throw new NotFoundError('User');
  return rows[0];
}
