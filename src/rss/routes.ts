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
import { z } from 'zod';
import { PODCAST_CATEGORIES } from '../shared/constants.js';

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

  app.get('/feed/:token.xml', async (request, reply) => {
    const { token } = request.params as { token: string };
    const authHeader = request.headers.authorization;
    const xml = await serveFeed(
      token,
      authHeader,
      request.ip,
      request.headers['user-agent'],
    );
    reply.type('application/xml; charset=utf-8');
    return xml;
  });
}
