#!/bin/sh
# Apply DB schema changes then start the server and worker

echo "Applying database migrations..."

node --input-type=module -e "
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id TEXT');
await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS youtube_cookies TEXT');
await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_last_seen TIMESTAMPTZ');
await c.query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');
await c.query(\`
  DO \\\$\\\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_clerk_id_unique') THEN
      ALTER TABLE users ADD CONSTRAINT users_clerk_id_unique UNIQUE (clerk_id);
    END IF;
  END \\\$\\\$;
\`);
console.log('Schema up to date');
await c.end();
" 2>&1 || echo "Migration warning (non-fatal), continuing..."

echo "Starting worker in background..."
node dist/processing/worker.js &

echo "Starting server..."
exec node dist/index.js
