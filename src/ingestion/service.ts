import { getDb } from '../db/client.js';
import { assets, youtubeMetadata, episodes, accessLog, processingJobs } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { createHash } from 'crypto';
import { uploadFile, deleteFile } from '../publishing/storage.js';
import { validateLicense } from '../licensing/service.js';
import { createChildLogger } from '../shared/logger.js';
import { NotFoundError, LicenseError, ValidationError } from '../shared/errors.js';
import type { AssetSourceType } from '../shared/types.js';

const log = createChildLogger('ingestion');

export async function uploadAsset(params: {
  userId: string;
  licenseId: string;
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
}) {
  await validateLicense(params.licenseId);

  const db = getDb();
  const id = uuid();
  const checksum = createHash('sha256').update(params.fileBuffer).digest('hex');
  const storageKey = `assets/${params.userId}/${id}/${params.filename}`;

  await uploadFile(storageKey, params.fileBuffer, params.mimeType);

  const [asset] = await db.insert(assets).values({
    id,
    userId: params.userId,
    licenseId: params.licenseId,
    sourceType: 'audio_upload' as AssetSourceType,
    originalFilename: params.filename,
    storageKey,
    mimeType: params.mimeType,
    fileSizeBytes: params.fileBuffer.length,
    checksumSha256: checksum,
  }).returning();

  log.info({ assetId: id, filename: params.filename, size: params.fileBuffer.length }, 'Asset uploaded');
  return asset;
}

export async function addStreamUrl(params: {
  userId: string;
  licenseId: string;
  streamUrl: string;
  filename?: string;
}) {
  await validateLicense(params.licenseId);

  let response: Response;
  try {
    response = await fetch(params.streamUrl, { method: 'HEAD' });
  } catch {
    throw new ValidationError('Cannot reach streaming URL');
  }

  if (!response.ok) {
    throw new ValidationError(`Streaming URL returned status ${response.status}`);
  }

  const db = getDb();
  const id = uuid();

  const [asset] = await db.insert(assets).values({
    id,
    userId: params.userId,
    licenseId: params.licenseId,
    sourceType: 'stream_url' as AssetSourceType,
    streamUrl: params.streamUrl,
    originalFilename: params.filename || null,
    mimeType: response.headers.get('content-type') || null,
  }).returning();

  log.info({ assetId: id, streamUrl: params.streamUrl }, 'Stream URL registered');
  return asset;
}

export async function listAssets(userId: string) {
  const db = getDb();
  return db.select().from(assets).where(eq(assets.userId, userId));
}

export async function getAsset(userId: string, assetId: string) {
  const db = getDb();
  const rows = await db.select().from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new NotFoundError('Asset');
  return rows[0];
}

export async function deleteAsset(userId: string, assetId: string) {
  const db = getDb();
  const asset = await getAsset(userId, assetId);

  // Clean up dependent records before deleting the asset.
  // Order matters to respect FK constraints:
  // 1. access_log → episodes (via episodeId FK)
  // 2. episodes → assets (via assetId FK)
  // 3. youtube_metadata → assets (via assetId FK)
  // 4. processing_jobs → assets (via assetId FK)

  // Find all episodes linked to this asset
  const linkedEpisodes = await db.select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.assetId, assetId));

  // Delete access log entries for those episodes
  for (const ep of linkedEpisodes) {
    await db.delete(accessLog).where(eq(accessLog.episodeId, ep.id));
  }

  // Delete the linked episodes
  await db.delete(episodes).where(eq(episodes.assetId, assetId));

  // Delete YouTube metadata linked to this asset
  await db.delete(youtubeMetadata).where(eq(youtubeMetadata.assetId, assetId));

  // Delete processing jobs linked to this asset
  await db.delete(processingJobs).where(eq(processingJobs.assetId, assetId));

  // Delete S3 file (best effort)
  if (asset.storageKey) {
    try { await deleteFile(asset.storageKey); } catch { /* best effort */ }
  }

  // Finally delete the asset itself
  await db.delete(assets).where(eq(assets.id, assetId));
  log.info({ assetId }, 'Asset deleted');
}

export async function fetchYouTubeMetadata(params: {
  userId: string;
  licenseId: string;
  videoId: string;
}) {
  await validateLicense(params.licenseId);

  const db = getDb();
  const existing = await db.select().from(youtubeMetadata)
    .where(eq(youtubeMetadata.videoId, params.videoId))
    .limit(1);

  if (existing.length > 0) {
    log.info({ videoId: params.videoId }, 'YouTube metadata served from cache');
    return existing[0];
  }

  const { google } = await import('googleapis');
  const config = (await import('../config.js')).getConfig();
  const youtube = google.youtube({ version: 'v3', auth: config.YOUTUBE_API_KEY });

  const response = await youtube.videos.list({
    id: [params.videoId],
    part: ['snippet', 'contentDetails'],
  });

  const video = response.data.items?.[0];
  if (!video) throw new NotFoundError('YouTube video');

  const snippet = video.snippet!;
  const contentDetails = video.contentDetails!;
  const thumbnail = snippet.thumbnails?.maxres?.url
    || snippet.thumbnails?.high?.url
    || snippet.thumbnails?.default?.url
    || null;

  const [meta] = await db.insert(youtubeMetadata).values({
    videoId: params.videoId,
    title: snippet.title || null,
    description: snippet.description || null,
    channelTitle: snippet.channelTitle || null,
    publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : null,
    thumbnailUrl: thumbnail,
    durationIso: contentDetails.duration || null,
    tags: snippet.tags || null,
    categoryId: snippet.categoryId || null,
    rawResponse: video,
  }).returning();

  log.info({ videoId: params.videoId }, 'YouTube metadata fetched');
  return meta;
}
