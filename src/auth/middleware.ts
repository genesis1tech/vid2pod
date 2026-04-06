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
  // Test mode bypass: tokens in format "test_{userId}_{role}"
  if (process.env.NODE_ENV === 'test') {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer test_')) {
      const parts = authHeader.slice(7).split('_');
      request.userId = parts.slice(1, -1).join('_');
      request.userRole = parts[parts.length - 1];
      request.userEmail = 'test@test.com';
      return;
    }
    throw new UnauthorizedError('Not authenticated');
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
