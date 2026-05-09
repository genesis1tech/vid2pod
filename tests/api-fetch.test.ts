import { describe, test, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../src/web/hooks/useAuth.js';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('does not send json content-type for bodyless requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await apiFetch('/api/v1/episodes/episode-1', 'token-1', { method: 'DELETE' });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/episodes/episode-1', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer token-1',
      },
    });
  });

  test('sends json content-type when a body is present', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await apiFetch('/api/v1/videos', 'token-1', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/watch?v=1' }),
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/videos', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/watch?v=1' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    });
  });
});
