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

// One-time fix: set password for genesis1.tech.us@gmail.com (lost during Clerk migration)
try {
  const bcrypt = await import('bcrypt');
  const r = await c.query(\"SELECT id, password_hash FROM users WHERE email = 'genesis1.tech.us@gmail.com'\");
  if (r.rows.length > 0 && !r.rows[0].password_hash) {
    const hash = await bcrypt.hash('ViddyPod2026!', 10);
    await c.query('UPDATE users SET password_hash = \$1 WHERE id = \$2', [hash, r.rows[0].id]);
    console.log('Reset password for genesis1.tech.us@gmail.com');
  }
} catch (e) {
  console.error('Password reset failed:', e.message);
}

await c.end();
" 2>&1 || echo "Migration warning (non-fatal), continuing..."

echo "Starting worker in background..."
node dist/processing/worker.js &

echo "Starting server..."
exec node dist/index.js
