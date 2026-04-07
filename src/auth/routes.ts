import { FastifyInstance } from 'fastify';
import { register, login, getUser } from './service.js';
import { authMiddleware } from './middleware.js';
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
}
