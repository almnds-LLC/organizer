import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { sign, verify } from 'hono/jwt';

const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY = 365 * 24 * 60 * 60; // 1 year

export interface AccessTokenPayload {
  sub: string; // user ID
  username: string;
  iat: number;
  exp: number;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64');
}

export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function getRefreshTokenExpiry(): string {
  return new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000).toISOString();
}

export async function createAccessToken(
  userId: string,
  username: string,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    username,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY,
  };
  return sign(payload, secret);
}

export async function verifyAccessToken(
  token: string,
  secret: string
): Promise<AccessTokenPayload | null> {
  try {
    const payload = await verify(token, secret);
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'sub' in payload &&
      'username' in payload &&
      'exp' in payload &&
      typeof payload.exp === 'number'
    ) {
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      return payload as unknown as AccessTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}
