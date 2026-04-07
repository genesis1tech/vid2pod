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
  displayName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const result = await register(body.email, body.password, body.displayName);
    return reply.status(201).send(result);
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

  // Agent OAuth callback — generates a token and redirects back to viddypod://callback
  // The user must already be logged in via the web UI (cookie-based session via JWT in querystring or auth header).
  // For desktop agent: agent opens this URL in browser, user logs in if needed, server issues token and redirects.
  app.get('/api/v1/auth/agent-callback', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { redirect } = request.query as { redirect?: string };
    if (!redirect || !redirect.startsWith('viddypod://')) {
      return reply.status(400).send({ error: 'Invalid redirect scheme' });
    }

    // Generate a long-lived token for the agent
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

    // Redirect to the desktop app's deep-link handler with the token
    const callbackUrl = `${redirect}?token=${encodeURIComponent(rawToken)}`;
    return reply.redirect(callbackUrl);
  });
}
