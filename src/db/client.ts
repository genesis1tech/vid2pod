import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import { getConfig } from '../config.js';

const { Pool } = pg;

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const config = getConfig();
    const pool = new Pool({ connectionString: config.DATABASE_URL });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export type Database = ReturnType<typeof getDb>;
