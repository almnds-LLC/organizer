import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth';
import { roomRoutes } from './routes/rooms';
import { invitationRoutes } from './routes/invitations';
import { userRoutes } from './routes/users';
import { drawerRoutes } from './routes/drawers';
import { categoryRoutes } from './routes/categories';
import { wsRoutes } from './routes/ws';
import { AppError } from './lib/errors';
import type { CloudflareBindings } from './providers/cloudflare';

export { RoomSync } from './durable-objects/RoomSync';

type Bindings = CloudflareBindings & { ASSETS: Fetcher };

const app = new Hono<{ Bindings: Bindings }>();

// Global middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: (origin) => origin, // TODO: Configure for production
    credentials: true,
  })
);

// Error handling
app.onError((err, c) => {
  console.error('Error:', err);

  if (err instanceof AppError) {
    return c.json(
      { error: err.message, code: err.code },
      err.statusCode as 400 | 401 | 403 | 404 | 409 | 500
    );
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return c.json({ error: 'Validation failed', details: err }, 400);
  }

  return c.json({ error: 'Internal server error' }, 500);
});

// API routes under /api prefix
// Health check for monitoring
app.get('/api/health', (c) => c.json({ status: 'ok' }));
// Note: wsRoutes must be registered before roomRoutes to avoid auth middleware conflict
// on /rooms/:roomId/ws path (WS handles auth via query param, not header)
app.route('/api', wsRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/rooms', roomRoutes);
app.route('/api/invitations', invitationRoutes);
app.route('/api/users', userRoutes);
app.route('/api', drawerRoutes);
app.route('/api', categoryRoutes);

export default app;
