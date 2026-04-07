import { useState, useEffect } from 'react';
import { useAuth, apiFetch } from '../hooks/useAuth.js';

function detectOS(): 'macos-arm64' | 'macos-x64' | 'linux-x64' | 'windows-x64' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows-x64';
  if (ua.includes('mac')) {
    // Apple Silicon detection
    if (navigator.userAgent.includes('ARM') || (navigator as any).userAgentData?.platform === 'macOS') {
      return 'macos-arm64';
    }
    return 'macos-arm64'; // Default to ARM for modern Macs
  }
  return 'linux-x64';
}

const OS_LABELS: Record<string, string> = {
  'macos-arm64': 'macOS (Apple Silicon)',
  'macos-x64': 'macOS (Intel)',
  'linux-x64': 'Linux',
  'windows-x64': 'Windows',
};

export function AgentSetup() {
  const { getToken } = useAuth();
  const [agentConnected, setAgentConnected] = useState(false);
  const [agentLastSeen, setAgentLastSeen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const os = detectOS();

  const checkAgentStatus = async () => {
    try {
      const token = await getToken();
      const res = await apiFetch<{ agentLastSeen: string | null }>('/api/v1/auth/me', token);
      if (res.agentLastSeen) {
        const lastSeen = new Date(res.agentLastSeen);
        const minutesAgo = (Date.now() - lastSeen.getTime()) / 60000;
        setAgentConnected(minutesAgo < 2); // Connected if seen in last 2 min
        setAgentLastSeen(res.agentLastSeen);
      } else {
        setAgentConnected(false);
      }
    } catch {
      setAgentConnected(false);
    }
  };

  useEffect(() => {
    checkAgentStatus();
    const interval = setInterval(checkAgentStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const generateSetupToken = async () => {
    try {
      const token = await getToken();
      const res = await apiFetch<{ server: string; userId: string; email: string }>('/api/v1/auth/agent-token', token, {
        method: 'POST',
      });
      // Create a setup string the user pastes into the agent
      const setupStr = `${res.server}|${token}`;
      setSetupToken(setupStr);
    } catch (err: any) {
      console.error('Failed to generate setup token:', err);
    }
  };

  const copyToken = async () => {
    if (!setupToken) return;
    await navigator.clipboard.writeText(setupToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${agentConnected ? 'bg-(--color-success)' : 'bg-(--color-danger)'}`} />
          <span className="font-medium text-sm">
            {agentConnected ? 'ViddyPod Agent Connected' : 'ViddyPod Agent Not Connected'}
          </span>
          {agentLastSeen && !agentConnected && (
            <span className="text-xs text-(--color-text-muted)">
              (last seen {new Date(agentLastSeen).toLocaleTimeString()})
            </span>
          )}
        </div>
        <button
          onClick={() => { setExpanded(!expanded); if (!expanded && !setupToken) generateSetupToken(); }}
          className="text-xs text-(--color-primary)"
        >
          {expanded ? 'Hide' : 'Setup'}
        </button>
      </div>

      {!agentConnected && !expanded && (
        <p className="text-xs text-(--color-text-muted) mt-2">
          The ViddyPod Agent downloads YouTube videos from your computer. Install it to start adding videos.
        </p>
      )}

      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="space-y-3">
            <h3 className="font-medium text-sm">1. Download ViddyPod Agent</h3>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/agent/viddypod-agent-${os}`}
                download
                className="btn btn-primary text-sm"
              >
                Download for {OS_LABELS[os]}
              </a>
              <button
                onClick={() => {/* toggle other OS options */}}
                className="text-xs text-(--color-text-muted) hover:text-(--color-primary)"
              >
                Other platforms
              </button>
            </div>
            <p className="text-xs text-(--color-text-muted)">
              Requires yt-dlp installed on your machine.{' '}
              <a href="https://github.com/yt-dlp/yt-dlp#installation" target="_blank" rel="noopener noreferrer" className="text-(--color-primary) underline">
                Install yt-dlp
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-sm">2. Run the agent and paste this setup token</h3>
            {setupToken ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={setupToken}
                  readOnly
                  className="flex-1 text-xs font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button onClick={copyToken} className="btn btn-secondary text-sm whitespace-nowrap">
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ) : (
              <div className="text-xs text-(--color-text-muted)">Generating token...</div>
            )}
            <p className="text-xs text-(--color-text-muted)">
              The agent will ask for this token on first run to connect to your account.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-sm">3. Keep the agent running</h3>
            <p className="text-xs text-(--color-text-muted)">
              When you paste a YouTube URL above, the agent will automatically download it
              from your computer and send it to ViddyPod for processing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
