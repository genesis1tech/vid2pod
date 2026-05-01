import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockDb = {
  select: vi.fn(),
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

vi.mock('../src/publishing/storage.js', () => ({
  deleteFile: vi.fn(),
  deletePodcastFile: vi.fn(),
}));

import { deleteFile, deletePodcastFile } from '../src/publishing/storage.js';
import { deleteEpisode } from '../src/rss/episode-service.js';

function createSelectChain(result: any[]) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    orderBy: vi.fn().mockReturnThis(),
  };
  return chain;
}

function createDeleteChain(behavior: 'resolve' | 'reject' = 'resolve') {
  return {
    where: vi.fn().mockImplementation(() => {
      if (behavior === 'reject') {
        return Promise.reject(new Error('cleanup failed'));
      }
      return Promise.resolve();
    }),
  };
}

describe('deleteEpisode', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
    mockDb.delete.mockReset();
    vi.mocked(deleteFile).mockReset();
    vi.mocked(deletePodcastFile).mockReset();
  });

  test('succeeds even when linked asset cleanup fails after deleting the episode row', async () => {
    mockDb.select
      .mockImplementationOnce(() => createSelectChain([
        {
          episode: {
            id: 'episode-1',
            feedId: 'feed-1',
            assetId: 'asset-1',
          },
          feedUserId: 'user-1',
        },
      ]))
      .mockImplementationOnce(() => createSelectChain([]))
      .mockImplementationOnce(() => createSelectChain([
        {
          id: 'asset-1',
          storageKey: 'assets/user-1/asset-1/source.webm',
          metadata: null,
        },
      ]));

    mockDb.delete
      .mockImplementationOnce(() => createDeleteChain('resolve'))
      .mockImplementationOnce(() => createDeleteChain('resolve'))
      .mockImplementationOnce(() => createDeleteChain('reject'));

    await expect(deleteEpisode('user-1', 'episode-1')).resolves.toBeUndefined();

    expect(mockDb.delete).toHaveBeenCalledTimes(3);
  });

  test('deletes a single-use linked asset and best-effort storage objects', async () => {
    mockDb.select
      .mockImplementationOnce(() => createSelectChain([
        {
          episode: {
            id: 'episode-1',
            feedId: 'feed-1',
            assetId: 'asset-1',
            enclosureUrl: 'https://example.com/storage/processed/user-1/asset-1/episode.mp3',
            imageUrl: 'https://example.com/storage/thumbnails/user-1/asset-1.jpg',
          },
          feedUserId: 'user-1',
        },
      ]))
      .mockImplementationOnce(() => createSelectChain([]))
      .mockImplementationOnce(() => createSelectChain([
        {
          id: 'asset-1',
          storageKey: 'assets/user-1/asset-1/source.webm',
          metadata: {
            processedKey: 'processed/user-1/asset-1/episode.mp3',
          },
        },
      ]));

    mockDb.delete.mockImplementation(() => createDeleteChain('resolve'));
    vi.mocked(deleteFile).mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(deleteEpisode('user-1', 'episode-1')).resolves.toBeUndefined();

    expect(mockDb.delete).toHaveBeenCalledTimes(5);
    expect(deleteFile).toHaveBeenCalledWith('assets/user-1/asset-1/source.webm');
    expect(deletePodcastFile).toHaveBeenCalledTimes(2);
    expect(deletePodcastFile).toHaveBeenCalledWith('processed/user-1/asset-1/episode.mp3');
    expect(deletePodcastFile).toHaveBeenCalledWith('thumbnails/user-1/asset-1.jpg');
  });
});
