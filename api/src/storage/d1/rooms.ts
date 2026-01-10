import type {
  Room,
  RoomMember,
  RoomSummary,
  RoomRole,
  CreateRoomInput,
  RoomInvitation,
  UpdateMemberInput,
} from '../types';
import type { IRoomRepository } from '../interfaces';
import { generateId } from '../../lib/id';
import { NotFoundError, ForbiddenError, ConflictError } from '../../lib/errors';

export class RoomRepository implements IRoomRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<Room | null> {
    const row = await this.db
      .prepare('SELECT * FROM rooms WHERE id = ?')
      .bind(id)
      .first<RoomRow>();
    return row ? mapRowToRoom(row) : null;
  }

  async findByUser(userId: string): Promise<RoomSummary[]> {
    const rows = await this.db
      .prepare(
        `SELECT r.*, rm.role, rm.can_invite,
          (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) as member_count,
          (SELECT COUNT(*) FROM drawers WHERE room_id = r.id) as drawer_count
         FROM rooms r
         JOIN room_members rm ON r.id = rm.room_id
         WHERE rm.user_id = ?
         ORDER BY r.is_default DESC, r.name ASC`
      )
      .bind(userId)
      .all<RoomRow & { role: RoomRole; can_invite: number; member_count: number; drawer_count: number }>();

    return rows.results.map((row) => ({
      ...mapRowToRoom(row),
      role: row.role,
      canInvite: row.can_invite === 1,
      memberCount: row.member_count,
      drawerCount: row.drawer_count,
    }));
  }

  async getMemberRole(roomId: string, userId: string): Promise<{ role: RoomRole; canInvite: boolean } | null> {
    const row = await this.db
      .prepare('SELECT role, can_invite FROM room_members WHERE room_id = ? AND user_id = ?')
      .bind(roomId, userId)
      .first<{ role: RoomRole; can_invite: number }>();
    return row ? { role: row.role, canInvite: row.can_invite === 1 } : null;
  }

  async createDefault(ownerId: string, username: string): Promise<Room> {
    const id = generateId();
    const now = new Date().toISOString();
    const memberId = generateId();
    const roomName = `${username}'s Drawers`;

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO rooms (id, owner_id, name, is_default, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?)`
        )
        .bind(id, ownerId, roomName, now, now),
      this.db
        .prepare(
          `INSERT INTO room_members (id, room_id, user_id, role, can_invite, created_at)
           VALUES (?, ?, ?, 'owner', 1, ?)`
        )
        .bind(memberId, id, ownerId, now),
    ]);

    return {
      id,
      ownerId,
      name: roomName,
      description: null,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  async create(ownerId: string, input: CreateRoomInput): Promise<Room> {
    const id = generateId();
    const now = new Date().toISOString();
    const memberId = generateId();

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO rooms (id, owner_id, name, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(id, ownerId, input.name, input.description ?? null, now, now),
      this.db
        .prepare(
          `INSERT INTO room_members (id, room_id, user_id, role, can_invite, created_at)
           VALUES (?, ?, ?, 'owner', 1, ?)`
        )
        .bind(memberId, id, ownerId, now),
    ]);

    return {
      id,
      ownerId,
      name: input.name,
      description: input.description ?? null,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(id: string, input: Partial<CreateRoomInput>): Promise<Room> {
    const room = await this.findById(id);
    if (!room) throw new NotFoundError('Room not found');

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description ?? null);
    }

    if (updates.length === 0) return room;

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db
      .prepare(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return {
      ...room,
      name: input.name ?? room.name,
      description: input.description !== undefined ? (input.description ?? null) : room.description,
      updatedAt: now,
    };
  }

  async delete(id: string): Promise<void> {
    const room = await this.findById(id);
    if (!room) throw new NotFoundError('Room not found');
    if (room.isDefault) throw new ForbiddenError('Cannot delete default room');

    await this.db.prepare('DELETE FROM rooms WHERE id = ?').bind(id).run();
  }

  async getMembers(roomId: string): Promise<(RoomMember & { username: string; displayName: string | null })[]> {
    const rows = await this.db
      .prepare(
        `SELECT rm.*, u.username, u.display_name
         FROM room_members rm
         JOIN users u ON rm.user_id = u.id
         WHERE rm.room_id = ?
         ORDER BY rm.role = 'owner' DESC, u.username ASC`
      )
      .bind(roomId)
      .all<RoomMemberRow & { username: string; display_name: string | null }>();

    return rows.results.map((row) => ({
      ...mapRowToMember(row),
      username: row.username,
      displayName: row.display_name,
    }));
  }

  async addMember(
    roomId: string,
    userId: string,
    role: RoomRole,
    invitedBy: string,
    canInvite?: boolean
  ): Promise<RoomMember> {
    const id = generateId();
    const now = new Date().toISOString();
    const memberCanInvite = canInvite ?? (role === 'owner');

    await this.db
      .prepare(
        `INSERT INTO room_members (id, room_id, user_id, role, can_invite, invited_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, roomId, userId, role, memberCanInvite ? 1 : 0, invitedBy, now)
      .run();

    return {
      id,
      roomId,
      userId,
      role,
      canInvite: memberCanInvite,
      invitedBy,
      createdAt: now,
    };
  }

  async updateMember(roomId: string, userId: string, input: UpdateMemberInput): Promise<void> {
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (input.role !== undefined) {
      updates.push('role = ?');
      values.push(input.role);
    }
    if (input.canInvite !== undefined) {
      updates.push('can_invite = ?');
      values.push(input.canInvite ? 1 : 0);
    }

    if (updates.length === 0) return;

    values.push(roomId, userId);

    await this.db
      .prepare(`UPDATE room_members SET ${updates.join(', ')} WHERE room_id = ? AND user_id = ?`)
      .bind(...values)
      .run();
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?')
      .bind(roomId, userId)
      .run();
  }

  async createInvitation(
    roomId: string,
    inviteeId: string,
    role: RoomRole,
    invitedBy: string,
    canInvite?: boolean
  ): Promise<RoomInvitation> {
    const existing = await this.getMemberRole(roomId, inviteeId);
    if (existing) throw new ConflictError('User is already a member of this room');

    const existingInvite = await this.db
      .prepare('SELECT id FROM room_invitations WHERE room_id = ? AND invitee_id = ?')
      .bind(roomId, inviteeId)
      .first();
    if (existingInvite) throw new ConflictError('User has already been invited');

    const id = generateId();
    const now = new Date().toISOString();
    const inviteeCanInvite = canInvite ?? (role === 'owner');

    await this.db
      .prepare(
        `INSERT INTO room_invitations (id, room_id, invitee_id, role, can_invite, invited_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, roomId, inviteeId, role, inviteeCanInvite ? 1 : 0, invitedBy, now)
      .run();

    return {
      id,
      roomId,
      inviteeId,
      role,
      canInvite: inviteeCanInvite,
      invitedBy,
      createdAt: now,
    };
  }

  async findInvitation(id: string): Promise<RoomInvitation | null> {
    const row = await this.db
      .prepare('SELECT * FROM room_invitations WHERE id = ?')
      .bind(id)
      .first<RoomInvitationRow>();
    return row ? mapRowToInvitation(row) : null;
  }

  async findInvitationsForUser(userId: string): Promise<(RoomInvitation & { roomName: string; inviterUsername: string })[]> {
    const rows = await this.db
      .prepare(
        `SELECT ri.*, r.name as room_name, u.username as inviter_username
         FROM room_invitations ri
         JOIN rooms r ON ri.room_id = r.id
         JOIN users u ON ri.invited_by = u.id
         WHERE ri.invitee_id = ?
         ORDER BY ri.created_at DESC`
      )
      .bind(userId)
      .all<RoomInvitationRow & { room_name: string; inviter_username: string }>();

    return rows.results.map((row) => ({
      ...mapRowToInvitation(row),
      roomName: row.room_name,
      inviterUsername: row.inviter_username,
    }));
  }

  async acceptInvitation(id: string, userId: string): Promise<RoomMember> {
    const invitation = await this.findInvitation(id);
    if (!invitation) throw new NotFoundError('Invitation not found');
    if (invitation.inviteeId !== userId) throw new ForbiddenError('This invitation is not for you');

    const member = await this.addMember(
      invitation.roomId,
      userId,
      invitation.role,
      invitation.invitedBy,
      invitation.canInvite
    );

    await this.db.prepare('DELETE FROM room_invitations WHERE id = ?').bind(id).run();

    return member;
  }

  async deleteInvitation(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM room_invitations WHERE id = ?').bind(id).run();
  }

  async findPendingInvitationsForRoom(roomId: string): Promise<(RoomInvitation & { inviteeUsername: string })[]> {
    const rows = await this.db
      .prepare(
        `SELECT ri.*, u.username as invitee_username
         FROM room_invitations ri
         JOIN users u ON ri.invitee_id = u.id
         WHERE ri.room_id = ?
         ORDER BY ri.created_at DESC`
      )
      .bind(roomId)
      .all<RoomInvitationRow & { invitee_username: string }>();

    return rows.results.map((row) => ({
      ...mapRowToInvitation(row),
      inviteeUsername: row.invitee_username,
    }));
  }
}

interface RoomRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

interface RoomMemberRow {
  id: string;
  room_id: string;
  user_id: string;
  role: RoomRole;
  can_invite: number;
  invited_by: string | null;
  created_at: string;
}

interface RoomInvitationRow {
  id: string;
  room_id: string;
  invitee_id: string;
  role: RoomRole;
  can_invite: number;
  invited_by: string;
  created_at: string;
}

function mapRowToRoom(row: RoomRow): Room {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToMember(row: RoomMemberRow): RoomMember {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    role: row.role,
    canInvite: row.can_invite === 1,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
  };
}

function mapRowToInvitation(row: RoomInvitationRow): RoomInvitation {
  return {
    id: row.id,
    roomId: row.room_id,
    inviteeId: row.invitee_id,
    role: row.role,
    canInvite: row.can_invite === 1,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
  };
}
