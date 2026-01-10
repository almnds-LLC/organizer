export interface User {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface Room {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RoomRole = 'owner' | 'editor' | 'viewer';

export interface RoomMember {
  id: string;
  roomId: string;
  userId: string;
  role: RoomRole;
  canInvite: boolean;
  invitedBy: string | null;
  createdAt: string;
}

export interface RoomInvitation {
  id: string;
  roomId: string;
  inviteeId: string;
  role: RoomRole;
  canInvite: boolean;
  invitedBy: string;
  createdAt: string;
}

export interface Category {
  id: string;
  roomId: string;
  name: string;
  colorIndex: number | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Drawer {
  id: string;
  roomId: string;
  name: string;
  rows: number;
  cols: number;
  gridX: number;
  gridY: number;
  compartmentWidth: number;
  compartmentHeight: number;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type DividerOrientation = 'horizontal' | 'vertical';

export interface Compartment {
  id: string;
  drawerId: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  dividerOrientation: DividerOrientation;
  createdAt: string;
  updatedAt: string;
}

export interface SubCompartment {
  id: string;
  compartmentId: string;
  displayOrder: number;
  relativeSize: number;
  itemLabel: string | null;
  itemCategoryId: string | null;
  itemQuantity: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompartmentWithSubs extends Compartment {
  subCompartments: SubCompartment[];
}

export interface DrawerWithCompartments extends Drawer {
  compartments: Record<string, CompartmentWithSubs>;
}

export interface RoomWithDrawers extends Room {
  drawers: DrawerWithCompartments[];
  categories: Category[];
  role: RoomRole;
  canInvite: boolean;
}

export interface RoomSummary extends Room {
  role: RoomRole;
  canInvite: boolean;
  memberCount: number;
  drawerCount: number;
}

export interface CreateUserInput {
  username: string;
  password: string;
  displayName?: string;
}

export interface CreateRoomInput {
  name: string;
  description?: string;
}

export interface CreateDrawerInput {
  name: string;
  rows?: number;
  cols?: number;
  gridX?: number;
  gridY?: number;
}

export interface UpdateDrawerInput {
  name?: string;
  rows?: number;
  cols?: number;
  gridX?: number;
  gridY?: number;
  compartmentWidth?: number;
  compartmentHeight?: number;
  updatedAt?: number;
}

export interface CreateCategoryInput {
  name: string;
  colorIndex?: number;
  color?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  colorIndex?: number | null;
  color?: string | null;
  updatedAt?: number;
}

export interface UpdateCompartmentInput {
  dividerOrientation?: DividerOrientation;
  updatedAt?: number;
}

export interface UpdateSubCompartmentInput {
  relativeSize?: number;
  itemLabel?: string | null;
  itemCategoryId?: string | null;
  itemQuantity?: number | null;
  updatedAt?: number;
}

export interface UpdateMemberInput {
  role?: RoomRole;
  canInvite?: boolean;
}
