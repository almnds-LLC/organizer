import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createStorageProvider, createRealtimeProvider, type CloudflareBindings } from '../providers/cloudflare';
import type { IStorageProvider } from '../providers/storage';
import { authMiddleware, type AuthContext } from '../auth/middleware';
import { hasPermission } from '../auth/permissions';
import { NotFoundError, ForbiddenError } from '../lib/errors';
import type { SyncMessage } from '../durable-objects/types';

const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  colorIndex: z.number().int().min(0).max(9).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  colorIndex: z.number().int().min(0).max(9).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  updatedAt: z.number().optional(),
});

type Variables = { auth: AuthContext };

export const categoryRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

categoryRoutes.use('*', async (c, next) => {
  const middleware = authMiddleware(c.env.JWT_SECRET);
  return middleware(c, next);
});

async function checkRoomAccess(
  storage: IStorageProvider,
  roomId: string,
  userId: string,
  permission: 'category:read' | 'category:create' | 'category:update' | 'category:delete'
) {
  const membership = await storage.rooms.getMemberRole(roomId, userId);
  if (!membership) {
    throw new NotFoundError('Room not found');
  }
  if (!hasPermission(membership.role, permission)) {
    throw new ForbiddenError();
  }
  return membership;
}

categoryRoutes.get('/rooms/:roomId/categories', async (c) => {
  const auth = c.get('auth');
  const { roomId } = c.req.param();
  const storage = createStorageProvider(c.env);

  await checkRoomAccess(storage, roomId, auth.userId, 'category:read');

  const categories = await storage.categories.findByRoom(roomId);
  return c.json({ categories });
});

categoryRoutes.post(
  '/rooms/:roomId/categories',
  zValidator('json', createCategorySchema),
  async (c) => {
    const auth = c.get('auth');
    const { roomId } = c.req.param();
    const input = c.req.valid('json');
    const storage = createStorageProvider(c.env);

    await checkRoomAccess(storage, roomId, auth.userId, 'category:create');

    const category = await storage.categories.create(roomId, input);

    const realtime = createRealtimeProvider(c.env);
    await realtime.getRoom(roomId).broadcast({
      type: 'category_created',
      category: {
        id: category.id,
        name: category.name,
        colorIndex: category.colorIndex ?? undefined,
        color: category.color ?? undefined,
      },
    } as SyncMessage);

    return c.json({ category }, 201);
  }
);

categoryRoutes.patch(
  '/rooms/:roomId/categories/:categoryId',
  zValidator('json', updateCategorySchema),
  async (c) => {
    const auth = c.get('auth');
    const { roomId, categoryId } = c.req.param();
    const input = c.req.valid('json');
    const storage = createStorageProvider(c.env);

    await checkRoomAccess(storage, roomId, auth.userId, 'category:update');

    const existing = await storage.categories.findById(categoryId);
    if (!existing || existing.roomId !== roomId) {
      throw new NotFoundError('Category not found');
    }

    const category = await storage.categories.update(categoryId, input);

    if (!category) {
      return c.json({ category: existing, skipped: true });
    }

    const realtime = createRealtimeProvider(c.env);
    await realtime.getRoom(roomId).broadcast({
      type: 'category_updated',
      categoryId,
      changes: {
        name: category.name,
        colorIndex: category.colorIndex ?? undefined,
        color: category.color ?? undefined,
      },
    } as SyncMessage);

    return c.json({ category });
  }
);

categoryRoutes.delete('/rooms/:roomId/categories/:categoryId', async (c) => {
  const auth = c.get('auth');
  const { roomId, categoryId } = c.req.param();
  const storage = createStorageProvider(c.env);

  await checkRoomAccess(storage, roomId, auth.userId, 'category:delete');

  const existing = await storage.categories.findById(categoryId);
  if (!existing || existing.roomId !== roomId) {
    throw new NotFoundError('Category not found');
  }

  await storage.categories.delete(categoryId);

  const realtime = createRealtimeProvider(c.env);
  await realtime.getRoom(roomId).broadcast({
    type: 'category_deleted',
    categoryId,
  } as SyncMessage);

  return c.json({ success: true });
});
