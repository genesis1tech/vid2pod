import { describe, test, expect, vi, beforeEach } from 'vitest';

// Regression tests for the cross-tenant access (IDOR) fixes in episode-service.
// Each mutating/listing operation must verify that the target feed or episode
// belongs to the requesting user before doing anything. A different user's id
// must be rejected with NotFoundError and must NOT trigger any DB mutation.

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../src/db/client.js', () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock('../src/shared/logger.js', () => ({
  logger: { child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  })),
}));

vi.mock('../src/licensing/service.js', () => ({
  validateLicense: vi.fn(),
}));

import { NotFoundError } from '../src/shared/errors.js';
import {
  createEpisode, listEpisodes, updateEpisode, scheduleEpisode,
} from '../src/rss/episode-service.js';

const OWNER = 'user-owner';
const ATTACKER = 'user-attacker';

function selectChain(result: any[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

// Terminal .returning() resolves to the given rows; supports the
// db.update(...).set(...).where(...).returning() and
// db.insert(...).values(...).returning() shapes.
function writeChain(returnRows: any[]) {
  const returning = vi.fn().mockResolvedValue(returnRows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where, returning }));
  const values = vi.fn(() => ({ returning }));
  return { set, values, where, returning };
}

// A feed-ownership lookup returns { id } rows; an episode getEpisode lookup
// returns { episode, feedUserId } rows.
function ownedFeedRow() {
  return [{ id: 'feed-1' }];
}
function episodeRow(feedUserId: string) {
  return [{ episode: { id: 'episode-1', feedId: 'feed-1' }, feedUserId }];
}

beforeEach(() => {
  mockDb.select.mockReset();
  mockDb.insert.mockReset();
  mockDb.update.mockReset();
  mockDb.delete.mockReset();
});

describe('createEpisode ownership (IDOR)', () => {
  test('rejects creating an episode in a feed the user does not own and never inserts', async () => {
    // Feed-ownership lookup (feed id AND user id) returns nothing → not owned.
    mockDb.select.mockImplementationOnce(() => selectChain([]));

    await expect(
      createEpisode({ userId: ATTACKER, feedId: 'feed-1', title: 't', description: 'd' }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  test('allows the feed owner to create an episode', async () => {
    mockDb.select.mockImplementationOnce(() => selectChain(ownedFeedRow()));
    const inserted = [{ id: 'episode-1', feedId: 'feed-1', assetId: null }];
    mockDb.insert.mockImplementationOnce(() => writeChain(inserted));

    const result = await createEpisode({
      userId: OWNER, feedId: 'feed-1', title: 't', description: 'd',
    });

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(inserted[0]);
  });
});

describe('listEpisodes ownership (IDOR)', () => {
  test('rejects listing episodes of a feed the user does not own', async () => {
    mockDb.select.mockImplementationOnce(() => selectChain([]));

    await expect(listEpisodes(ATTACKER, 'feed-1')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('updateEpisode ownership (IDOR)', () => {
  test('rejects updating another user\'s episode and never updates', async () => {
    // getEpisode lookup returns an episode owned by OWNER, but ATTACKER asks.
    mockDb.select.mockImplementationOnce(() => selectChain(episodeRow(OWNER)));

    await expect(
      updateEpisode(ATTACKER, 'episode-1', { title: 'hacked' }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  test('allows the owner to update their episode', async () => {
    mockDb.select.mockImplementationOnce(() => selectChain(episodeRow(OWNER)));
    const updated = [{ id: 'episode-1', title: 'new' }];
    mockDb.update.mockImplementationOnce(() => writeChain(updated));

    const result = await updateEpisode(OWNER, 'episode-1', { title: 'new' });

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(result).toEqual(updated[0]);
  });
});

describe('scheduleEpisode ownership (IDOR)', () => {
  test('rejects scheduling another user\'s episode and never updates', async () => {
    mockDb.select.mockImplementationOnce(() => selectChain(episodeRow(OWNER)));

    await expect(
      scheduleEpisode(ATTACKER, 'episode-1', '2026-01-01T00:00:00Z'),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  test('allows the owner to schedule their episode', async () => {
    mockDb.select.mockImplementationOnce(() => selectChain(episodeRow(OWNER)));
    const updated = [{ id: 'episode-1', status: 'scheduled' }];
    mockDb.update.mockImplementationOnce(() => writeChain(updated));

    const result = await scheduleEpisode(OWNER, 'episode-1', '2026-01-01T00:00:00Z');

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(result).toEqual(updated[0]);
  });
});
