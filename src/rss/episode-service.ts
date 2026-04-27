import { getDb } from '../db/client.js';
import { episodes, assets, feeds, accessLog, youtubeMetadata, processingJobs } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { createChildLogger } from '../shared/logger.js';
import { NotFoundError, ValidationError, LicenseError } from '../shared/errors.js';
import { validateLicense } from '../licensing/service.js';
import { deleteFile } from '../publishing/storage.js';
import type { EpisodeType, EpisodeStatus } from '../shared/types.js';

const log = createChildLogger('episode-service');

export async function createEpisode(params: {
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

  if (params.assetId) {
    const assetRows = await db.select().from(assets).where(eq(assets.id, params.assetId)).limit(1);
    if (assetRows.length === 0) throw new NotFoundError('Asset');
    const asset = assetRows[0];

    if (!asset.licenseId) {
      throw new ValidationError('Asset must have an associated license before creating an episode');
    }

    await validateLicense(asset.licenseId);

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

export async function listEpisodes(feedId: string) {
  const db = getDb();
  return db.select().from(episodes)
    .where(eq(episodes.feedId, feedId))
    .orderBy(desc(episodes.sortOrder), desc(episodes.publishedAt));
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
      await validateLicense(assetRows[0].licenseId);
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
        // Delete dependent records: youtube_metadata, processing_jobs
        await db.delete(youtubeMetadata).where(eq(youtubeMetadata.assetId, assetId));
        await db.delete(processingJobs).where(eq(processingJobs.assetId, assetId));

        // Fetch asset for S3 cleanup
        const assetRows = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
        const asset = assetRows[0];

        // Delete S3 file (best effort)
        if (asset?.storageKey) {
          try { await deleteFile(asset.storageKey); } catch { /* best effort */ }
        }

        // Delete the asset itself
        await db.delete(assets).where(eq(assets.id, assetId));
        log.info({ assetId }, 'Linked asset deleted');
      }
    } catch (err) {
      log.warn({ err, episodeId, assetId }, 'Episode deleted but linked asset cleanup failed');
    }
  }

  log.info({ episodeId }, 'Episode deleted');
}
