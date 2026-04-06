import { useState, useEffect } from 'react';
import { useAuth, apiFetch } from '../hooks/useAuth.js';

export function YouTubeSetup() {
  const { getToken } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [cookies, setCookies] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const checkStatus = async () => {
    try {
      const token = await getToken();
      const res = await apiFetch<{ connected: boolean }>('/api/v1/auth/youtube-cookies/status', token);
      setConnected(res.connected);
    } catch {
      setConnected(false);
    }
  };

  useEffect(() => { checkStatus(); }, []);

  const handleSave = async () => {
    if (!cookies.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const token = await getToken();
      await apiFetch('/api/v1/auth/youtube-cookies', token, {
        method: 'POST',
        body: JSON.stringify({ cookies: cookies.trim() }),
      });
      setMessage({ type: 'success', text: 'YouTube cookies saved! Videos should now download successfully.' });
      setConnected(true);
      setCookies('');
      setExpanded(false);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      const token = await getToken();
      await apiFetch('/api/v1/auth/youtube-cookies', token, { method: 'DELETE' });
      setConnected(false);
      setMessage({ type: 'success', text: 'YouTube cookies cleared.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  if (connected === null) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-(--color-success)' : 'bg-(--color-danger)'}`} />
          <span className="font-medium text-sm">
            {connected ? 'YouTube Connected' : 'YouTube Setup Required'}
          </span>
        </div>
        <div className="flex gap-2">
          {connected && (
            <button onClick={handleClear} className="text-xs text-(--color-text-muted) hover:text-(--color-danger)">
              Disconnect
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-(--color-primary)"
          >
            {expanded ? 'Hide' : connected ? 'Update' : 'Setup'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mt-3 text-sm px-3 py-2 rounded ${
          message.type === 'success'
            ? 'bg-(--color-success)/20 text-(--color-success)'
            : 'bg-(--color-danger)/20 text-(--color-danger)'
        }`}>
          {message.text}
        </div>
      )}

      {expanded && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-(--color-text-muted)">
            YouTube requires authentication to download videos from a server.
            Follow these steps to connect your YouTube account:
          </p>

          <ol className="text-sm space-y-2 text-(--color-text-muted)">
            <li className="flex gap-2">
              <span className="font-bold text-(--color-primary)">1.</span>
              <span>
                Install the{' '}
                <a
                  href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-(--color-primary) underline"
                >
                  Get cookies.txt LOCALLY
                </a>
                {' '}browser extension
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-(--color-primary)">2.</span>
              <span>
                Go to{' '}
                <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="text-(--color-primary) underline">
                  youtube.com
                </a>
                , make sure you're signed in, then click the extension icon and export cookies
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-(--color-primary)">3.</span>
              <span>Paste the cookie content below and click Save</span>
            </li>
          </ol>

          <textarea
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            placeholder="# Netscape HTTP Cookie File&#10;# Paste your cookies.txt content here..."
            rows={6}
            className="w-full text-xs font-mono"
          />

          <button
            onClick={handleSave}
            disabled={saving || !cookies.trim()}
            className="btn btn-primary text-sm"
          >
            {saving ? 'Saving...' : 'Save Cookies'}
          </button>
        </div>
      )}
    </div>
  );
}
