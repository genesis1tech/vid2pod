import { FastifyInstance } from 'fastify';
import { register, login, getUser } from './service.js';
import { authMiddleware } from './middleware.js';
import { generateApiKey, hashApiKey } from './api-keys.js';
import { getDb } from '../db/client.js';
import { apiTokens } from '../db/schema.js';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1, 'Display name is required'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/register', async (request, reply) => {
    try {
      const body = registerSchema.parse(request.body);
      const result = await register(body.email, body.password, body.displayName);
      return reply.status(201).send(result);
    } catch (err: any) {
      if (err.statusCode) throw err; // AppError, let global handler do its job
      request.log.error({ err: err.message, stack: err.stack }, 'register failed');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: err.message || 'Registration failed',
      });
    }
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await login(body.email, body.password);
    return reply.status(200).send(result);
  });

  app.get('/api/v1/auth/me', {
    preHandler: [authMiddleware],
  }, async (request) => {
    return getUser(request.userId!);
  });

  // Generate an agent token. Called by the browser-based connect page
  // (which uses the user's existing JWT session) — NOT a direct browser GET.
  app.post('/api/v1/auth/agent-token', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const rawToken = generateApiKey();
    const tokenHash = hashApiKey(rawToken);
    const tokenPrefix = rawToken.slice(0, 12);

    const db = getDb();

    await db.insert(apiTokens).values({
      userId: request.userId!,
      name: 'ViddyPod Desktop Agent',
      tokenHash,
      tokenPrefix,
    });

    return reply.send({ token: rawToken });
  });
}
