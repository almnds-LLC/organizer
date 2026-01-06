import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createStorageProvider, type CloudflareBindings } from '../providers/cloudflare';
import type { IStorageProvider } from '../providers/storage';
import { authMiddleware, type AuthContext } from '../auth/middleware';
import { hasPermission } from '../auth/permissions';
import { NotFoundError, ForbiddenError } from '../lib/errors';

const createDrawerSchema = z.object({
  name: z.string().min(1).max(100),
  rows: z.number().int().min(1).max(20).optional(),
  cols: z.number().int().min(1).max(20).optional(),
  gridX: z.number().int().optional(),
  gridY: z.number().int().optional(),
});

const updateDrawerSchema = createDrawerSchema.partial();

const reorderSchema = z.object({
  drawerIds: z.array(z.string()),
});

const updateCompartmentSchema = z.object({
  dividerOrientation: z.enum(['horizontal', 'vertical']).optional(),
});

const setDividersSchema = z.object({
  count: z.number().int().min(0).max(10),
});

const updateSubCompartmentSchema = z.object({
  relativeSize: z.number().min(0).max(1).optional(),
  itemLabel: z.string().max(200).nullable().optional(),
  itemCategoryId: z.string().nullable().optional(),
  itemQuantity: z.number().int().min(0).nullable().optional(),
});

const batchUpdateSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string(),
      itemLabel: z.string().max(200).nullable().optional(),
      itemCategoryId: z.string().nullable().optional(),
      itemQuantity: z.number().int().min(0).nullable().optional(),
    })
  ),
});

type Variables = { auth: AuthContext };

export const drawerRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

drawerRoutes.use('*', async (c, next) => {
  const middleware = authMiddleware(c.env.JWT_SECRET);
  return middleware(c, next);
});

