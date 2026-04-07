import { AuthProvider, useAuth } from './hooks/useAuth.js';
import { LoginForm } from './components/LoginForm.js';
import { Library } from './components/Library.js';
import { AgentConnect } from './components/AgentConnect.js';

function AppContent() {
  const { user, loading } = useAuth();

  // /agent-connect is the OAuth-style flow for the desktop agent.
  // The desktop app opens this URL in the user's browser; once they're
  // logged in, the page generates an agent token and redirects to viddypod://
  const isAgentConnect = window.location.pathname === '/agent-connect';

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--color-text-muted)]">Loading...</div>;
  }

  if (!user) {
    return <LoginForm />;
  }

  if (isAgentConnect) {
    return <AgentConnect />;
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
