import type {
  User,
  Room,
  RoomMember,
  RoomSummary,
  RoomRole,
  RoomInvitation,
  Drawer,
  DrawerWithCompartments,
  Compartment,
  SubCompartment,
  Category,
  CreateUserInput,
  CreateRoomInput,
  CreateDrawerInput,
  UpdateDrawerInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  UpdateCompartmentInput,
  UpdateSubCompartmentInput,
  UpdateMemberInput,
  RefreshToken,
} from '../types';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  searchByUsername(query: string, limit?: number): Promise<User[]>;
  create(input: CreateUserInput): Promise<User>;
  updatePassword(id: string, newPassword: string): Promise<void>;
  updateDisplayName(id: string, displayName: string | null): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IRefreshTokenRepository {
  create(userId: string): Promise<{ token: string; record: RefreshToken }>;
  findByToken(token: string): Promise<RefreshToken | null>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  deleteExpired(): Promise<number>;
}

export interface IRoomRepository {
  findById(id: string): Promise<Room | null>;
  findByUser(userId: string): Promise<RoomSummary[]>;
  getMemberRole(roomId: string, userId: string): Promise<{ role: RoomRole; canInvite: boolean } | null>;
  create(ownerId: string, input: CreateRoomInput): Promise<Room>;
  createDefault(ownerId: string, username: string): Promise<Room>;
  update(id: string, input: Partial<CreateRoomInput>): Promise<Room>;
  delete(id: string): Promise<void>;

  getMembers(roomId: string): Promise<(RoomMember & { username: string; displayName: string | null })[]>;
  addMember(roomId: string, userId: string, role: RoomRole, invitedBy: string, canInvite?: boolean): Promise<RoomMember>;
  updateMember(roomId: string, userId: string, input: UpdateMemberInput): Promise<void>;
  removeMember(roomId: string, userId: string): Promise<void>;

  createInvitation(roomId: string, inviteeId: string, role: RoomRole, invitedBy: string, canInvite?: boolean): Promise<RoomInvitation>;
  findInvitation(id: string): Promise<RoomInvitation | null>;
  findInvitationsForUser(userId: string): Promise<(RoomInvitation & { roomName: string; inviterUsername: string })[]>;
  findPendingInvitationsForRoom(roomId: string): Promise<(RoomInvitation & { inviteeUsername: string })[]>;
  acceptInvitation(id: string, userId: string): Promise<RoomMember>;
  deleteInvitation(id: string): Promise<void>;
}

export interface IDrawerRepository {
  findById(id: string): Promise<Drawer | null>;
  findByRoom(roomId: string): Promise<Drawer[]>;
  findByIdWithCompartments(id: string): Promise<DrawerWithCompartments | null>;
  create(roomId: string, input: CreateDrawerInput): Promise<DrawerWithCompartments>;
  update(id: string, input: UpdateDrawerInput): Promise<Drawer | null>; // null if skipped due to older timestamp
  delete(id: string): Promise<void>;
  reorder(roomId: string, drawerIds: string[]): Promise<void>;
}

export interface ICompartmentRepository {
  findById(id: string): Promise<Compartment | null>;
  update(id: string, input: UpdateCompartmentInput): Promise<Compartment | null>; // null if skipped
  setDividerCount(compartmentId: string, count: number): Promise<SubCompartment[]>;
  merge(drawerId: string, compartmentIds: string[]): Promise<{ compartment: Compartment; subCompartments: SubCompartment[] }>;
  split(compartmentId: string): Promise<Array<{ compartment: Compartment; subCompartments: SubCompartment[] }>>;
}

export interface ISubCompartmentRepository {
  findById(id: string): Promise<SubCompartment | null>;
  update(id: string, input: UpdateSubCompartmentInput): Promise<SubCompartment | null>; // null if skipped
  updateBatch(updates: Array<{ id: string; input: UpdateSubCompartmentInput }>): Promise<void>;
}

export interface ICategoryRepository {
  findById(id: string): Promise<Category | null>;
  findByRoom(roomId: string): Promise<Category[]>;
  create(roomId: string, input: CreateCategoryInput): Promise<Category>;
  update(id: string, input: UpdateCategoryInput): Promise<Category | null>; // null if skipped
  delete(id: string): Promise<void>;
}
