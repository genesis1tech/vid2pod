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
await c.end();
" 2>&1 || echo "Migration warning (non-fatal), continuing..."

echo "Starting worker in background..."
node dist/processing/worker.js &

echo "Starting server..."
exec node dist/index.js
