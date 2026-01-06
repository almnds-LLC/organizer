import { Hono } from 'hono';
import { createStorageProvider, createRealtimeProvider, type CloudflareBindings } from '../providers/cloudflare';
import { verifyAccessToken } from '../auth/tokens';
import { authMiddleware, type AuthContext } from '../auth/middleware';

type Variables = { auth: AuthContext };

export const wsRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

wsRoutes.get('/rooms/:roomId/ws', async (c) => {
  const { roomId } = c.req.param();

  const token = c.req.query('token');
  if (!token) {
    return c.json({ error: 'Missing token' }, 401);
  }

  const payload = await verifyAccessToken(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const userId = payload.sub;
  const storage = createStorageProvider(c.env);
  const realtime = createRealtimeProvider(c.env);

  const membership = await storage.rooms.getMemberRole(roomId, userId);
  if (!membership) {
    return c.json({ error: 'Room not found' }, 404);
  }

  const user = await storage.users.findById(userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return realtime.handleWebSocketUpgrade(c.req.raw, roomId, {
    userId,
    username: user.username,
    role: membership.role,
  });
});

wsRoutes.use('/rooms/:roomId/connections', async (c, next) => {
  const middleware = authMiddleware(c.env.JWT_SECRET);
  return middleware(c, next);
});

wsRoutes.get('/rooms/:roomId/connections', async (c) => {
  const auth = c.get('auth');
  const { roomId } = c.req.param();
  const storage = createStorageProvider(c.env);
  const realtime = createRealtimeProvider(c.env);

  const membership = await storage.rooms.getMemberRole(roomId, auth.userId);
  if (!membership) {
    return c.json({ error: 'Room not found' }, 404);
  }

  const users = await realtime.getRoom(roomId).getConnectedUsers();
  return c.json({ users });
});
