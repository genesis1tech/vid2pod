import { useState, useEffect } from 'react';
import { useAuth, apiFetch } from './useAuth.js';

export function useFeeds() {
  const { token } = useAuth();
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data: any[] = await apiFetch('/api/v1/feeds', token);
      setFeeds(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [token]);

  const createFeed = async (params: any) => {
    const feed = await apiFetch<any>('/api/v1/feeds', token, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    await refresh();
    return feed;
  };

  const deleteFeed = async (id: string) => {
    await apiFetch(`/api/v1/feeds/${id}`, token, { method: 'DELETE' });
    await refresh();
  };

  return { feeds, loading, refresh, createFeed, deleteFeed };
}
