import { describe, test, expect } from 'vitest';
import { hash } from 'bcrypt';
import { signAccessToken, verifyToken } from '../src/auth/jwt.js';
import { getConfig } from '../src/config.js';

describe('JWT', () => {
  test('signs and verifies access token', async () => {
    const payload = { sub: 'user-1', email: 'test@test.com', role: 'editor' };
    const token = await signAccessToken(payload);
    const verified = await verifyToken(token);

    expect(verified.sub).toBe('user-1');
    expect(verified.email).toBe('test@test.com');
    expect(verified.role).toBe('editor');
  });

  test('rejects invalid token', async () => {
    await expect(verifyToken('invalid-token')).rejects.toThrow();
  });
});

describe('Config', () => {
  test('loads config with defaults', () => {
    const config = getConfig();
    expect(config.PORT).toBeTypeOf('number');
    expect(config.JWT_SECRET).toBeTypeOf('string');
    expect(config.DEFAULT_BITRATE).toBe(128000);
    expect(config.DEFAULT_TARGET_LUFS).toBe(-16);
  });
});
