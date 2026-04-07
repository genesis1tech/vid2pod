import { useEffect, useState } from 'react';
import { useAuth, apiFetch } from '../hooks/useAuth.js';

export function AgentConnect() {
  const { token } = useAuth();
  const [status, setStatus] = useState<'connecting' | 'success' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetch<{ token: string }>('/api/v1/auth/agent-token', token, {
          method: 'POST',
          body: '{}',
        });
        if (cancelled) return;
        // Redirect to the desktop app's deep link handler
        const deepLink = `viddypod://callback?token=${encodeURIComponent(result.token)}`;
        window.location.href = deepLink;
        setStatus('success');
      } catch (err: any) {
        if (cancelled) return;
        setStatus('error');
        setErrorMsg(err.message || 'Failed to generate token');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-4">Connect ViddyPod Agent</h1>
        {status === 'connecting' && (
          <p className="text-(--color-text-muted)">Generating your agent token...</p>
        )}
        {status === 'success' && (
          <>
            <div className="text-(--color-success) text-4xl mb-3">✓</div>
            <p className="text-sm mb-2">Connected!</p>
            <p className="text-xs text-(--color-text-muted)">
              Return to the ViddyPod app on your desktop. You can close this tab.
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-(--color-danger) text-4xl mb-3">✗</div>
            <p className="text-sm mb-2">Connection failed</p>
            <p className="text-xs text-(--color-danger)">{errorMsg}</p>
          </>
        )}
      </div>
    </div>
  );
}
