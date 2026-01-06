import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createStorageProvider, type CloudflareBindings } from '../providers/cloudflare';
import { authMiddleware, type AuthContext } from '../auth/middleware';

const searchSchema = z.object({
  q: z.string().min(1).max(30),
});

type Variables = { auth: AuthContext };

export const userRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

userRoutes.use('*', async (c, next) => {
  const middleware = authMiddleware(c.env.JWT_SECRET);
  return middleware(c, next);
});

userRoutes.get('/search', zValidator('query', searchSchema), async (c) => {
  const auth = c.get('auth');
  const { q } = c.req.valid('query');
  const storage = createStorageProvider(c.env);

  const results = await storage.users.searchByUsername(q);

  return c.json({
    users: results
      .filter((u) => u.id !== auth.userId)
      .map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
      })),
  });
});
