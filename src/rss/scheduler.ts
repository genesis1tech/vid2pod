import { getDb } from '../db/client.js';
import { episodes, feeds } from '../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';
import { publishEpisode } from './episode-service.js';
import { deletePodcastFile } from '../publishing/storage.js';
import { getConfig } from '../config.js';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger('scheduler');

export async function processScheduledEpisodes() {
  const db = getDb();
  const now = new Date();

  const scheduledEpisodes = await db.select().from(episodes)
    .where(and(
      eq(episodes.status, 'scheduled'),
      lte(episodes.scheduledAt, now),
    ));

  for (const episode of scheduledEpisodes) {
    try {
      const feedRows = await db.select().from(feeds).where(eq(feeds.id, episode.feedId)).limit(1);
      if (feedRows.length === 0) continue;

      await publishEpisode(feedRows[0].userId, episode.id);
      log.info({ episodeId: episode.id }, 'Scheduled episode auto-published');
    } catch (err) {
      log.error({ err, episodeId: episode.id }, 'Failed to auto-publish scheduled episode');
    }
  }
}

export async function cleanupExpiredStorage() {
  const db = getDb();
  const now = new Date();

  // Find episodes whose storage expiry has passed and haven't been cleared yet
  const expiredEpisodes = await db.select().from(episodes)
    .where(and(
      eq(episodes.storageCleared, false),
      lte(episodes.storageExpiry, now),
    ));

  for (const episode of expiredEpisodes) {
    try {
      // Extract storage key from enclosure URL
      if (episode.enclosureUrl) {
        const storageKey = episode.enclosureUrl.split('/storage/')[1];
        if (storageKey) {
          await deletePodcastFile(storageKey);
          log.info({ episodeId: episode.id, storageKey }, 'Expired audio deleted from S3');
        }
      }

      await db.update(episodes)
        .set({
          storageCleared: true,
          updatedAt: now,
        })
        .where(eq(episodes.id, episode.id));
    } catch (err) {
      log.error({ err, episodeId: episode.id }, 'Failed to cleanup expired storage');
    }
  }

  if (expiredEpisodes.length > 0) {
    log.info({ count: expiredEpisodes.length }, 'Storage cleanup complete');
  }
}

export function startScheduler(intervalMs?: number) {
  const config = getConfig();
  const interval = intervalMs ?? config.POLL_INTERVAL_MS;

  const tick = async () => {
    await processScheduledEpisodes();
    await cleanupExpiredStorage();
  };

  const timer = setInterval(tick, interval);
  log.info({ intervalMs: interval }, 'Scheduler started');
  return () => clearInterval(timer);
}
