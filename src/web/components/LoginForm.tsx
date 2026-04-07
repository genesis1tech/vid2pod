import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';

export function LoginForm({ onLogin }: { onLogin: () => void }) {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isRegister) {
        await register(email, password, displayName || undefined);
      } else {
        await login(email, password);
      }
      onLogin();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card w-96">
        <h1 className="text-2xl font-bold mb-6 text-center">ViddyPod</h1>
        <h2 className="text-lg mb-4 text-center text-[var(--color-text-muted)]">
          {isRegister ? 'Create Account' : 'Sign In'}
        </h2>
        {error && (
          <div className="bg-[var(--color-danger)]/20 text-[var(--color-danger)] p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          {isRegister && (
            <input
              type="text"
              placeholder="Your name (e.g. Marcus)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              minLength={1}
            />
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
            {submitting ? '...' : isRegister ? 'Register' : 'Sign In'}
          </button>
        </form>
        <p className="text-sm text-center mt-4 text-[var(--color-text-muted)]">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-[var(--color-primary)] hover:underline"
          >
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  );
}
