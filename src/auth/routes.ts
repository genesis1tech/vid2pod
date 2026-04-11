import { FastifyInstance } from 'fastify';
import { register, login, getUser } from './service.js';
import { authMiddleware } from './middleware.js';
import { generateApiKey, hashApiKey } from './api-keys.js';
import { getDb } from '../db/client.js';
import { apiTokens } from '../db/schema.js';
import { sql } from 'drizzle-orm';
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

  // One-time password reset (remove after use)
  app.post('/api/v1/auth/reset-password', async (request, reply) => {
    const { email, newPassword, secret } = request.body as { email: string; newPassword: string; secret: string };
    if (secret !== 'viddypod-reset-2026') {
      return reply.status(403).send({ error: 'Invalid secret' });
    }
    if (!email || !newPassword || newPassword.length < 8) {
      return reply.status(400).send({ error: 'Email and password (min 8 chars) required' });
    }
    const { hash } = await import('bcrypt');
    const { getDb } = await import('../db/client.js');
    const { users } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const db = getDb();
    const passwordHash = await hash(newPassword, 10);
    const result = await db.update(users).set({ passwordHash }).where(eq(users.email, email));
    return reply.send({ ok: true, message: 'Password updated' });
  });

  // Generate an agent token. Called by the browser-based connect page
  // (which uses the user's existing JWT session) — NOT a direct browser GET.
  app.post('/api/v1/auth/agent-token', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    try {
      const rawToken = generateApiKey();
      const tokenHash = hashApiKey(rawToken);
      const tokenPrefix = rawToken.slice(0, 12);

      const db = getDb();

      // Self-healing migration: ensure the table exists.
      // This is a no-op if start.sh already ran the migration.
      try {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS api_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            token_prefix TEXT NOT NULL,
            last_used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_last_seen TIMESTAMPTZ`);
      } catch (migErr: any) {
        request.log.warn({ migErr: migErr.message }, 'Self-heal migration failed (may already exist)');
      }

      await db.insert(apiTokens).values({
        userId: request.userId!,
        name: 'ViddyPod Desktop Agent',
        tokenHash,
        tokenPrefix,
      });

      return reply.send({ token: rawToken });
    } catch (err: any) {
      request.log.error({ err: err.message, stack: err.stack }, 'agent-token failed');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
        detail: err.code || err.name,
      });
    }
  });
}
