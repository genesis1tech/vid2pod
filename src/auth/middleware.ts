import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from './jwt.js';
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
