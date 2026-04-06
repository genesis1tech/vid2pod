import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/index.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let stopScheduler: () => void;

beforeAll(async () => {
  const server = await createServer();
  app = server.app;
  stopScheduler = server.stopScheduler;
  await app.ready();
});

afterAll(async () => {
  stopScheduler();
  await app.close();
});

describe('Server', () => {
  test('health endpoint returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  test('unknown route returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});
