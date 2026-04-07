#!/bin/sh
# Apply DB schema changes then start the server and worker

echo "Applying database migrations..."

node --input-type=module -e "
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_last_seen TIMESTAMPTZ');
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
console.log('Schema up to date');

// One-time cleanup: delete genesis1.tech.us@gmail.com user and all related data
try {
  const r = await c.query(\"SELECT id FROM users WHERE email = 'genesis1.tech.us@gmail.com'\");
  if (r.rows.length > 0) {
    const userId = r.rows[0].id;
    await c.query('DELETE FROM episodes WHERE feed_id IN (SELECT id FROM feeds WHERE user_id = \$1)', [userId]);
    await c.query('DELETE FROM access_log WHERE feed_id IN (SELECT id FROM feeds WHERE user_id = \$1)', [userId]);
    await c.query('DELETE FROM youtube_metadata WHERE asset_id IN (SELECT id FROM assets WHERE user_id = \$1)', [userId]);
    await c.query('DELETE FROM processing_jobs WHERE asset_id IN (SELECT id FROM assets WHERE user_id = \$1)', [userId]);
    await c.query('DELETE FROM assets WHERE user_id = \$1', [userId]);
    await c.query('DELETE FROM feeds WHERE user_id = \$1', [userId]);
    await c.query('DELETE FROM licenses WHERE user_id = \$1', [userId]);
    await c.query('DELETE FROM api_tokens WHERE user_id = \$1', [userId]);
    await c.query('DELETE FROM users WHERE id = \$1', [userId]);
    console.log('Deleted user genesis1.tech.us@gmail.com');
  }
} catch (e) {
  console.error('Cleanup failed:', e.message);
}

await c.end();
" 2>&1 || echo "Migration warning (non-fatal), continuing..."

echo "Starting worker in background..."
node dist/processing/worker.js &

echo "Starting server..."
exec node dist/index.js
