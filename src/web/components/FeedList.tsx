import { useState } from 'react';
import { useFeeds } from '../hooks/useFeeds.js';
import { PODCAST_CATEGORIES } from '../../shared/constants.js';

export function FeedList() {
  const { feeds, loading, createFeed, deleteFeed } = useFeeds();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', author: '', email: '', categoryPrimary: 'Technology',
    feedType: 'episodic' as const, visibility: 'private' as const, explicit: false,
  });

  if (loading) return <div className="text-[var(--color-text-muted)]">Loading...</div>;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createFeed(form);
    setShowCreate(false);
    setForm({ title: '', description: '', author: '', email: '', categoryPrimary: 'Technology', feedType: 'episodic', visibility: 'private', explicit: false });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Podcast Feeds</h2>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">New Feed</button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-3">
          <h3 className="font-semibold text-lg">Create Feed</h3>
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required rows={3} />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Author" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} required />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <select value={form.categoryPrimary} onChange={(e) => setForm({ ...form, categoryPrimary: e.target.value })}>
              {PODCAST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={form.feedType} onChange={(e) => setForm({ ...form, feedType: e.target.value as any })}>
              <option value="episodic">Episodic</option>
              <option value="serial">Serial</option>
            </select>
            <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as any })}>
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Create</button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {feeds.length === 0 ? (
        <div className="card text-center text-[var(--color-text-muted)]">
          No feeds yet. Create your first podcast feed above.
        </div>
      ) : (
        <div className="space-y-3">
          {feeds.map((feed) => (
            <div key={feed.id} className="card flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{feed.title}</h3>
                <p className="text-sm text-[var(--color-text-muted)]">{feed.description}</p>
                <div className="flex gap-2 mt-2">
                  <span className="text-xs bg-[var(--color-primary)]/20 text-[var(--color-primary)] px-2 py-1 rounded">
                    {feed.visibility}
                  </span>
                  <span className="text-xs bg-[var(--color-surface)] px-2 py-1 rounded">
                    {feed.categoryPrimary}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-secondary text-sm">Edit</button>
                <button onClick={() => deleteFeed(feed.id)} className="btn btn-danger text-sm">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
