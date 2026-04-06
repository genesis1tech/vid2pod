import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { clerkPlugin } from '@clerk/fastify';
import { ZodError } from 'zod';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { getConfig } from './config.js';
import { createChildLogger } from './shared/logger.js';
import { AppError } from './shared/errors.js';
import { authRoutes } from './auth/routes.js';
import { licenseRoutes } from './licensing/routes.js';
import { ingestionRoutes } from './ingestion/routes.js';
import { feedRoutes } from './rss/routes.js';
import { startScheduler } from './rss/scheduler.js';

const log = createChildLogger('server');

export async function createServer() {
  const config = getConfig();
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } });

  // Clerk JWT verification plugin — only on API routes.
  // Feed, storage, subscribe, health, and static file routes must be publicly accessible.
  if (config.NODE_ENV !== 'test') {
    await app.register(clerkPlugin, { hookName: 'preHandler' });
    // Skip Clerk auth for public routes
    app.addHook('preHandler', (request, reply, done) => {
      const publicPrefixes = ['/feed/', '/storage/', '/subscribe/', '/health', '/api/v1/webhooks/'];
      const isPublic = publicPrefixes.some(p => request.url.startsWith(p))
        || request.url === '/'
        || request.url.startsWith('/assets/');
      if (isPublic) {
        // Clear Clerk auth state so it doesn't interfere
        (request as any).auth = undefined;
      }
      done();
    });
  }

  // Raw body support for webhook signature verification
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      (req as any).rawBody = body;
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.addHook('onRequest', (request, reply, done) => {
    log.info({ method: request.method, url: request.url }, 'Incoming request');
    done();
  });

  app.setErrorHandler((error: Error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code || 'ERROR',
        message: error.message,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }

    if ('validation' in error) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: error.message,
      });
    }

    log.error({ err: error.message }, 'Unhandled error');
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  await app.register(authRoutes);
  await app.register(licenseRoutes);
  await app.register(ingestionRoutes);
  await app.register(feedRoutes);

  // Serve built frontend in production
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webDir = resolve(__dirname, '../dist/web');
  if (existsSync(webDir)) {
    await app.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
      wildcard: false,
    });
    // SPA fallback — serve index.html for non-API, non-feed routes
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/feed/') || request.url.startsWith('/storage/') || request.url.startsWith('/subscribe/')) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  const stopScheduler = startScheduler();

  return { app, stopScheduler };
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  createServer().then(({ app }) => {
    const config = getConfig();
    app.listen({ port: config.PORT, host: '0.0.0.0' }, (err) => {
      if (err) {
        log.error({ err }, 'Failed to start server');
        process.exit(1);
      }
      log.info(`Server running on port ${config.PORT}`);
    });
  }).catch((err) => {
    log.error({ err }, 'Failed to create server');
    process.exit(1);
  });
}
