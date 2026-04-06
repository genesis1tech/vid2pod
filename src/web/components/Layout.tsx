import { useState, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth.js';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [page, setPage] = useState('feeds');

  if (!user) return <>{children}</>;

  const nav = [
    { id: 'feeds', label: 'Feeds' },
    { id: 'episodes', label: 'Episodes' },
    { id: 'assets', label: 'Assets' },
    { id: 'licenses', label: 'Licenses' },
  ];

  return (
    <div className="min-h-screen flex">
      <nav className="w-56 border-r border-[var(--color-border)] p-4 flex flex-col">
        <h1 className="text-xl font-bold mb-6 text-[var(--color-primary)]">ViddyPod</h1>
        {nav.map((n) => (
          <button
            key={n.id}
            onClick={() => setPage(n.id)}
            className={`text-left px-3 py-2 rounded mb-1 transition-colors ${
              page === n.id ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-[var(--color-surface)]'
            }`}
          >
            {n.label}
          </button>
        ))}
        <div className="mt-auto pt-4 border-t border-[var(--color-border)]">
          <div className="text-sm text-[var(--color-text-muted)] mb-2">{user.email}</div>
          <button onClick={logout} className="text-sm text-[var(--color-danger)]">Sign out</button>
        </div>
      </nav>
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
