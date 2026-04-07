import { getDb } from '../db/client.js';
import { assets, episodes, feeds } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { extractVideoId } from '../processing/youtube-dl.js';
import { createChildLogger } from '../shared/logger.js';
import { ValidationError, NotFoundError } from '../shared/errors.js';

const log = createChildLogger('youtube-ingestion');

export async function addYouTubeVideo(params: {
  userId: string;
  url: string;
}) {
  const videoId = extractVideoId(params.url);
  if (!videoId) {
    throw new ValidationError('Invalid YouTube URL');
  }

  const db = getDb();

  // Get user's personal feed
  const feedRows = await db.select().from(feeds)
    .where(eq(feeds.userId, params.userId))
    .limit(1);

  if (feedRows.length === 0) {
    throw new NotFoundError('Personal feed');
  }
  const feed = feedRows[0];

  // Check for duplicate video within this user's library
  const existingAssets = await db.select().from(assets)
    .where(and(
      eq(assets.youtubeVideoId, videoId),
      eq(assets.userId, params.userId),
    ))
    .limit(1);

  if (existingAssets.length > 0) {
    throw new ValidationError(`Video ${videoId} has already been added to your library`);
  }

  // Create asset record — pending_download means local agent needs to download it
  const assetId = uuid();
  await db.insert(assets).values({
    id: assetId,
    userId: params.userId,
    licenseId: null,
    sourceType: 'stream_url',
    youtubeVideoId: videoId,
    streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
    processingStatus: 'pending_download',
  }).returning();

  // Create draft episode linked to this asset
  const episodeId = uuid();
  const guid = uuid();
  await db.insert(episodes).values({
    id: episodeId,
    feedId: feed.id,
    assetId: assetId,
    title: `YouTube video ${videoId}`,
    description: 'Waiting for download...',
    guid,
    status: 'draft',
    episodeType: 'full',
  }).returning();

  log.info({ videoId, assetId, episodeId, feedId: feed.id }, 'YouTube video awaiting agent download');

  return {
    videoId,
    assetId,
    episodeId,
    status: 'pending_download',
  };
}
