import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, apiFetch } from '../hooks/useAuth.js';
import { AddVideo } from './AddVideo.js';
import { EpisodeList } from './EpisodeList.js';
import { DownloadAgent } from './DownloadAgent.js';
import QRCode from 'qrcode';

export function Library() {
  const { user, token, feedUrl, logout } = useAuth();
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedCopied, setFeedCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrFeedUrl, setQrFeedUrl] = useState<string | null>(null);

  const refreshEpisodes = useCallback(async () => {
    if (!token) return;
    try {
      const feeds = await apiFetch<any[]>('/api/v1/feeds', token);
      if (feeds.length > 0) {
        const eps = await apiFetch<any[]>(`/api/v1/feeds/${feeds[0].id}/episodes`, token);
        setEpisodes(eps);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshEpisodes();
    // Poll every 10s to pick up newly processed episodes
    const interval = setInterval(refreshEpisodes, 10_000);
    return () => clearInterval(interval);
  }, [refreshEpisodes]);

  const copyFeedUrl = async () => {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setFeedCopied(true);
    setTimeout(() => setFeedCopied(false), 2000);
  };

  const toggleQr = async () => {
    if (!feedUrl) return;
    // Regenerate if feed URL changed
    if (!qrDataUrl || qrFeedUrl !== feedUrl) {
      const token = feedUrl.split('/feed/')[1]?.replace('.xml', '') || '';
      const apiBase = feedUrl.split('/feed/')[0];
      const subscribeUrl = `${apiBase}/subscribe/${token}`;
      const dataUrl = await QRCode.toDataURL(subscribeUrl, {
        width: 256,
        margin: 2,
        color: { dark: '#f1f5f9', light: '#1e293b' },
      });
      setQrDataUrl(dataUrl);
      setQrFeedUrl(feedUrl);
    }
    setShowQr(!showQr);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-(--color-border) px-4 py-3 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-bold text-(--color-primary)">ViddyPod</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-(--color-text-muted) hidden sm:inline">{user?.email}</span>
            <button onClick={logout} className="text-sm text-(--color-danger)">Sign out</button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-4 py-6 sm:px-6">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Feed URL banner */}
          {feedUrl && (
            <div className="card">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium mb-1">Your podcast feed</div>
                  <div className="text-xs sm:text-sm text-(--color-text-muted) truncate">{feedUrl}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={copyFeedUrl} className="btn btn-primary whitespace-nowrap text-sm">
                    {feedCopied ? 'Copied!' : 'Copy URL'}
                  </button>
                  <button onClick={toggleQr} className="btn btn-secondary whitespace-nowrap text-sm">
                    {showQr ? 'Hide QR' : 'QR Code'}
                  </button>
                </div>
              </div>
              {showQr && qrDataUrl && (
                <div className="mt-4 flex flex-col items-center gap-2 pt-4 border-t border-(--color-border)">
                  <img src={qrDataUrl} alt="Feed QR Code" className="w-48 h-48 sm:w-56 sm:h-56 rounded" />
                  <p className="text-xs text-(--color-text-muted) text-center max-w-xs">
                    Scan with your phone to subscribe in your podcast app
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Add video */}
          <DownloadAgent />
          <AddVideo onAdded={refreshEpisodes} />

          {/* Episode list */}
          <EpisodeList episodes={episodes} loading={loading} onRefresh={refreshEpisodes} />
        </div>
      </main>
    </div>
  );
}
