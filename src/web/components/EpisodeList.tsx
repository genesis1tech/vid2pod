import { useState } from 'react';
import { useAuth, apiFetch } from '../hooks/useAuth.js';

interface Episode {
  id: string;
  title: string;
  description: string;
  status: string;
  assetProcessingStatus?: string | null;
  processingStage?: string | null;
  processingProgress?: number | null;
  durationSeconds: number | null;
  imageUrl: string | null;
  publishedAt: string | null;
  libraryArchivedAt?: string | null;
  createdAt: string;
}

interface EpisodeListProps {
  episodes: Episode[];
  loading: boolean;
  onRefresh?: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getStatusInfo(ep: Episode) {
  const stageLabels: Record<string, string> = {
    waiting_for_download: 'Downloading',
    queued: 'Queued',
    loading_source: 'Loading source',
    extracting_metadata: 'Reading metadata',
    transcoding: 'Transcoding',
    analyzing_loudness: 'Analyzing loudness',
    normalizing: 'Normalizing',
    uploading: 'Uploading',
    publishing: 'Publishing',
    ready: 'Ready',
    failed: 'Failed',
  };

  if (ep.assetProcessingStatus === 'failed' || ep.processingStage === 'failed') {
    return { label: 'Failed', progress: ep.processingProgress ?? null, tone: 'danger' };
  }
  if (ep.status === 'published') {
    return { label: 'Ready', progress: 100, tone: 'success' };
  }
  if (ep.status === 'scheduled') {
    return { label: 'Scheduled', progress: ep.processingProgress ?? null, tone: 'primary' };
  }
  if (ep.processingStage && stageLabels[ep.processingStage]) {
    return {
      label: stageLabels[ep.processingStage],
      progress: ep.processingProgress ?? null,
      tone: ep.processingStage === 'waiting_for_download' ? 'primary' : 'warning',
    };
  }
  if (ep.assetProcessingStatus === 'pending_download') {
    return { label: 'Downloading', progress: 5, tone: 'primary' };
  }
  if (ep.assetProcessingStatus === 'pending') {
    return { label: 'Queued', progress: ep.processingProgress ?? 20, tone: 'warning' };
  }
  if (ep.assetProcessingStatus === 'processing') {
    return { label: 'Processing', progress: ep.processingProgress ?? null, tone: 'warning' };
  }
  return { label: ep.status === 'draft' ? 'Pending' : ep.status, progress: ep.processingProgress ?? null, tone: 'warning' };
}

function statusBadge(ep: Episode) {
  const info = getStatusInfo(ep);
  const styles: Record<string, string> = {
    success: 'bg-(--color-success)/20 text-(--color-success)',
    warning: 'bg-(--color-warning)/20 text-(--color-warning)',
    danger: 'bg-(--color-danger)/20 text-(--color-danger)',
    primary: 'bg-(--color-primary)/20 text-(--color-primary)',
  };
  const progress = typeof info.progress === 'number'
    ? ` ${Math.max(0, Math.min(100, Math.round(info.progress)))}%`
    : '';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${styles[info.tone] || 'bg-(--color-surface) text-(--color-text-muted)'}`}>
      {info.label}{progress}
    </span>
  );
}

export function EpisodeList({ episodes, loading, onRefresh }: EpisodeListProps) {
  const { token } = useAuth();
  const [showArchived, setShowArchived] = useState(false);

  const activeEpisodes = episodes.filter((ep) => !ep.libraryArchivedAt);
  const archivedEpisodes = episodes.filter((ep) => ep.libraryArchivedAt);
  const visibleEpisodes = showArchived ? archivedEpisodes : activeEpisodes;

  const handleDelete = async (episodeId: string) => {
    if (!token) return;
    if (!confirm('Remove this episode from your library?')) return;
    try {
      await apiFetch(`/api/v1/episodes/${episodeId}`, token, { method: 'DELETE' });
      onRefresh?.();
    } catch (err: any) {
      console.error('Failed to delete episode:', err.message);
      alert('Failed to remove: ' + err.message);
    }
  };

  const handleArchive = async (episodeId: string) => {
    if (!token) return;
    try {
      await apiFetch(`/api/v1/episodes/${episodeId}/archive`, token, { method: 'POST' });
      onRefresh?.();
    } catch (err: any) {
      console.error('Failed to archive episode:', err.message);
      alert('Failed to archive: ' + err.message);
    }
  };

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
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold text-lg">Your Library</h2>
        {archivedEpisodes.length > 0 && (
          <div className="flex rounded-md border border-(--color-border) overflow-hidden">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className={`px-3 py-1.5 text-xs ${!showArchived ? 'bg-(--color-primary) text-white' : 'bg-(--color-surface) text-(--color-text-muted)'}`}
            >
              Recent {activeEpisodes.length}
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              className={`px-3 py-1.5 text-xs ${showArchived ? 'bg-(--color-primary) text-white' : 'bg-(--color-surface) text-(--color-text-muted)'}`}
            >
              Archived {archivedEpisodes.length}
            </button>
          </div>
        )}
      </div>
      {visibleEpisodes.length === 0 ? (
        <div className="card text-center py-6 text-(--color-text-muted)">
          {showArchived ? 'No archived items.' : 'No recent items.'}
        </div>
      ) : (
      <div className="space-y-3">
        {visibleEpisodes.map((ep) => (
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
                <div className="flex items-center gap-2 flex-shrink-0">
                  {statusBadge(ep)}
                  {!showArchived && (
                    <button
                      onClick={() => handleArchive(ep.id)}
                      className="text-xs text-(--color-text-muted) hover:text-(--color-text) hover:underline"
                      title="Archive from library"
                    >
                      Archive
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(ep.id)}
                    className="text-xs text-(--color-danger) hover:underline"
                    title="Remove from library"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-(--color-text-muted) mt-1 line-clamp-1">{ep.description}</p>
              {(() => {
                const info = getStatusInfo(ep);
                if (info.label === 'Ready' || typeof info.progress !== 'number') return null;
                const progress = Math.max(0, Math.min(100, Math.round(info.progress)));
                const barColor = info.label === 'Failed' ? 'bg-(--color-danger)' : 'bg-(--color-primary)';
                return (
                  <div className="mt-2 h-1.5 rounded-full bg-(--color-border) overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${progress}%` }} />
                  </div>
                );
              })()}
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
      )}
    </div>
  );
}
