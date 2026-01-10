import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyAccessToken } from './tokens';

export interface AuthContext {
  userId: string;
  username: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export function authMiddleware(jwtSecret: string) {
  return async (c: Context, next: Next) => {
    // Try cookie first, fall back to Authorization header
    const token = getCookie(c, 'access_token') ||
      (c.req.header('Authorization')?.startsWith('Bearer ')
        ? c.req.header('Authorization')?.slice(7)
        : undefined);

    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = await verifyAccessToken(token, jwtSecret);
    if (!payload) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    c.set('auth', {
      userId: payload.sub,
      username: payload.username,
    });

    await next();
  };
}
