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

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// API routes
// Note: wsRoutes must be registered before roomRoutes to avoid auth middleware conflict
// on /rooms/:roomId/ws path (WS handles auth via query param, not header)
app.route('/', wsRoutes); // WebSocket routes for real-time sync
app.route('/auth', authRoutes);
app.route('/rooms', roomRoutes);
app.route('/invitations', invitationRoutes);
app.route('/users', userRoutes);
app.route('/', drawerRoutes); // Drawer routes have /rooms/:roomId/drawers and /drawers/:id paths
app.route('/', categoryRoutes); // Category routes have /rooms/:roomId/categories paths

export default app;
