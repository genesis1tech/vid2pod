import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';

interface VidUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}

export function useAuth() {
  const { getToken, signOut, isSignedIn, isLoaded } = useClerkAuth();
  const { user: clerkUser } = useUser();

  const user: VidUser | null = isSignedIn && clerkUser ? {
    id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress || '',
    displayName: clerkUser.fullName,
    role: 'editor',
  } : null;

  return {
    user,
    loading: !isLoaded,
    logout: () => signOut(),
    getToken,
  };
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
