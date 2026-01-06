import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createStorageProvider, type CloudflareBindings } from '../providers/cloudflare';
import { authMiddleware, type AuthContext } from '../auth/middleware';
import { hasPermission, canInvite } from '../auth/permissions';
import { NotFoundError, ForbiddenError } from '../lib/errors';

const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const updateRoomSchema = createRoomSchema.partial();

const inviteSchema = z.object({
  username: z.string(),
  role: z.enum(['owner', 'editor', 'viewer']),
  canInvite: z.boolean().optional(),
});

const roleLevel: Record<string, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

const updateMemberSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer']).optional(),
  canInvite: z.boolean().optional(),
});

type Variables = { auth: AuthContext };

export const roomRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

roomRoutes.use('*', async (c, next) => {
  const middleware = authMiddleware(c.env.JWT_SECRET);
  return middleware(c, next);
});

roomRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  const storage = createStorageProvider(c.env);
  const userRooms = await storage.rooms.findByUser(auth.userId);
  return c.json({ rooms: userRooms });
});

roomRoutes.post('/', zValidator('json', createRoomSchema), async (c) => {
  const auth = c.get('auth');
  const input = c.req.valid('json');
  const storage = createStorageProvider(c.env);
  const room = await storage.rooms.create(auth.userId, input);
  return c.json({ room }, 201);
});

roomRoutes.get('/:roomId', async (c) => {
  const auth = c.get('auth');
  const { roomId } = c.req.param();
  const storage = createStorageProvider(c.env);

  const membership = await storage.rooms.getMemberRole(roomId, auth.userId);
  if (!membership) {
    throw new NotFoundError('Room not found');
  }

  const room = await storage.rooms.findById(roomId);
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  const roomDrawers = await storage.drawers.findByRoom(roomId);
  const drawersWithCompartments = await Promise.all(
    roomDrawers.map(async (drawer) => {
      const drawerWithComps = await storage.drawers.findByIdWithCompartments(drawer.id);
      if (!drawerWithComps) return null;

      const compartmentsArray = Object.values(drawerWithComps.compartments).map((comp) => ({
        id: comp.id,
        drawerId: comp.drawerId,
        row: comp.row,
        col: comp.col,
        rowSpan: comp.rowSpan,
        colSpan: comp.colSpan,
        dividerOrientation: comp.dividerOrientation,
        subCompartments: comp.subCompartments.map((sub) => ({
          id: sub.id,
          compartmentId: sub.compartmentId,
          relativeSize: sub.relativeSize,
          sortOrder: sub.displayOrder,
          itemLabel: sub.itemLabel,
          itemCategoryId: sub.itemCategoryId,
          itemQuantity: sub.itemQuantity,
        })),
      }));

      return {
        id: drawer.id,
        name: drawer.name,
        rows: drawer.rows,
        cols: drawer.cols,
        gridX: drawer.gridX,
        gridY: drawer.gridY,
        roomId: drawer.roomId,
        sortOrder: drawer.displayOrder,
        compartments: compartmentsArray,
      };
    })
  );

  const roomCategories = await storage.categories.findByRoom(roomId);
  const members = await storage.rooms.getMembers(roomId);

  return c.json({
    room: {
      ...room,
      role: membership.role,
      canInvite: membership.canInvite,
      drawers: drawersWithCompartments.filter(Boolean),
      categories: roomCategories.map((cat) => ({
        id: cat.id,
        roomId: cat.roomId,
        name: cat.name,
        colorIndex: cat.colorIndex,
        color: cat.color,
      })),
      members: members.map((m) => ({
        userId: m.userId,
        username: m.username,
        role: m.role,
      })),
    },
  });
});

roomRoutes.patch('/:roomId', zValidator('json', updateRoomSchema), async (c) => {
  const auth = c.get('auth');
  const { roomId } = c.req.param();
  const input = c.req.valid('json');
  const storage = createStorageProvider(c.env);

  const membership = await storage.rooms.getMemberRole(roomId, auth.userId);
  if (!membership || !hasPermission(membership.role, 'room:update')) {
    throw new ForbiddenError();
  }

  const room = await storage.rooms.update(roomId, input);
  return c.json({ room });
});

roomRoutes.delete('/:roomId', async (c) => {
  const auth = c.get('auth');
  const { roomId } = c.req.param();
  const storage = createStorageProvider(c.env);

  const membership = await storage.rooms.getMemberRole(roomId, auth.userId);
  if (!membership || membership.role !== 'owner') {
    throw new ForbiddenError();
  }

  await storage.rooms.delete(roomId);
  return c.json({ success: true });
});

roomRoutes.get('/:roomId/members', async (c) => {
  const auth = c.get('auth');
  const { roomId } = c.req.param();
  const storage = createStorageProvider(c.env);

  const membership = await storage.rooms.getMemberRole(roomId, auth.userId);
  if (!membership) {
    throw new NotFoundError('Room not found');
  }

  const members = await storage.rooms.getMembers(roomId);
  return c.json({ members });
});

