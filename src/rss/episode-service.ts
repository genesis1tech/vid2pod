import { getDb } from '../db/client.js';
import { episodes, assets, feeds, accessLog, youtubeMetadata, processingJobs } from '../db/schema.js';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { createChildLogger } from '../shared/logger.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { validateLicense } from '../licensing/service.js';
import { deleteFile, deletePodcastFile } from '../publishing/storage.js';
import type { EpisodeType, EpisodeStatus } from '../shared/types.js';

const log = createChildLogger('episode-service');
const LIBRARY_ARCHIVE_AFTER_DAYS = 5;

type AssetRow = typeof assets.$inferSelect;
type EpisodeRow = typeof episodes.$inferSelect;

function getPodcastStorageKey(url: string | null | undefined) {
  if (!url) return null;
  const marker = '/storage/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;
  const key = url.slice(markerIndex + marker.length).split(/[?#]/, 1)[0];
  return key || null;
}

async function deleteAssetStorage(asset: AssetRow | undefined, episode: EpisodeRow) {
  const metadata = asset?.metadata as ({ processedKey?: string } & NonNullable<AssetRow['metadata']>) | null | undefined;
  const podcastKeys = new Set<string>();

  if (metadata?.processedKey) podcastKeys.add(metadata.processedKey);

  const enclosureKey = getPodcastStorageKey(episode.enclosureUrl);
  if (enclosureKey) podcastKeys.add(enclosureKey);

  const imageKey = getPodcastStorageKey(episode.imageUrl);
  if (imageKey) podcastKeys.add(imageKey);

  if (asset?.storageKey) {
    try { await deleteFile(asset.storageKey); } catch { /* best effort */ }
  }

  for (const key of podcastKeys) {
    try { await deletePodcastFile(key); } catch { /* best effort */ }
  }
}

export async function createEpisode(params: {
  userId: string;
  feedId: string;
  assetId?: string;
  title: string;
  description: string;
  subtitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeType?: EpisodeType;
  explicit?: boolean;
  scheduledAt?: string;
}) {
  const db = getDb();

  // Verify the target feed belongs to the requesting user before creating an episode in it.
  const feedRows = await db.select({ id: feeds.id }).from(feeds)
    .where(and(eq(feeds.id, params.feedId), eq(feeds.userId, params.userId)))
    .limit(1);
  if (feedRows.length === 0) throw new NotFoundError('Feed');

  if (params.assetId) {
    // Scope the asset lookup to the user so one user cannot attach another user's asset.
    const assetRows = await db.select().from(assets)
      .where(and(eq(assets.id, params.assetId), eq(assets.userId, params.userId)))
      .limit(1);
    if (assetRows.length === 0) throw new NotFoundError('Asset');
    const asset = assetRows[0];

    if (!asset.licenseId) {
      throw new ValidationError('Asset must have an associated license before creating an episode');
    }

    await validateLicense(params.userId, asset.licenseId);

    if (asset.processingStatus !== 'completed') {
      throw new ValidationError('Asset must be fully processed before creating an episode');
    }
  }

  const id = uuid();
  const guid = uuid();
  const status: EpisodeStatus = params.scheduledAt ? 'scheduled' : 'draft';

  const [episode] = await db.insert(episodes).values({
    id,
    feedId: params.feedId,
    assetId: params.assetId || null,
    title: params.title,
    description: params.description,
    subtitle: params.subtitle || null,
    seasonNumber: params.seasonNumber || null,
    episodeNumber: params.episodeNumber || null,
    episodeType: params.episodeType || 'full',
    explicit: params.explicit ?? false,
    guid,
    status,
    scheduledAt: params.scheduledAt ? new Date(params.scheduledAt) : null,
  }).returning();

  if (params.assetId) {
    await populateEpisodeFromAsset(episode);
  }

  log.info({ episodeId: id, feedId: params.feedId }, 'Episode created');
  return episode;
}

async function populateEpisodeFromAsset(episode: any) {
  const db = getDb();
  const config = (await import('../config.js')).getConfig();

  const assetRows = await db.select().from(assets).where(eq(assets.id, episode.assetId)).limit(1);
  const asset = assetRows[0];
  if (!asset?.metadata) return;

  const meta = asset.metadata as any;
  const enclosureUrl = asset.storageKey
    ? `${config.BASE_URL}/storage/${meta.processedKey || asset.storageKey}`
    : asset.streamUrl || null;

  await db.update(episodes).set({
    enclosureUrl,
    enclosureSize: meta.processedSize || asset.fileSizeBytes || null,
    enclosureType: meta.processedFormat === 'm4a' ? 'audio/mp4' : 'audio/mpeg',
    durationSeconds: meta.duration ? Math.round(meta.duration) : null,
    updatedAt: new Date(),
  }).where(eq(episodes.id, episode.id));
}

export async function listEpisodes(userId: string, feedId: string) {
  const db = getDb();

  // Verify the feed belongs to the requesting user before listing its episodes.
  const feedRows = await db.select({ id: feeds.id }).from(feeds)
    .where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
    .limit(1);
  if (feedRows.length === 0) throw new NotFoundError('Feed');

  await archiveStaleLibraryEpisodes(feedId);
  const rows = await db.select({
    episode: episodes,
    assetProcessingStatus: assets.processingStatus,
    processingStage: assets.processingStage,
    processingProgress: assets.processingProgress,
  }).from(episodes)
    .leftJoin(assets, eq(episodes.assetId, assets.id))
    .where(eq(episodes.feedId, feedId))
    .orderBy(desc(episodes.sortOrder), desc(episodes.publishedAt));

  return rows.map((row) => ({
    ...row.episode,
    assetProcessingStatus: row.assetProcessingStatus,
    processingStage: row.processingStage,
    processingProgress: row.processingProgress,
  }));
}

async function archiveStaleLibraryEpisodes(feedId: string) {
  const db = getDb();
  const cutoff = new Date(Date.now() - LIBRARY_ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  await db.update(episodes)
    .set({ libraryArchivedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(episodes.feedId, feedId),
      eq(episodes.status, 'published'),
      isNull(episodes.libraryArchivedAt),
      lt(episodes.createdAt, cutoff),
    ));
}

export async function getEpisode(userId: string, episodeId: string) {
  const db = getDb();
  // Verify ownership by joining through feed → user
  const rows = await db.select({
    episode: episodes,
    feedUserId: feeds.userId,
  })
    .from(episodes)
    .innerJoin(feeds, eq(episodes.feedId, feeds.id))
    .where(eq(episodes.id, episodeId))
    .limit(1);
  if (rows.length === 0) throw new NotFoundError('Episode');
  if (rows[0].feedUserId !== userId) throw new NotFoundError('Episode');
  return rows[0].episode;
}

export async function updateEpisode(userId: string, episodeId: string, updates: Record<string, any>) {
  const db = getDb();
  // Verify ownership (throws NotFoundError if the episode is not the user's).
  await getEpisode(userId, episodeId);
  const allowedFields = ['title', 'subtitle', 'description', 'seasonNumber', 'episodeNumber',
    'episodeType', 'explicit', 'imageUrl', 'sortOrder'];
  const filtered: Record<string, any> = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  filtered.updatedAt = new Date();

  const [updated] = await db.update(episodes)
    .set(filtered)
    .where(eq(episodes.id, episodeId))
    .returning();

  log.info({ episodeId }, 'Episode updated');
  return updated;
}

export async function publishEpisode(userId: string, episodeId: string) {
  const db = getDb();
  const episode = await getEpisode(userId, episodeId);

  if (episode.status !== 'draft' && episode.status !== 'scheduled' && episode.status !== 'publishing') {
    throw new ValidationError(`Cannot publish episode in '${episode.status}' status`);
  }

  if (episode.assetId) {
    const assetRows = await db.select().from(assets).where(eq(assets.id, episode.assetId)).limit(1);
    if (assetRows.length > 0 && assetRows[0].licenseId) {
      await validateLicense(userId, assetRows[0].licenseId);
    }
  }

  const [updated] = await db.update(episodes)
    .set({
      status: 'published',
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(episodes.id, episodeId))
    .returning();

  await db.update(feeds)
    .set({ lastPublishedAt: new Date(), updatedAt: new Date() })
    .where(eq(feeds.id, episode.feedId));

  log.info({ episodeId }, 'Episode published');
  return updated;
}

export async function scheduleEpisode(userId: string, episodeId: string, scheduledAt: string) {
  const db = getDb();
  // Verify ownership (throws NotFoundError if the episode is not the user's).
  await getEpisode(userId, episodeId);

  const [updated] = await db.update(episodes)
    .set({
      status: 'scheduled',
      scheduledAt: new Date(scheduledAt),
      updatedAt: new Date(),
    })
    .where(eq(episodes.id, episodeId))
    .returning();

  log.info({ episodeId, scheduledAt }, 'Episode scheduled');
  return updated;
}

export async function archiveEpisode(userId: string, episodeId: string) {
  const db = getDb();
  await getEpisode(userId, episodeId);

  const [updated] = await db.update(episodes)
    .set({
      libraryArchivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(episodes.id, episodeId))
    .returning();

  log.info({ episodeId }, 'Episode archived from library');
  return updated;
}

export async function deleteEpisode(userId: string, episodeId: string) {
  const db = getDb();

  // Verify ownership and fetch the episode
  const episode = await getEpisode(userId, episodeId);

  // Delete access log entries that reference this episode (FK constraint)
  await db.delete(accessLog).where(eq(accessLog.episodeId, episodeId));

  // Delete the episode
  await db.delete(episodes).where(eq(episodes.id, episodeId));

  // If this episode was linked to an asset, clean up the asset and its dependents.
  // This prevents orphaned assets from blocking re-addition of the same YouTube video.
  if (episode.assetId) {
    const assetId = episode.assetId;

    try {
      // Check no other episodes reference this asset
      const otherEpisodes = await db.select({ id: episodes.id })
        .from(episodes)
        .where(eq(episodes.assetId, assetId))
        .limit(1);

      if (otherEpisodes.length === 0) {
        // Fetch asset before dependent cleanup so storage cleanup still has keys.
        const assetRows = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
        const asset = assetRows[0];

        // Delete dependent records: youtube_metadata, processing_jobs
        await db.delete(youtubeMetadata).where(eq(youtubeMetadata.assetId, assetId));
        await db.delete(processingJobs).where(eq(processingJobs.assetId, assetId));

        // Delete the asset itself
        await db.delete(assets).where(eq(assets.id, assetId));
        await deleteAssetStorage(asset, episode);
        log.info({ assetId }, 'Linked asset deleted');
      }
    } catch (err) {
      log.warn({ err, episodeId, assetId }, 'Episode deleted but linked asset cleanup failed');
    }
  }

  log.info({ episodeId }, 'Episode deleted');
}
