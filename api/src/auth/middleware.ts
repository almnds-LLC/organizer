import type { Context, Next } from 'hono';
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
    const authHeader = c.req.header('Authorization');
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

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
