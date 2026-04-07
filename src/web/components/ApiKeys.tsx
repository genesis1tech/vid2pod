import { useState, useEffect } from 'react';
import { useAuth, apiFetch } from '../hooks/useAuth.js';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export function ApiKeys() {
  const { getToken } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [newKeyName, setNewKeyName] = useState('ViddyPod Agent');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    try {
      const token = await getToken();
      const data = await apiFetch<ApiKey[]>('/api/v1/auth/api-keys', token);
      setKeys(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const createKey = async () => {
    setCreating(true);
    try {
      const token = await getToken();
      const result = await apiFetch<{ key: string }>('/api/v1/auth/api-keys', token, {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName }),
      });
      setNewKey(result.key);
      setNewKeyName('ViddyPod Agent');
      await refresh();
    } catch (err: any) {
      console.error('Failed to create key:', err.message);
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Delete this API key? The agent using it will stop working.')) return;
    try {
      const token = await getToken();
      await apiFetch(`/api/v1/auth/api-keys/${id}`, token, { method: 'DELETE' });
      await refresh();
    } catch (err: any) {
      console.error('Failed to delete key:', err.message);
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const agentConnected = keys.some(k => k.lastUsedAt && (Date.now() - new Date(k.lastUsedAt).getTime()) < 2 * 60 * 1000);

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${agentConnected ? 'bg-(--color-success)' : 'bg-(--color-danger)'}`} />
          <span className="font-medium text-sm">
            {agentConnected ? 'ViddyPod Agent Connected' : 'ViddyPod Agent Setup'}
          </span>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-(--color-primary)">
          {expanded ? 'Hide' : 'Manage'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-(--color-text-muted)">
              The ViddyPod Agent runs on your computer and downloads YouTube videos using your residential IP.
              Generate an API key below, then run the agent with it.
            </p>
          </div>

          {newKey && (
            <div className="bg-(--color-success)/10 border border-(--color-success)/30 rounded p-3 space-y-2">
              <div className="text-sm font-medium text-(--color-success)">
                New API key — copy it now, it won't be shown again
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKey}
                  readOnly
                  className="flex-1 text-xs font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button onClick={copyKey} className="btn btn-secondary text-sm whitespace-nowrap">
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="text-xs text-(--color-text-muted)">
                Run the agent with:
                <pre className="mt-1 p-2 bg-(--color-bg) rounded text-[10px] overflow-x-auto">
                  node agent/vid2pod-agent.mjs --server {window.location.origin} --token {newKey}
                </pre>
              </div>
              <button onClick={() => setNewKey(null)} className="text-xs text-(--color-text-muted)">
                Dismiss
              </button>
            </div>
          )}

          {!newKey && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name"
                className="flex-1 text-sm"
              />
              <button
                onClick={createKey}
                disabled={creating || !newKeyName.trim()}
                className="btn btn-primary text-sm whitespace-nowrap"
              >
                {creating ? 'Creating...' : 'Generate Key'}
              </button>
            </div>
          )}

          {loading ? (
            <div className="text-xs text-(--color-text-muted)">Loading keys...</div>
          ) : keys.length === 0 && !newKey ? (
            <div className="text-xs text-(--color-text-muted)">No API keys yet.</div>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between text-xs py-2 border-t border-(--color-border)">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{k.name}</div>
                    <div className="text-(--color-text-muted) font-mono">
                      {k.keyPrefix}... · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : 'never used'}
                    </div>
                  </div>
                  <button onClick={() => deleteKey(k.id)} className="text-(--color-danger) hover:underline ml-3">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
