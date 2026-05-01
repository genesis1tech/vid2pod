#!/bin/sh
# Apply DB schema changes then start the server and worker

echo "Applying database migrations..."

node --input-type=module -e "
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_last_seen TIMESTAMPTZ');
await c.query('ALTER TABLE access_log ADD COLUMN IF NOT EXISTS episode_id UUID REFERENCES episodes(id)');
await c.query(\`
  CREATE TABLE IF NOT EXISTS api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_prefix TEXT NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
\`);

const indexes = [
  'CREATE INDEX IF NOT EXISTS api_tokens_user_id_idx ON api_tokens(user_id)',
  'CREATE INDEX IF NOT EXISTS licenses_user_id_idx ON licenses(user_id)',
  'CREATE INDEX IF NOT EXISTS assets_user_id_idx ON assets(user_id)',
  'CREATE INDEX IF NOT EXISTS assets_license_id_idx ON assets(license_id)',
  'CREATE INDEX IF NOT EXISTS assets_processing_status_idx ON assets(processing_status)',
  'CREATE INDEX IF NOT EXISTS assets_youtube_video_id_idx ON assets(youtube_video_id)',
  'CREATE INDEX IF NOT EXISTS youtube_metadata_asset_id_idx ON youtube_metadata(asset_id)',
  'CREATE INDEX IF NOT EXISTS feeds_user_id_idx ON feeds(user_id)',
  'CREATE INDEX IF NOT EXISTS episodes_feed_id_idx ON episodes(feed_id)',
  'CREATE INDEX IF NOT EXISTS episodes_asset_id_idx ON episodes(asset_id)',
  'CREATE INDEX IF NOT EXISTS episodes_status_idx ON episodes(status)',
  'CREATE INDEX IF NOT EXISTS episodes_storage_cleanup_idx ON episodes(storage_cleared, storage_expiry)',
  'CREATE INDEX IF NOT EXISTS access_log_feed_id_idx ON access_log(feed_id)',
  'CREATE INDEX IF NOT EXISTS access_log_episode_id_idx ON access_log(episode_id)',
  'CREATE INDEX IF NOT EXISTS access_log_accessed_at_idx ON access_log(accessed_at)',
  'CREATE INDEX IF NOT EXISTS processing_jobs_asset_id_idx ON processing_jobs(asset_id)',
  'CREATE INDEX IF NOT EXISTS processing_jobs_status_idx ON processing_jobs(status)',
];
for (const sql of indexes) {
  try { await c.query(sql); } catch (e) { console.warn('Index warning:', e.message); }
}
console.log('Schema and indexes up to date');
await c.end();
" 2>&1 || echo "Migration warning (non-fatal), continuing..."

echo "Starting worker in background..."
node dist/processing/worker.js &

echo "Starting server..."
exec node dist/index.js
