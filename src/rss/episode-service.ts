import { getDb } from '../db/client.js';
import { episodes, assets, feeds } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { createChildLogger } from '../shared/logger.js';
import { NotFoundError, ValidationError, LicenseError } from '../shared/errors.js';
import { validateLicense } from '../licensing/service.js';
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
  const rows = await db.select().from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1);
  if (rows.length === 0) throw new NotFoundError('Episode');
  return rows[0];
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

  if (episode.assetId) {
    const assetRows = await db.select().from(assets).where(eq(assets.id, episode.assetId)).limit(1);
    if (assetRows.length > 0) {
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
  await db.delete(episodes).where(eq(episodes.id, episodeId));
  log.info({ episodeId }, 'Episode deleted');
}