async function checkRoomAccess(
  storage: IStorageProvider,
  roomId: string,
  userId: string,
  permission: 'drawer:read' | 'drawer:create' | 'drawer:update' | 'drawer:delete'
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

drawerRoutes.get('/rooms/:roomId/drawers', async (c) => {
  const auth = c.get('auth');
  const { roomId } = c.req.param();
  const storage = createStorageProvider(c.env);

  await checkRoomAccess(storage, roomId, auth.userId, 'drawer:read');

  const roomDrawers = await storage.drawers.findByRoom(roomId);
  return c.json({ drawers: roomDrawers });
});

drawerRoutes.post('/rooms/:roomId/drawers', zValidator('json', createDrawerSchema), async (c) => {
  const auth = c.get('auth');
  const { roomId } = c.req.param();
  const input = c.req.valid('json');
  const storage = createStorageProvider(c.env);

  await checkRoomAccess(storage, roomId, auth.userId, 'drawer:create');

  const drawerWithComps = await storage.drawers.create(roomId, input);
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

  return c.json({
    drawer: {
      id: drawerWithComps.id,
      name: drawerWithComps.name,
      rows: drawerWithComps.rows,
      cols: drawerWithComps.cols,
      gridX: drawerWithComps.gridX,
      gridY: drawerWithComps.gridY,
      roomId: drawerWithComps.roomId,
      sortOrder: drawerWithComps.displayOrder,
      compartments: compartmentsArray,
    },
  }, 201);
});

drawerRoutes.get('/rooms/:roomId/drawers/:drawerId', async (c) => {
  const auth = c.get('auth');
  const { roomId, drawerId } = c.req.param();
  const storage = createStorageProvider(c.env);

  await checkRoomAccess(storage, roomId, auth.userId, 'drawer:read');

  const drawerWithComps = await storage.drawers.findByIdWithCompartments(drawerId);
  if (!drawerWithComps || drawerWithComps.roomId !== roomId) {
    throw new NotFoundError('Drawer not found');
  }

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

  return c.json({
    drawer: {
      id: drawerWithComps.id,
      name: drawerWithComps.name,
      rows: drawerWithComps.rows,
      cols: drawerWithComps.cols,
      gridX: drawerWithComps.gridX,
      gridY: drawerWithComps.gridY,
      roomId: drawerWithComps.roomId,
      sortOrder: drawerWithComps.displayOrder,
      compartments: compartmentsArray,
    },
  });
});

drawerRoutes.patch('/rooms/:roomId/drawers/:drawerId', zValidator('json', updateDrawerSchema), async (c) => {
  const auth = c.get('auth');
  const { roomId, drawerId } = c.req.param();
  const input = c.req.valid('json');
  const storage = createStorageProvider(c.env);

  await checkRoomAccess(storage, roomId, auth.userId, 'drawer:update');

  const existing = await storage.drawers.findById(drawerId);
  if (!existing || existing.roomId !== roomId) {
    throw new NotFoundError('Drawer not found');
  }

  const drawer = await storage.drawers.update(drawerId, input);
  return c.json({ drawer });
});

drawerRoutes.delete('/rooms/:roomId/drawers/:drawerId', async (c) => {
  const auth = c.get('auth');
  const { roomId, drawerId } = c.req.param();
  const storage = createStorageProvider(c.env);

  await checkRoomAccess(storage, roomId, auth.userId, 'drawer:delete');

  const existing = await storage.drawers.findById(drawerId);
  if (!existing || existing.roomId !== roomId) {
    throw new NotFoundError('Drawer not found');
  }

  await storage.drawers.delete(drawerId);
  return c.json({ success: true });
});

drawerRoutes.post('/rooms/:roomId/drawers/reorder', zValidator('json', reorderSchema), async (c) => {
  const auth = c.get('auth');
  const { roomId } = c.req.param();
  const { drawerIds } = c.req.valid('json');
  const storage = createStorageProvider(c.env);

  await checkRoomAccess(storage, roomId, auth.userId, 'drawer:update');

  await storage.drawers.reorder(roomId, drawerIds);
  return c.json({ success: true });
});

drawerRoutes.patch(
  '/drawers/:drawerId/compartments/:compartmentId',
  zValidator('json', updateCompartmentSchema),
  async (c) => {
    const auth = c.get('auth');
    const { drawerId, compartmentId } = c.req.param();
    const input = c.req.valid('json');
    const storage = createStorageProvider(c.env);

    const drawer = await storage.drawers.findById(drawerId);
    if (!drawer) {
      throw new NotFoundError('Drawer not found');
    }

    await checkRoomAccess(storage, drawer.roomId, auth.userId, 'drawer:update');

    const compartment = await storage.compartments.update(compartmentId, input);
    return c.json({ compartment });
  }
);

drawerRoutes.put(
  '/drawers/:drawerId/compartments/:compartmentId/dividers',
  zValidator('json', setDividersSchema),
  async (c) => {
    const auth = c.get('auth');
    const { drawerId, compartmentId } = c.req.param();
    const { count } = c.req.valid('json');
    const storage = createStorageProvider(c.env);

    const drawer = await storage.drawers.findById(drawerId);
    if (!drawer) {
      throw new NotFoundError('Drawer not found');
    }

    await checkRoomAccess(storage, drawer.roomId, auth.userId, 'drawer:update');

    const subs = await storage.compartments.setDividerCount(compartmentId, count);
    const subCompartments = subs.map((sub) => ({
      id: sub.id,
      compartmentId: sub.compartmentId,
      relativeSize: sub.relativeSize,
      sortOrder: sub.displayOrder,
      itemLabel: sub.itemLabel,
      itemCategoryId: sub.itemCategoryId,
      itemQuantity: sub.itemQuantity,
    }));

    return c.json({ subCompartments });
  }
);

drawerRoutes.patch(
  '/drawers/:drawerId/sub-compartments/batch',
  zValidator('json', batchUpdateSchema),
  async (c) => {
    const auth = c.get('auth');
    const { drawerId } = c.req.param();
    const { updates } = c.req.valid('json');
    const storage = createStorageProvider(c.env);

    const drawer = await storage.drawers.findById(drawerId);
    if (!drawer) {
      throw new NotFoundError('Drawer not found');
    }

    await checkRoomAccess(storage, drawer.roomId, auth.userId, 'drawer:update');

    await storage.subCompartments.updateBatch(
      updates.map((u) => ({
        id: u.id,
        input: {
          itemLabel: u.itemLabel,
          itemCategoryId: u.itemCategoryId,
          itemQuantity: u.itemQuantity,
        },
      }))
    );
    return c.json({ success: true });
  }
);

drawerRoutes.patch(
  '/drawers/:drawerId/sub-compartments/:subId',
  zValidator('json', updateSubCompartmentSchema),
  async (c) => {
    const auth = c.get('auth');
    const { drawerId, subId } = c.req.param();
    const input = c.req.valid('json');
    const storage = createStorageProvider(c.env);

    const drawer = await storage.drawers.findById(drawerId);
    if (!drawer) {
      throw new NotFoundError('Drawer not found');
    }

    await checkRoomAccess(storage, drawer.roomId, auth.userId, 'drawer:update');

    const sub = await storage.subCompartments.update(subId, input);
    return c.json({
      subCompartment: {
        id: sub.id,
        compartmentId: sub.compartmentId,
        relativeSize: sub.relativeSize,
        sortOrder: sub.displayOrder,
        itemLabel: sub.itemLabel,
        itemCategoryId: sub.itemCategoryId,
        itemQuantity: sub.itemQuantity,
      },
    });
  }
);

const mergeSchema = z.object({
  compartmentIds: z.array(z.string()).min(2),
});

drawerRoutes.post(
  '/drawers/:drawerId/compartments/merge',
  zValidator('json', mergeSchema),
  async (c) => {
    const auth = c.get('auth');
    const { drawerId } = c.req.param();
    const { compartmentIds } = c.req.valid('json');
    const storage = createStorageProvider(c.env);

    const drawer = await storage.drawers.findById(drawerId);
    if (!drawer) {
      throw new NotFoundError('Drawer not found');
    }

    await checkRoomAccess(storage, drawer.roomId, auth.userId, 'drawer:update');

    const result = await storage.compartments.merge(drawerId, compartmentIds);

    return c.json({
      compartment: {
        id: result.compartment.id,
        drawerId: result.compartment.drawerId,
        row: result.compartment.row,
        col: result.compartment.col,
        rowSpan: result.compartment.rowSpan,
        colSpan: result.compartment.colSpan,
        dividerOrientation: result.compartment.dividerOrientation,
        subCompartments: result.subCompartments.map((sub) => ({
          id: sub.id,
          compartmentId: sub.compartmentId,
          relativeSize: sub.relativeSize,
          sortOrder: sub.displayOrder,
          itemLabel: sub.itemLabel,
          itemCategoryId: sub.itemCategoryId,
          itemQuantity: sub.itemQuantity,
        })),
      },
      deletedIds: compartmentIds.filter((id) => id !== result.compartment.id),
    });
  }
);

drawerRoutes.post(
  '/drawers/:drawerId/compartments/:compartmentId/split',
  async (c) => {
    const auth = c.get('auth');
    const { drawerId, compartmentId } = c.req.param();
    const storage = createStorageProvider(c.env);

    const drawer = await storage.drawers.findById(drawerId);
    if (!drawer) {
      throw new NotFoundError('Drawer not found');
    }

    await checkRoomAccess(storage, drawer.roomId, auth.userId, 'drawer:update');

    const results = await storage.compartments.split(compartmentId);

    return c.json({
      compartments: results.map((r) => ({
        id: r.compartment.id,
        drawerId: r.compartment.drawerId,
        row: r.compartment.row,
        col: r.compartment.col,
        rowSpan: r.compartment.rowSpan,
        colSpan: r.compartment.colSpan,
        dividerOrientation: r.compartment.dividerOrientation,
        subCompartments: r.subCompartments.map((sub) => ({
          id: sub.id,
          compartmentId: sub.compartmentId,
          relativeSize: sub.relativeSize,
          sortOrder: sub.displayOrder,
          itemLabel: sub.itemLabel,
          itemCategoryId: sub.itemCategoryId,
          itemQuantity: sub.itemQuantity,
        })),
      })),
    });
  }
);
