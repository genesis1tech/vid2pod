interface Episode {
  id: string;
  title: string;
  description: string;
  status: string;
  durationSeconds: number | null;
  imageUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface EpisodeListProps {
  episodes: Episode[];
  loading: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    published: 'bg-(--color-success)/20 text-(--color-success)',
    draft: 'bg-(--color-warning)/20 text-(--color-warning)',
    scheduled: 'bg-(--color-primary)/20 text-(--color-primary)',
    processing: 'bg-(--color-warning)/20 text-(--color-warning)',
  };
  const labels: Record<string, string> = {
    published: 'Ready',
    draft: 'Processing',
    scheduled: 'Scheduled',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] || 'bg-(--color-surface) text-(--color-text-muted)'}`}>
      {labels[status] || status}
    </span>
  );
}

export function EpisodeList({ episodes, loading }: EpisodeListProps) {
  if (loading) {
    return <div className="text-(--color-text-muted) text-center py-8">Loading your library...</div>;
  }

  if (episodes.length === 0) {
    return (
      <div className="card text-center py-8">
        <div className="text-(--color-text-muted)">
          Your library is empty. Add a YouTube video above to get started.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-semibold text-lg mb-3">Your Library</h2>
      <div className="space-y-3">
        {episodes.map((ep) => (
          <div key={ep.id} className="card flex gap-3 sm:gap-4">
            {/* Thumbnail (16:9 YouTube aspect ratio) */}
            {ep.imageUrl ? (
              <img
                src={ep.imageUrl}
                alt=""
                className="w-28 h-16 sm:w-36 sm:h-20 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-28 h-16 sm:w-36 sm:h-20 rounded bg-(--color-bg) flex-shrink-0 flex items-center justify-center text-(--color-text-muted) text-xs">
                No art
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-sm sm:text-base leading-tight line-clamp-2">{ep.title}</h3>
                {statusBadge(ep.status)}
              </div>
              <p className="text-xs sm:text-sm text-(--color-text-muted) mt-1 line-clamp-1">{ep.description}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-(--color-text-muted)">
                <span>{formatDuration(ep.durationSeconds)}</span>
                {ep.publishedAt && (
                  <span>{new Date(ep.publishedAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
