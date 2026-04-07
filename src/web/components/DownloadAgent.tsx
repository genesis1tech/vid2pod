import { useState, useEffect } from 'react';
import { useAuth, apiFetch } from '../hooks/useAuth.js';

const GITHUB_RELEASE_URL = 'https://github.com/genesis1tech/vid2pod/releases/latest';
// Use the GitHub Releases page (not direct file URL) so users always get the latest .dmg/.msi
// regardless of version numbers in the filename.

function detectOS(): { label: string; key: string } {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) {
    // Apple Silicon detection — Apple's user agent doesn't reveal arch directly,
    // but ARM Macs report (Macintosh; Intel Mac OS X 10_15_7) for compat reasons.
    // Best signal: check navigator.platform/userAgentData
    const isArm = (navigator as any).userAgentData?.platform === 'macOS' && (navigator as any).userAgentData?.architecture === 'arm';
    return { label: 'macOS', key: isArm ? 'macos-arm64' : 'macos' };
  }
  if (ua.includes('win')) return { label: 'Windows', key: 'windows' };
  return { label: 'Linux', key: 'linux' };
}

export function DownloadAgent() {
  const { token } = useAuth();
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null);
  const [agentLastSeen, setAgentLastSeen] = useState<string | null>(null);
  const os = detectOS();

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const check = async () => {
      try {
        const me = await apiFetch<{ agentLastSeen: string | null }>('/api/v1/auth/me', token);
        if (!mounted) return;
        if (me.agentLastSeen) {
          const minutesAgo = (Date.now() - new Date(me.agentLastSeen).getTime()) / 60000;
          setAgentConnected(minutesAgo < 2);
          setAgentLastSeen(me.agentLastSeen);
        } else {
          setAgentConnected(false);
        }
      } catch {
        setAgentConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, [token]);

  if (agentConnected === null) return null;

  if (agentConnected) {
    return (
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-(--color-success)" />
          <span className="font-medium text-sm">ViddyPod Agent connected</span>
          {agentLastSeen && (
            <span className="text-xs text-(--color-text-muted)">
              · last seen {new Date(agentLastSeen).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-(--color-danger)" />
          <span className="font-medium text-sm">ViddyPod Agent not running</span>
        </div>
      </div>
      <p className="text-sm text-(--color-text-muted) mb-3">
        Install the ViddyPod Agent on your computer to download YouTube videos.
        It runs in the background and syncs automatically.
      </p>
      <a
        href={GITHUB_RELEASE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary text-sm inline-block"
      >
        Download for {os.label}
      </a>
    </div>
  );
}
