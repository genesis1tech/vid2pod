import { getDb } from '../db/client.js';
import { assets, episodes, feeds } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { extractVideoId } from '../processing/youtube-dl.js';
import { enqueueProcessingJob } from '../processing/jobs.js';
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

  // Check for duplicate video
  const existingAssets = await db.select().from(assets)
    .where(eq(assets.youtubeVideoId, videoId))
    .limit(1);

  if (existingAssets.length > 0) {
    throw new ValidationError(`Video ${videoId} has already been added`);
  }

  // Create asset record (pending processing)
  const assetId = uuid();
  const [asset] = await db.insert(assets).values({
    id: assetId,
    userId: params.userId,
    licenseId: null as any, // Personal use — no license required
    sourceType: 'stream_url',
    youtubeVideoId: videoId,
    streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
    processingStatus: 'pending',
  }).returning();

  // Create draft episode linked to this asset
  const episodeId = uuid();
  const guid = uuid();
  const [episode] = await db.insert(episodes).values({
    id: episodeId,
    feedId: feed.id,
    assetId: assetId,
    title: `YouTube video ${videoId}`, // Updated with real title after download
    description: 'Processing...', // Updated after download
    guid,
    status: 'draft',
    episodeType: 'full',
  }).returning();

  // Queue background download + processing
  await enqueueProcessingJob({
    assetId,
    userId: params.userId,
    targetFormat: 'mp3',
  });

  log.info({ videoId, assetId, episodeId, feedId: feed.id }, 'YouTube video queued for processing');

  return {
    videoId,
    assetId,
    episodeId,
    status: 'queued',
  };
}
