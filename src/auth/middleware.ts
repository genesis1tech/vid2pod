import { FastifyRequest, FastifyReply } from 'fastify';
import { getAuth, clerkClient } from '@clerk/fastify';
import { getUserByClerkId, provisionUser } from './service.js';
import { UnauthorizedError, ForbiddenError } from '../shared/errors.js';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger('auth-middleware');

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    userEmail?: string;
    userRole?: string;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  // Test mode bypass: tokens in format "test_{userId}_{role}"
  if (process.env.NODE_ENV === 'test') {
    if (authHeader?.startsWith('Bearer test_')) {
      const parts = authHeader.slice(7).split('_');
      request.userId = parts.slice(1, -1).join('_');
      request.userRole = parts[parts.length - 1];
      request.userEmail = 'test@test.com';
      return;
    }
    throw new UnauthorizedError('Not authenticated');
  }

  // API key authentication (for ViddyPod Agent)
  if (authHeader?.startsWith('Bearer v2p_')) {
    const rawKey = authHeader.slice(7);
    const { hashApiKey } = await import('./api-keys.js');
    const { getDb } = await import('../db/client.js');
    const { apiKeys, users } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const db = getDb();

    const keyHash = hashApiKey(rawKey);
    const keyRows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
    if (keyRows.length === 0) {
      throw new UnauthorizedError('Invalid API key');
    }

    const userRows = await db.select().from(users).where(eq(users.id, keyRows[0].userId)).limit(1);
    if (userRows.length === 0) {
      throw new UnauthorizedError('User not found for API key');
    }

    // Update last used timestamp (fire and forget)
    db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyRows[0].id)).catch(() => {});

    request.userId = userRows[0].id;
    request.userEmail = userRows[0].email;
    request.userRole = userRows[0].role;
    return;
  }

  const auth = getAuth(request);

  if (!auth.userId) {
    throw new UnauthorizedError('Not authenticated');
  }

  // Look up local user by Clerk ID
  let localUser = await getUserByClerkId(auth.userId);

  // Just-in-time provisioning as fallback if webhook hasn't fired yet
  if (!localUser) {
    const clerkUser = await clerkClient.users.getUser(auth.userId);
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) {
      throw new UnauthorizedError('Clerk user has no email address');
    }
    const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;
    const result = await provisionUser(auth.userId, email, displayName);
    localUser = { id: result.id, clerkId: auth.userId, email, displayName, role: 'editor' };
    log.info({ clerkId: auth.userId, email }, 'User provisioned via JIT fallback');
  }

  request.userId = localUser.id;
  request.userEmail = localUser.email;
  request.userRole = localUser.role;
}

export function requireRole(...roles: string[]) {
  return (request: FastifyRequest) => {
    if (!request.userRole || !roles.includes(request.userRole)) {
      throw new ForbiddenError('Insufficient permissions');
    }
  };
}
