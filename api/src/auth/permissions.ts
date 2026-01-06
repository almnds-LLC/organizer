import type { RoomRole } from '../storage/types';
import { ForbiddenError } from '../lib/errors';

export type Permission =
  | 'room:read'
  | 'room:update'
  | 'room:delete'
  | 'drawer:read'
  | 'drawer:create'
  | 'drawer:update'
  | 'drawer:delete'
  | 'category:read'
  | 'category:create'
  | 'category:update'
  | 'category:delete'
  | 'member:read'
  | 'member:remove'
  | 'member:update';

const rolePermissions: Record<RoomRole, Permission[]> = {
  owner: [
    'room:read',
    'room:update',
    'room:delete',
    'drawer:read',
    'drawer:create',
    'drawer:update',
    'drawer:delete',
    'category:read',
    'category:create',
    'category:update',
    'category:delete',
    'member:read',
    'member:remove',
    'member:update',
  ],
  editor: [
    'room:read',
    'room:update',
    'drawer:read',
    'drawer:create',
    'drawer:update',
    'drawer:delete',
    'category:read',
    'category:create',
    'category:update',
    'category:delete',
    'member:read',
  ],
  viewer: ['room:read', 'drawer:read', 'category:read', 'member:read'],
};

export function hasPermission(role: RoomRole | null, permission: Permission): boolean {
  if (!role) return false;
  return rolePermissions[role].includes(permission);
}

export function requirePermission(role: RoomRole | null, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

export function canInvite(role: RoomRole, canInviteFlag: boolean): boolean {
  // Owners always can invite
  if (role === 'owner') return true;
  // Others need explicit permission
  return canInviteFlag;
}
