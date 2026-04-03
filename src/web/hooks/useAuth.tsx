import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  feedUrl: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export async function apiFetch<T = any>(path: string, token: string | null, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Request failed' })) as { message?: string; error?: string };
    throw new Error(body.message || body.error || 'Request failed');
  }
  return res.json() as Promise<T>;
}

interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  feedUrl?: string;
  user: User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('v2p_token'));
  const [feedUrl, setFeedUrl] = useState<string | null>(localStorage.getItem('v2p_feedUrl'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      apiFetch<User>('/api/v1/auth/me', token)
        .then((u) => setUser(u))
        .catch(() => {
          localStorage.removeItem('v2p_token');
          localStorage.removeItem('v2p_feedUrl');
          setToken(null);
          setFeedUrl(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const loginFn = async (email: string, password: string) => {
    const res = await apiFetch<AuthResponse>('/api/v1/auth/login', null, {
      body: JSON.stringify({ email, password }),
      method: 'POST',
    });
    localStorage.setItem('v2p_token', res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    // Fetch feed URL from feeds list
    const feeds = await apiFetch<any[]>('/api/v1/feeds', res.accessToken);
    if (feeds.length > 0) {
      const url = `${window.location.origin}/feed/${feeds[0].ownershipToken}.xml`;
      localStorage.setItem('v2p_feedUrl', url);
      setFeedUrl(url);
    }
  };

  const registerFn = async (email: string, password: string, displayName?: string) => {
    const res = await apiFetch<AuthResponse>('/api/v1/auth/register', null, {
      body: JSON.stringify({ email, password, displayName }),
      method: 'POST',
    });
    localStorage.setItem('v2p_token', res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    if (res.feedUrl) {
      localStorage.setItem('v2p_feedUrl', res.feedUrl);
      setFeedUrl(res.feedUrl);
    }
  };

  const logout = () => {
    localStorage.removeItem('v2p_token');
    localStorage.removeItem('v2p_feedUrl');
    setToken(null);
    setFeedUrl(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, feedUrl, login: loginFn, register: registerFn, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
