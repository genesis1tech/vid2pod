import { useState, useEffect } from 'react';
import { useAuth, apiFetch } from './useAuth.js';

export function useAssets() {
  const { token } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data: any[] = await apiFetch('/api/v1/assets', token);
      setAssets(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [token]);

  const uploadAsset = async (file: File, licenseId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('licenseId', licenseId);

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
    return apiFetch(`/api/v1/assets/${id}/process`, token, { method: 'POST' });
  };

  return { assets, loading, refresh, uploadAsset, processAsset };
}
