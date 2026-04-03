import { getDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { hash, compare } from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { signAccessToken, signRefreshToken, JwtPayload } from './jwt.js';
import { createChildLogger } from '../shared/logger.js';
import { AppError, NotFoundError } from '../shared/errors.js';

const log = createChildLogger('auth-service');

export async function register(email: string, password: string, displayName?: string) {
  const db = getDb();

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
    displayName: displayName || null,
    role: 'editor',
  });

  log.info({ userId: id, email }, 'User registered');

  const payload: JwtPayload = { sub: id, email, role: 'editor' };
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(payload),
    signRefreshToken(payload),
  ]);

  return {
    user: { id, email, displayName: displayName || null, role: 'editor' as const },
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
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (rows.length === 0) throw new NotFoundError('User');
  return rows[0];
}
