import { useState, useEffect, useCallback } from 'react';
import { useAuth, apiFetch } from './useAuth.js';

export function useAssets() {
  const { getToken } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const data: any[] = await apiFetch('/api/v1/assets', token);
      setAssets(data);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { refresh(); }, [refresh]);

  const uploadAsset = async (file: File, licenseId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('licenseId', licenseId);

    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/v1/assets/upload', {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: 'Upload failed' })) as { message?: string };
      throw new Error(body.message || 'Upload failed');
    }
    await refresh();
    return res.json();
  };

  const processAsset = async (id: string) => {
    const token = await getToken();
    return apiFetch(`/api/v1/assets/${id}/process`, token, { method: 'POST' });
  };

  return { assets, loading, refresh, uploadAsset, processAsset };
}
