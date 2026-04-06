import { getDb } from '../db/client.js';
import { users, feeds } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { nanoid } from 'nanoid';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createChildLogger } from '../shared/logger.js';
import { NotFoundError } from '../shared/errors.js';
import { getConfig } from '../config.js';
import { uploadToPodcastBucket } from '../publishing/storage.js';

const log = createChildLogger('auth-service');

export async function provisionUser(clerkId: string, email: string, displayName?: string | null) {
  const db = getDb();
  const config = getConfig();

  // Check if user already exists (idempotent)
  const existing = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
  if (existing.length > 0) {
    log.info({ clerkId, email }, 'User already provisioned, skipping');
    return existing[0];
  }

  const id = uuid();

  await db.insert(users).values({
    id,
    clerkId,
    email,
    displayName: displayName || null,
    role: 'editor',
  });

  // Create personal podcast feed
  const ownershipToken = nanoid();
  const feedId = uuid();
  const feedName = displayName || email.split('@')[0];
  const firstName = feedName.split(/\s+/)[0];
  const feedTitle = `${firstName}'s ViddyPod`;

  // Upload the default ViddyPod cover image
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const coverPath = resolve(__dirname, '../../static/viddypod-cover.png');
  const coverBuffer = await readFile(coverPath);
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

  log.info({ userId: id, clerkId, email, feedId }, 'User provisioned with personal feed');

  return { id, clerkId, email, displayName: displayName || null, role: 'editor' as const };
}

export async function getUserByClerkId(clerkId: string) {
  const db = getDb();
  const rows = await db.select({
    id: users.id,
    clerkId: users.clerkId,
    email: users.email,
    displayName: users.displayName,
    role: users.role,
  }).from(users).where(eq(users.clerkId, clerkId)).limit(1);

  if (rows.length === 0) return null;
  return rows[0];
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
