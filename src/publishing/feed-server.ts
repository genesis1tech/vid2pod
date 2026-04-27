import { getDb } from '../db/client.js';
import { accessLog } from '../db/schema.js';
import { compare } from 'bcrypt';
import { createChildLogger } from '../shared/logger.js';
import { generateRssFeed } from '../rss/generator.js';
import { getFeedByToken } from '../rss/feed-service.js';
import { NotFoundError, UnauthorizedError } from '../shared/errors.js';

const log = createChildLogger('feed-server');

export async function serveFeed(token: string, authHeader?: string, ip?: string, userAgent?: string) {
  const feed = await getFeedByToken(token);

  if (feed.visibility === 'private') {
    await authenticateFeedAccess(feed, authHeader);
  }

  const xml = await generateRssFeed(feed);

  await logAccess(feed.id, null, ip, userAgent, feed.authType || 'token');

  return xml;
}

export async function authenticateFeedAccess(feed: any, authHeader?: string) {
  if (feed.authType === 'basic_auth') {
    if (!authHeader?.startsWith('Basic ')) {
      throw new UnauthorizedError('Authentication required');
    }

    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [username, password] = decoded.split(':');

    if (username !== feed.authUsername || !feed.authPasswordHash) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await compare(password, feed.authPasswordHash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');
  }
}

async function logAccess(feedId: string, episodeId: string | null, ip: string | undefined, userAgent: string | undefined, authMethod: string) {
  try {
    const db = getDb();
    await db.insert(accessLog).values({
      feedId,
      episodeId,
      ipAddress: ip || null,
      userAgent: userAgent || null,
      authMethod,
    });
  } catch (err) {
    log.warn({ err }, 'Failed to log feed access');
  }
}
