import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import { getConfig } from '../config.js';
import { createChildLogger } from '../shared/logger.js';

const { Pool } = pg;
const log = createChildLogger('db');

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const config = getConfig();
    const pool = new Pool({
      connectionString: config.DATABASE_URL,
      // Survive brief Postgres blips without exhausting the process.
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    });
    // Idle clients emit 'error' when the server closes the connection.
    // Without this handler Node treats it as an uncaught exception and exits.
    pool.on('error', (err) => {
      log.error({ err: err.message }, 'Unexpected Postgres pool error (idle client)');
    });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export type Database = ReturnType<typeof getDb>;