roomRoutes.post('/:roomId/invite', zValidator('json', inviteSchema), async (c) => {
  const auth = c.get('auth');
  const { roomId } = c.req.param();
  const { username, role, canInvite: inviteeCanInvite } = c.req.valid('json');
  const storage = createStorageProvider(c.env);

  const membership = await storage.rooms.getMemberRole(roomId, auth.userId);
  if (!membership) {
    throw new NotFoundError('Room not found');
  }

  if (!canInvite(membership.role, membership.canInvite)) {
    throw new ForbiddenError('You do not have permission to invite users');
  }

  if (roleLevel[role] > roleLevel[membership.role]) {
    throw new ForbiddenError('You cannot invite someone with a higher role than your own');
  }

  // Only owners can grant the canInvite permission
  const effectiveCanInvite = membership.role === 'owner' ? inviteeCanInvite : undefined;

  const invitee = await storage.users.findByUsername(username);
  if (!invitee) {
    throw new NotFoundError('User not found');
  }

  if (invitee.id === auth.userId) {
    throw new ForbiddenError('You cannot invite yourself');
  }

  const invitation = await storage.rooms.createInvitation(roomId, invitee.id, role, auth.userId, effectiveCanInvite);
  return c.json({ invitation }, 201);
});

roomRoutes.patch('/:roomId/members/:userId', zValidator('json', updateMemberSchema), async (c) => {
  const auth = c.get('auth');
  const { roomId, userId } = c.req.param();
  const input = c.req.valid('json');
  const storage = createStorageProvider(c.env);

  const membership = await storage.rooms.getMemberRole(roomId, auth.userId);
  if (!membership || membership.role !== 'owner') {
    throw new ForbiddenError('Only owners can update members');
  }

  if (userId === auth.userId && input.role && input.role !== 'owner') {
    throw new ForbiddenError('You cannot change your own owner role');
  }

  await storage.rooms.updateMember(roomId, userId, input);
  return c.json({ success: true });
});

roomRoutes.delete('/:roomId/members/:userId', async (c) => {
  const auth = c.get('auth');
  const { roomId, userId } = c.req.param();
  const storage = createStorageProvider(c.env);

  const membership = await storage.rooms.getMemberRole(roomId, auth.userId);
  if (!membership) {
    throw new NotFoundError('Room not found');
  }

  if (userId === auth.userId) {
    if (membership.role === 'owner') {
      throw new ForbiddenError('Owner cannot leave the room');
    }
    await storage.rooms.removeMember(roomId, userId);

    // Notify the Durable Object to kick the user (self-removal)
    const doId = c.env.ROOM_SYNC.idFromName(roomId);
    const stub = c.env.ROOM_SYNC.get(doId);
    await stub.fetch(`http://internal/kick-user/${userId}?roomId=${roomId}`, { method: 'POST' });

    return c.json({ success: true });
  }

  if (!hasPermission(membership.role, 'member:remove')) {
    throw new ForbiddenError();
  }

  await storage.rooms.removeMember(roomId, userId);

  // Notify the Durable Object to kick the removed user
  const doId = c.env.ROOM_SYNC.idFromName(roomId);
  const stub = c.env.ROOM_SYNC.get(doId);
  await stub.fetch(`http://internal/kick-user/${userId}?roomId=${roomId}`, { method: 'POST' });

  return c.json({ success: true });
});

roomRoutes.get('/:roomId/invitations', async (c) => {
  const auth = c.get('auth');
  const { roomId } = c.req.param();
  const storage = createStorageProvider(c.env);

  const membership = await storage.rooms.getMemberRole(roomId, auth.userId);
  if (!membership) {
    throw new NotFoundError('Room not found');
  }

  if (!canInvite(membership.role, membership.canInvite)) {
    throw new ForbiddenError('You do not have permission to view invitations');
  }

  const invitations = await storage.rooms.findPendingInvitationsForRoom(roomId);
  return c.json({ invitations });
});

roomRoutes.delete('/:roomId/invitations/:invitationId', async (c) => {
  const auth = c.get('auth');
  const { roomId, invitationId } = c.req.param();
  const storage = createStorageProvider(c.env);

  const membership = await storage.rooms.getMemberRole(roomId, auth.userId);
  if (!membership) {
    throw new NotFoundError('Room not found');
  }

  if (!canInvite(membership.role, membership.canInvite)) {
    throw new ForbiddenError('You do not have permission to cancel invitations');
  }

  const invitation = await storage.rooms.findInvitation(invitationId);
  if (!invitation || invitation.roomId !== roomId) {
    throw new NotFoundError('Invitation not found');
  }

  await storage.rooms.deleteInvitation(invitationId);
  return c.json({ success: true });
});
