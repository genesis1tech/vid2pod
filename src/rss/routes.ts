import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/middleware.js';
import { enqueueProcessingJob } from '../processing/jobs.js';
import {
  createFeed, listFeeds, getFeed, updateFeed, deleteFeed, regenerateFeed,
} from './feed-service.js';
import {
  createEpisode, listEpisodes, getEpisode, updateEpisode,
  publishEpisode, scheduleEpisode, deleteEpisode,
} from './episode-service.js';
import { serveFeed } from '../publishing/feed-server.js';
import { getPodcastFile, getPodcastFileInfo } from '../publishing/storage.js';
import { getDb } from '../db/client.js';
import { episodes } from '../db/schema.js';
import { eq, and, isNull, like, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getConfig } from '../config.js';
import { PODCAST_CATEGORIES } from '../shared/constants.js';
import { createChildLogger } from '../shared/logger.js';

const storageLog = createChildLogger('storage-proxy');

const createFeedSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  author: z.string().min(1),
  email: z.string().email().optional(),
  websiteUrl: z.string().url().optional(),
  language: z.string().default('en'),
  categoryPrimary: z.string(),
  categorySecondary: z.string().optional(),
  explicit: z.boolean().default(false),
  feedType: z.enum(['episodic', 'serial']).default('episodic'),
  visibility: z.enum(['public', 'unlisted', 'private']).default('private'),
  authType: z.enum(['none', 'basic_auth', 'token']).optional(),
  authUsername: z.string().optional(),
  authPassword: z.string().optional(),
});

const createEpisodeSchema = z.object({
  assetId: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  subtitle: z.string().optional(),
  seasonNumber: z.number().int().optional(),
  episodeNumber: z.number().int().optional(),
  episodeType: z.enum(['full', 'trailer', 'bonus']).default('full'),
  explicit: z.boolean().default(false),
  scheduledAt: z.string().optional(),
});

const updateEpisodeSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  subtitle: z.string().optional(),
  description: z.string().min(1).optional(),
  seasonNumber: z.number().int().optional(),
  episodeNumber: z.number().int().optional(),
  episodeType: z.enum(['full', 'trailer', 'bonus']).optional(),
  explicit: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function feedRoutes(app: FastifyInstance) {
  app.post('/api/v1/feeds', { preHandler: [authMiddleware] }, async (request, reply) => {
    const body = createFeedSchema.parse(request.body);
    const feed = await createFeed({ userId: request.userId!, ...body });
    return reply.status(201).send(feed);
  });

  app.get('/api/v1/feeds', { preHandler: [authMiddleware] }, async (request) => {
    return listFeeds(request.userId!);
  });

  app.get('/api/v1/feeds/:id', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    return getFeed(request.userId!, id);
  });

  app.patch('/api/v1/feeds/:id', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;
    return updateFeed(request.userId!, id, body);
  });

  app.delete('/api/v1/feeds/:id', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    await deleteFeed(request.userId!, id);
    return { ok: true };
  });

  app.post('/api/v1/feeds/:id/regenerate', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    const xml = await regenerateFeed(request.userId!, id);
    return { xml };
  });

  app.get('/api/v1/feeds/:id/xml', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    const xml = await regenerateFeed(request.userId!, id);
    return xml;
  });

  app.post('/api/v1/feeds/:feedId/episodes', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { feedId } = request.params as { feedId: string };
    const body = createEpisodeSchema.parse(request.body);
    const episode = await createEpisode({ feedId, ...body });
    return reply.status(201).send(episode);
  });

  app.get('/api/v1/feeds/:feedId/episodes', { preHandler: [authMiddleware] }, async (request) => {
    const { feedId } = request.params as { feedId: string };
    return listEpisodes(feedId);
  });

  app.get('/api/v1/episodes/:id', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    return getEpisode(request.userId!, id);
  });

  app.patch('/api/v1/episodes/:id', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateEpisodeSchema.parse(request.body);
    return updateEpisode(request.userId!, id, body);
  });

  app.delete('/api/v1/episodes/:id', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    await deleteEpisode(request.userId!, id);
    return { ok: true };
  });

  app.post('/api/v1/episodes/:id/publish', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    return publishEpisode(request.userId!, id);
  });

  app.post('/api/v1/episodes/:id/schedule', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    const { scheduledAt } = request.body as { scheduledAt: string };
    return scheduleEpisode(request.userId!, id, scheduledAt);
  });

  app.post('/api/v1/assets/:id/process', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    const job = await enqueueProcessingJob({
      assetId: id,
      userId: request.userId!,
    });
    return { jobId: job.id, status: 'queued' };
  });

  // Subscribe landing page — detects platform and deep-links to podcast app
  app.get('/subscribe/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const feedUrl = `${getConfig().BASE_URL}/feed/${token}.xml`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscribe to Podcast</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f1f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .container { max-width: 400px; width: 100%; text-align: center; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
    .apps { display: flex; flex-direction: column; gap: 12px; }
    a.btn { display: block; padding: 14px 20px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; transition: opacity 0.15s; }
    a.btn:hover { opacity: 0.85; }
    .apple { background: #a855f7; color: white; }
    .pcast { background: #3b82f6; color: white; }
    .overcast { background: #fc7e0f; color: white; }
    .pocketcasts { background: #f43e37; color: white; }
    .copy { background: #1e293b; color: #f1f5f9; border: 1px solid #334155; cursor: pointer; }
    .divider { color: #475569; font-size: 12px; margin: 16px 0; }
    .feed-url { font-size: 11px; color: #64748b; word-break: break-all; margin-top: 16px; }
    #copied { display: none; color: #22c55e; font-size: 13px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Vid2Pod</h1>
    <p>Subscribe to your personal podcast feed</p>
    <div class="apps">
      <a class="btn apple" href="podcast://${feedUrl.replace(/^https?:\/\//, '')}">Open in Apple Podcasts</a>
      <a class="btn overcast" href="overcast://x-callback-url/add?url=${encodeURIComponent(feedUrl)}">Open in Overcast</a>
      <a class="btn pocketcasts" href="pktc://subscribe/${encodeURIComponent(feedUrl)}">Open in Pocket Casts</a>
      <a class="btn pcast" href="pcast://${feedUrl.replace(/^https?:\/\//, '')}">Open in Other Podcast App</a>
      <div class="divider">or</div>
      <a class="btn copy" id="copyBtn" href="#">Copy Feed URL</a>
      <div id="copied">Copied!</div>
    </div>
    <div class="feed-url">${feedUrl}</div>
  </div>
  <script>
    // Auto-redirect based on platform
    (function() {
      var ua = navigator.userAgent;
      var feedUrl = ${JSON.stringify(feedUrl)};
      var isIOS = /iPhone|iPad|iPod/.test(ua);
      var isAndroid = /Android/.test(ua);

      if (isIOS) {
        // Try Apple Podcasts via podcast:// scheme
        window.location.href = 'podcast://' + feedUrl.replace(/^https?:\\/\\//, '');
      } else if (isAndroid) {
        // Try pcast:// which many Android podcast apps handle
        window.location.href = 'pcast://' + feedUrl.replace(/^https?:\\/\\//, '');
      }
    })();

    document.getElementById('copyBtn').addEventListener('click', function(e) {
      e.preventDefault();
      navigator.clipboard.writeText(${JSON.stringify(feedUrl)}).then(function() {
        document.getElementById('copied').style.display = 'block';
        setTimeout(function() { document.getElementById('copied').style.display = 'none'; }, 2000);
      });
    });
  </script>
</body>
</html>`;

    reply.type('text/html; charset=utf-8');
    return html;
  });

  app.get('/feed/:token.xml', async (request, reply) => {
    const { token } = request.params as { token: string };
    const authHeader = request.headers.authorization;
    const xml = await serveFeed(
      token,
      authHeader,
      request.ip,
      request.headers['user-agent'],
    );
    reply.type('application/rss+xml; charset=utf-8');
    return xml;
  });

  // Stream audio files from podcast bucket — no auth (security via unguessable UUID paths)
  app.get('/storage/*', async (request, reply) => {
    const key = (request.params as any)['*'];
    if (!key) {
      return reply.status(400).send({ error: 'Missing file key' });
    }

    try {
      const range = request.headers.range;

      if (range) {
        // Partial content — podcast apps use this to seek and resume
        const result = await getPodcastFile(key, range);
        reply
          .status(206)
          .header('Content-Type', result.ContentType || 'audio/mpeg')
          .header('Content-Length', result.ContentLength!)
          .header('Content-Range', result.ContentRange!)
          .header('Accept-Ranges', 'bytes')
          .header('Cache-Control', 'public, max-age=86400');
        return reply.send(result.Body);
      }

      // Full file download — flag episode for 7-day storage expiry
      const head = await getPodcastFileInfo(key);
      const result = await getPodcastFile(key);

      // Mark first download on matching episode (fire-and-forget)
      flagFirstDownload(key).catch((err) =>
        storageLog.warn({ err, key }, 'Failed to flag first download')
      );

      reply
        .status(200)
        .header('Content-Type', head.ContentType || 'audio/mpeg')
        .header('Content-Length', head.ContentLength!)
        .header('Accept-Ranges', 'bytes')
        .header('Cache-Control', 'public, max-age=86400');
      return reply.send(result.Body);
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return reply.status(404).send({ error: 'File not found' });
      }
      throw err;
    }
  });
}

const STORAGE_TTL_DAYS = 7;

async function flagFirstDownload(storageKey: string): Promise<void> {
  const db = getDb();

  const now = new Date();
  const expiry = new Date(now.getTime() + STORAGE_TTL_DAYS * 24 * 60 * 60 * 1000);

  // Single query: find episodes matching this storage key that haven't been flagged
  const matchingEpisodes = await db.select({ id: episodes.id })
    .from(episodes)
    .where(
      and(
        eq(episodes.storageCleared, false),
        isNull(episodes.firstDownloadedAt),
        like(episodes.enclosureUrl, `%/storage/${storageKey}`),
      )
    );

  if (matchingEpisodes.length === 0) return;

  const ids = matchingEpisodes.map(ep => ep.id);
  await db.update(episodes)
    .set({
      firstDownloadedAt: now,
      storageExpiry: expiry,
      updatedAt: now,
    })
    .where(inArray(episodes.id, ids));

  storageLog.info({ episodeIds: ids, storageExpiry: expiry.toISOString() },
    'Episodes flagged for storage cleanup in 7 days');
}
