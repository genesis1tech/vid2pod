import { useState } from 'react';
import { useAuth, apiFetch } from '../hooks/useAuth.js';

interface AddVideoProps {
  onAdded: () => void;
}

export function AddVideo({ onAdded }: AddVideoProps) {
  const { token } = useAuth();
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !token) return;

    setSubmitting(true);
    setMessage(null);

    try {
      await apiFetch('/api/v1/videos', token, {
        method: 'POST',
        body: JSON.stringify({ url: url.trim() }),
      });
      setMessage({ type: 'success', text: 'Video queued! It will appear in your feed once processed.' });
      setUrl('');
      onAdded();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <h2 className="font-semibold text-lg mb-3">Add YouTube Video</h2>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="url"
          placeholder="Paste YouTube URL..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          className="flex-1"
          disabled={submitting}
        />
        <button type="submit" className="btn btn-primary whitespace-nowrap" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add to Library'}
        </button>
      </form>
      {message && (
        <div className={`mt-3 text-sm px-3 py-2 rounded ${
          message.type === 'success'
            ? 'bg-(--color-success)/20 text-(--color-success)'
            : 'bg-(--color-danger)/20 text-(--color-danger)'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
