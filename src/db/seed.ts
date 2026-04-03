import { getDb } from './client.js';
import { hash } from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger('seed');

export async function seed() {
  const db = getDb();

  log.info('Seeding database...');

  const passwordHash = await hash('password123', 10);

  const [user] = await db.insert(users).values({
    id: uuid(),
    email: 'demo@vid2pod.local',
    passwordHash,
    displayName: 'Demo User',
    role: 'admin',
  }).returning();

  log.info({ userId: user.id }, 'Created demo user');

  log.info('Seed complete');
}

import { users } from './schema.js';
