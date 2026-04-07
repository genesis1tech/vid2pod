import { SignJWT, jwtVerify } from 'jose';
import { getConfig } from '../config.js';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger('jwt');

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export async function signAccessToken(payload: JwtPayload): Promise<string> {
  const config = getConfig();
  const secret = new TextEncoder().encode(config.JWT_SECRET);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_EXPIRES_IN)
    .sign(secret);
}

export async function signRefreshToken(payload: JwtPayload): Promise<string> {
  const config = getConfig();
  const secret = new TextEncoder().encode(config.JWT_SECRET);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_REFRESH_EXPIRES_IN)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const config = getConfig();
  const secret = new TextEncoder().encode(config.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as JwtPayload;
}
