import pino from 'pino';
import { getConfig } from '../config.js';

const config = getConfig();

export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export function createChildLogger(module: string) {
  return logger.child({ module });
}
