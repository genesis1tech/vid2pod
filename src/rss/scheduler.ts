import { getDb } from '../db/client.js';
import { episodes } from '../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';
import { publishEpisode } from './episode-service.js';
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

import { feeds } from '../db/schema.js';

export function startScheduler(intervalMs = 60000) {
  const timer = setInterval(processScheduledEpisodes, intervalMs);
  log.info({ intervalMs }, 'Scheduler started');
  return () => clearInterval(timer);
}
