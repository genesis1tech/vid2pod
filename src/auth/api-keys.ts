import { randomBytes, createHash } from 'crypto';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger('api-keys');

export function generateApiKey(): string {
  return `v2p_${randomBytes(32).toString('hex')}`;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
