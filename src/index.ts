import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
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
