import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from './jwt.js';
import { hashApiKey } from './api-keys.js';
import { getDb } from '../db/client.js';
import { apiTokens, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
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
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);

  // Agent tokens start with v2p_ — look up in api_tokens table
  if (token.startsWith('v2p_')) {
    const db = getDb();
    const tokenHash = hashApiKey(token);
    const tokenRows = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash)).limit(1);
    if (tokenRows.length === 0) {
      throw new UnauthorizedError('Invalid agent token');
    }
    const userRows = await db.select().from(users).where(eq(users.id, tokenRows[0].userId)).limit(1);
    if (userRows.length === 0) {
      throw new UnauthorizedError('User not found for token');
    }
    // Update last used + agent last seen (fire and forget)
    db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, tokenRows[0].id)).catch(() => {});
    db.update(users).set({ agentLastSeen: new Date() }).where(eq(users.id, userRows[0].id)).catch(() => {});

    request.userId = userRows[0].id;
    request.userEmail = userRows[0].email;
    request.userRole = userRows[0].role;
    return;
  }

  // Regular JWT (web users)
  try {
    const payload = await verifyToken(token);
    request.userId = payload.sub;
    request.userEmail = payload.email;
    request.userRole = payload.role;
  } catch (err) {
    log.debug({ err }, 'Token verification failed');
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function requireRole(...roles: string[]) {
  return (request: FastifyRequest) => {
    if (!request.userRole || !roles.includes(request.userRole)) {
      throw new ForbiddenError('Insufficient permissions');
    }
  };
}
