import { AuthProvider, useAuth } from './hooks/useAuth.js';
import { LoginForm } from './components/LoginForm.js';
import { Library } from './components/Library.js';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--color-text-muted)]">Loading...</div>;
  }

  if (!user) {
    return <LoginForm />;
  }

  return <Library />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
