import { describe, test, expect } from 'vitest';
import { getConfig } from '../src/config.js';
import { createTestToken } from './setup.js';

describe('Config', () => {
  test('loads config with defaults', () => {
    const config = getConfig();
    expect(config.PORT).toBeTypeOf('number');
    expect(config.DEFAULT_BITRATE).toBe(128000);
    expect(config.DEFAULT_TARGET_LUFS).toBe(-16);
  });
});

describe('Test auth', () => {
  test('createTestToken produces expected format', () => {
    const token = createTestToken('user-123', 'editor');
    expect(token).toBe('test_user-123_editor');
  });

  test('createTestToken uses defaults', () => {
    const token = createTestToken();
    expect(token).toBe('test_test-user-id_admin');
  });
});
