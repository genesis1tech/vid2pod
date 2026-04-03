import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth.js';
import { Layout } from './components/Layout.js';
import { LoginForm } from './components/LoginForm.js';
import { FeedList } from './components/FeedList.js';
import { LicenseManager } from './components/LicenseManager.js';
import { AssetUploader } from './components/AssetUploader.js';

function AppContent() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState('feeds');

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--color-text-muted)]">Loading...</div>;
  }

  if (!user) {
    return (
      <LoginForm onLogin={() => setPage('feeds')} />
    );
  }

  return (
    <Layout>
      {page === 'feeds' && <FeedList />}
      {page === 'licenses' && <LicenseManager />}
      {page === 'assets' && <AssetUploader />}
      {page === 'episodes' && <div className="text-[var(--color-text-muted)]">Episode management coming soon</div>}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
