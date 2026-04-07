import { signAccessToken, type JwtPayload } from '../src/auth/jwt.js';

export function createTestToken(userId = 'test-user-id', role = 'admin'): Promise<string> {
  const payload: JwtPayload = { sub: userId, email: 'test@test.com', role };
  return signAccessToken(payload);
}
