import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { createStorageProvider, type CloudflareBindings } from '../providers/cloudflare';
import { verifyPassword } from '../auth/password';
import { createAccessToken, verifyAccessToken } from '../auth/tokens';

const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().max(100).optional(),
  turnstileToken: z.string(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
  turnstileToken: z.string(),
});

const passwordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

async function verifyTurnstile(token: string, secret: string, ip?: string): Promise<boolean> {
  if (secret === 'test-turnstile-secret' || secret.startsWith('1x00000000')) {
    return true;
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: ip }),
  });
  const result = await response.json() as { success: boolean };
  return result.success;
}

export const authRoutes = new Hono<{ Bindings: CloudflareBindings }>();

function setAccessTokenCookie(c: Parameters<typeof setCookie>[0], token: string): void {
  setCookie(c, 'access_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/api',
    maxAge: 15 * 60, // 15 minutes
  });
}

authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const { username, password, displayName, turnstileToken } = c.req.valid('json');

  const turnstileValid = await verifyTurnstile(
    turnstileToken,
    c.env.TURNSTILE_SECRET_KEY,
    c.req.header('CF-Connecting-IP')
  );
  if (!turnstileValid) {
    return c.json({ error: 'Bot verification failed' }, 400);
  }

  const storage = createStorageProvider(c.env);
  const user = await storage.users.create({ username, password, displayName });
  await storage.rooms.createDefault(user.id, username);
  const { token: refreshToken } = await storage.refreshTokens.create(user.id);
  const accessToken = await createAccessToken(user.id, user.username, c.env.JWT_SECRET);

  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/api/auth',
    maxAge: 365 * 24 * 60 * 60,
  });
  setAccessTokenCookie(c, accessToken);

  return c.json({
    user: { id: user.id, username: user.username, displayName: user.displayName },
  }, 201);
});

authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { username, password, turnstileToken } = c.req.valid('json');

  const turnstileValid = await verifyTurnstile(
    turnstileToken,
    c.env.TURNSTILE_SECRET_KEY,
    c.req.header('CF-Connecting-IP')
  );
  if (!turnstileValid) {
    return c.json({ error: 'Bot verification failed' }, 400);
  }

  const storage = createStorageProvider(c.env);
  const user = await storage.users.findByUsername(username);

  if (!user) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  const { token: refreshToken } = await storage.refreshTokens.create(user.id);
  const accessToken = await createAccessToken(user.id, user.username, c.env.JWT_SECRET);

  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/api/auth',
    maxAge: 365 * 24 * 60 * 60,
  });
  setAccessTokenCookie(c, accessToken);

  return c.json({
    user: { id: user.id, username: user.username, displayName: user.displayName },
  });
});

authRoutes.post('/refresh', async (c) => {
  const refreshToken = getCookie(c, 'refresh_token');

  if (!refreshToken) {
    return c.json({ error: 'No refresh token' }, 401);
  }

  const storage = createStorageProvider(c.env);
  const tokenRecord = await storage.refreshTokens.findByToken(refreshToken);

  if (!tokenRecord) {
    deleteCookie(c, 'refresh_token', { path: '/api/auth' });
    return c.json({ error: 'Invalid or expired refresh token' }, 401);
  }

  const user = await storage.users.findById(tokenRecord.userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  const accessToken = await createAccessToken(user.id, user.username, c.env.JWT_SECRET);
  setAccessTokenCookie(c, accessToken);
  return c.json({ success: true });
});

authRoutes.post('/logout', async (c) => {
  const refreshToken = getCookie(c, 'refresh_token');

  if (refreshToken) {
    const storage = createStorageProvider(c.env);
    const tokenRecord = await storage.refreshTokens.findByToken(refreshToken);
    if (tokenRecord) {
      await storage.refreshTokens.revoke(tokenRecord.id);
    }
  }

  deleteCookie(c, 'refresh_token', { path: '/api/auth' });
  deleteCookie(c, 'access_token', { path: '/api' });
  return c.json({ success: true });
});

authRoutes.post('/logout-all', async (c) => {
  const token = getCookie(c, 'access_token') || c.req.header('Authorization')?.slice(7);
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyAccessToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const storage = createStorageProvider(c.env);
  await storage.refreshTokens.revokeAllForUser(payload.sub);
  deleteCookie(c, 'refresh_token', { path: '/api/auth' });
  deleteCookie(c, 'access_token', { path: '/api' });

  return c.json({ success: true });
});

authRoutes.get('/me', async (c) => {
  const token = getCookie(c, 'access_token') || c.req.header('Authorization')?.slice(7);
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyAccessToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const storage = createStorageProvider(c.env);
  const user = await storage.users.findById(payload.sub);

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    user: { id: user.id, username: user.username, displayName: user.displayName },
  });
});

authRoutes.patch('/password', zValidator('json', passwordSchema), async (c) => {
  const token = getCookie(c, 'access_token') || c.req.header('Authorization')?.slice(7);
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyAccessToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const { currentPassword, newPassword } = c.req.valid('json');
  const storage = createStorageProvider(c.env);
  const user = await storage.users.findById(payload.sub);

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'Current password is incorrect' }, 401);
  }

  await storage.users.updatePassword(user.id, newPassword);
  await storage.refreshTokens.revokeAllForUser(user.id);
  deleteCookie(c, 'refresh_token', { path: '/api/auth' });
  deleteCookie(c, 'access_token', { path: '/api' });

  const { token: refreshToken } = await storage.refreshTokens.create(user.id);
  const accessToken = await createAccessToken(user.id, user.username, c.env.JWT_SECRET);

  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/api/auth',
    maxAge: 365 * 24 * 60 * 60,
  });
  setAccessTokenCookie(c, accessToken);

  return c.json({ success: true });
});
