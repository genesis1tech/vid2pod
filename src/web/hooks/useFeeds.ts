import { useState, useEffect, useCallback } from 'react';
import { useAuth, apiFetch } from './useAuth.js';

export function useFeeds() {
  const { getToken } = useAuth();
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const data: any[] = await apiFetch('/api/v1/feeds', token);
      setFeeds(data);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { refresh(); }, [refresh]);

  const createFeed = async (params: any) => {
    const token = await getToken();
    const feed = await apiFetch<any>('/api/v1/feeds', token, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    await refresh();
    return feed;
  };

  const deleteFeed = async (id: string) => {
    const token = await getToken();
    await apiFetch(`/api/v1/feeds/${id}`, token, { method: 'DELETE' });
    await refresh();
  };

  return { feeds, loading, refresh, createFeed, deleteFeed };
}
