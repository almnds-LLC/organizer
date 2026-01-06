import { Hono } from 'hono';
import { createStorageProvider, type CloudflareBindings } from '../providers/cloudflare';
import { authMiddleware, type AuthContext } from '../auth/middleware';
import { NotFoundError, ForbiddenError } from '../lib/errors';

type Variables = { auth: AuthContext };

export const invitationRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

invitationRoutes.use('*', async (c, next) => {
  const middleware = authMiddleware(c.env.JWT_SECRET);
  return middleware(c, next);
});

invitationRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  const storage = createStorageProvider(c.env);
  const invitations = await storage.rooms.findInvitationsForUser(auth.userId);
  return c.json({ invitations });
});

invitationRoutes.post('/:id/accept', async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const storage = createStorageProvider(c.env);

  const member = await storage.rooms.acceptInvitation(id, auth.userId);
  return c.json({ member });
});

invitationRoutes.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const storage = createStorageProvider(c.env);

  const invitation = await storage.rooms.findInvitation(id);
  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }

  if (invitation.inviteeId !== auth.userId) {
    throw new ForbiddenError('This invitation is not for you');
  }

  await storage.rooms.deleteInvitation(id);
  return c.json({ success: true });
});
