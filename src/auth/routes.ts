import { FastifyInstance } from 'fastify';
import { Webhook } from 'svix';
import { provisionUser, getUser } from './service.js';
import { authMiddleware } from './middleware.js';
import { getConfig } from '../config.js';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger('auth-routes');

interface ClerkWebhookUserData {
  id: string;
  email_addresses: Array<{ email_address: string }>;
  first_name: string | null;
  last_name: string | null;
}

export async function authRoutes(app: FastifyInstance) {
  // Clerk webhook — provisions local user + feed on signup
  app.post('/api/v1/webhooks/clerk', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const config = getConfig();
    const webhookSecret = config.CLERK_WEBHOOK_SECRET;

    if (!webhookSecret) {
      log.error('CLERK_WEBHOOK_SECRET not configured');
      return reply.status(500).send({ error: 'Webhook not configured' });
    }

    const svixId = request.headers['svix-id'] as string;
    const svixTimestamp = request.headers['svix-timestamp'] as string;
    const svixSignature = request.headers['svix-signature'] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      return reply.status(400).send({ error: 'Missing svix headers' });
    }

    const wh = new Webhook(webhookSecret);
    let event: { type: string; data: ClerkWebhookUserData };

    try {
      const body = (request as any).rawBody || JSON.stringify(request.body);
      event = wh.verify(body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as typeof event;
    } catch (err) {
      log.warn({ err }, 'Clerk webhook verification failed');
      return reply.status(400).send({ error: 'Invalid webhook signature' });
    }

    if (event.type === 'user.created') {
      const data = event.data;
      const email = data.email_addresses?.[0]?.email_address;
      if (!email) {
        log.warn({ clerkId: data.id }, 'Clerk user.created event has no email');
        return reply.status(200).send({ ok: true, message: 'No email, skipped' });
      }

      const displayName = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;
      await provisionUser(data.id, email, displayName);

      log.info({ clerkId: data.id, email }, 'User provisioned via webhook');
    }

    return reply.status(200).send({ ok: true });
  });

  // Get current user profile
  app.get('/api/v1/auth/me', {
    preHandler: [authMiddleware],
  }, async (request) => {
    return getUser(request.userId!);
  });

  // Generate a long-lived agent token for the ViddyPod Agent
  app.post('/api/v1/auth/agent-token', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { getDb } = await import('../db/client.js');
    const { users } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const db = getDb();

    const userRows = await db.select({ id: users.id, email: users.email })
      .from(users).where(eq(users.id, request.userId!)).limit(1);
    if (userRows.length === 0) throw new Error('User not found');

    const config = (await import('../config.js')).getConfig();

    // Return connection info for the agent
    return {
      server: config.BASE_URL,
      userId: userRows[0].id,
      email: userRows[0].email,
    };
  });

  // Save YouTube cookies for the current user
  app.post('/api/v1/auth/youtube-cookies', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { cookies } = request.body as { cookies: string };
    if (!cookies || typeof cookies !== 'string' || cookies.trim().length < 10) {
      return reply.status(400).send({ error: 'Invalid cookies content' });
    }

    const { getDb } = await import('../db/client.js');
    const { users } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const db = getDb();

    await db.update(users)
      .set({ youtubeCookies: cookies.trim(), updatedAt: new Date() })
      .where(eq(users.id, request.userId!));

    log.info({ userId: request.userId }, 'YouTube cookies saved');
    return reply.send({ ok: true });
  });

  // Check if user has YouTube cookies configured
  app.get('/api/v1/auth/youtube-cookies/status', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { getDb } = await import('../db/client.js');
    const { users } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const db = getDb();

    const rows = await db.select({ youtubeCookies: users.youtubeCookies })
      .from(users).where(eq(users.id, request.userId!)).limit(1);

    return { connected: !!(rows[0]?.youtubeCookies) };
  });

  // Clear YouTube cookies
  app.delete('/api/v1/auth/youtube-cookies', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { getDb } = await import('../db/client.js');
    const { users } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const db = getDb();

    await db.update(users)
      .set({ youtubeCookies: null, updatedAt: new Date() })
      .where(eq(users.id, request.userId!));

    return reply.send({ ok: true });
  });
}
