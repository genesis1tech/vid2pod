import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/index.js';
import type { FastifyInstance } from 'fastify';
import { createTestToken } from './setup.js';

// Mock the DB and queue so we don't need real infrastructure
vi.mock('../src/db/client.js', () => {
  // Chainable mock that tracks calls
  function createChainableMock(resolvedValue: any = []) {
    const chain: any = {};
    const methods = ['select', 'insert', 'update', 'delete', 'from', 'where', 'limit',
      'set', 'values', 'returning', 'orderBy', 'innerJoin', 'leftJoin'];
    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    // Terminal methods return the resolved value
    chain.limit = vi.fn().mockResolvedValue(resolvedValue);
    chain.returning = vi.fn().mockResolvedValue(resolvedValue);
    chain.where = vi.fn().mockReturnValue(chain);
    // Make limit also chainable when needed
    return chain;
  }

  const mockDb = createChainableMock();
  return {
    getDb: vi.fn(() => mockDb),
    __mockDb: mockDb,
  };
});

vi.mock('../src/processing/jobs.js', () => ({
  PROCESSING_QUEUE: 'test-queue',
  getProcessingQueue: vi.fn(),
  enqueueProcessingJob: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
  processAsset: vi.fn(),
}));

vi.mock('../src/shared/logger.js', () => ({
  logger: { child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }) },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(),
    child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  })),
}));

let app: FastifyInstance;
let stopScheduler: () => void;
let token: string;

beforeAll(async () => {
  token = await createTestToken('test-user-id', 'editor');
  const server = await createServer();
  app = server.app;
  stopScheduler = server.stopScheduler;
  await app.ready();
});

afterAll(async () => {
  stopScheduler();
  await app.close();
});

describe('POST /api/v1/videos', () => {
  test('rejects request without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/videos',
      payload: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    expect(res.statusCode).toBe(401);
  });

  test('rejects invalid YouTube URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/videos',
      headers: { authorization: `Bearer ${token}` },
      payload: { url: 'not-a-url' },
    });
    // Zod validation will reject non-URL strings
    expect(res.statusCode).toBe(400);
  });

  test('rejects non-YouTube URL', async () => {
    const { getDb } = await import('../src/db/client.js');
    const mockDb = (getDb as any)();

    // Mock: user's personal feed exists
    mockDb.limit.mockResolvedValueOnce([{
      id: 'feed-1',
      userId: 'test-user-id',
      ownershipToken: 'abc123',
    }]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/videos',
      headers: { authorization: `Bearer ${token}` },
      payload: { url: 'https://example.com/some-video' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toContain('Invalid YouTube URL');
  });
});
