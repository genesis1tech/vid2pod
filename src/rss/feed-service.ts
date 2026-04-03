import { getDb } from '../db/client.js';
import { feeds } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getConfig } from '../config.js';
import { createChildLogger } from '../shared/logger.js';
import { generateRssXml } from './generator.js';
import { PODCAST_CATEGORIES } from '../shared/constants.js';
import { v4 as uuid } from 'uuid';
import { nanoid } from 'nanoid';
import { hash } from 'bcrypt';
import { NotFoundError, ValidationError } from '../shared/errors.js';

import type { FeedVisibility, FeedAuthType, FeedType } from '../shared/types.js';

const log = createChildLogger('feed-service');

export async function createFeed(params: {
  userId: string;
  title: string;
  description: string;
  author: string;
  email?: string;
  websiteUrl?: string;
  language?: string;
  categoryPrimary: string;
  categorySecondary?: string;
  explicit?: boolean;
  feedType?: FeedType;
  visibility?: FeedVisibility;
  authType?: FeedAuthType;
  authUsername?: string;
  authPassword?: string;
}) {
  if (!PODCAST_CATEGORIES.includes(params.categoryPrimary as any)) {
    throw new ValidationError(`Invalid category: ${params.categoryPrimary}`);
  }

  const db = getDb();
  const config = getConfig();
  const id = uuid();
  const ownershipToken = nanoid();
  let authPasswordHash: string | null = null;
  if (params.authType === 'basic_auth' && params.authPassword) {
    authPasswordHash = await hash(params.authPassword, 10);
  }
  const [feed] = await db.insert(feeds).values({
    id,
    userId: params.userId,
    title: params.title,
    description: params.description,
    author: params.author,
    email: params.email || null,
    websiteUrl: params.websiteUrl || null,
    language: params.language || 'en',
    categoryPrimary: params.categoryPrimary,
    categorySecondary: params.categorySecondary || null,
    explicit: params.explicit ?? false,
    feedType: params.feedType || 'episodic',
    ownershipToken,
    visibility: params.visibility || 'private',
    authType: params.authType || null,
    authUsername: params.authUsername || null,
    authPasswordHash,
    baseUrl: config.BASE_URL,
  }).returning();
  log.info({ feedId: id }, 'Feed created');
  return feed;
}

export async function listFeeds(userId: string) {
  const db = getDb();
  return db.select().from(feeds).where(eq(feeds.userId, userId));
}

export async function getFeed(userId: string, feedId: string) {
  const db = getDb();
  const rows = await db.select().from(feeds)
    .where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new NotFoundError('Feed');
  return rows[0];
}

export async function getFeedByToken(token: string) {
  const db = getDb();
  const rows = await db.select().from(feeds)
    .where(eq(feeds.ownershipToken, token))
    .limit(1);
  if (rows.length === 0) throw new NotFoundError('Feed');
  return rows[0];
}

export async function updateFeed(userId: string, feedId: string, updates: Record<string, any>) {
  const db = getDb();
  await getFeed(userId, feedId);
  const allowedFields = ['title', 'subtitle', 'description', 'author', 'email', 'websiteUrl',
    'language', 'copyright', 'categoryPrimary', 'categorySecondary', 'explicit', 'feedType',
    'visibility', 'authType', 'imageUrl'];
  const filtered: Record<string, any> = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  filtered.updatedAt = new Date();
  const [updated] = await db.update(feeds)
    .set(filtered)
    .where(eq(feeds.id, feedId))
    .returning();
  log.info({ feedId }, 'Feed updated');
  return updated;
}

export async function deleteFeed(userId: string, feedId: string) {
  const db = getDb();
  await getFeed(userId, feedId);
  await db.delete(feeds).where(eq(feeds.id, feedId));
  log.info({ feedId }, 'Feed deleted');
}

export async function regenerateFeed(userId: string, feedId: string) {
  const feed = await getFeed(userId, feedId);
  const xml = generateRssXml(feed);
  log.info({ feedId }, 'Feed regenerated');
  return xml;
}
