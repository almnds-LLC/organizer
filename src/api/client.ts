const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface User {
  id: string;
  username: string;
  displayName: string | null;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface RoomSummary {
  id: string;
  ownerId: string;
  name: string;
  isDefault: boolean;
  role: 'owner' | 'editor' | 'viewer';
  canInvite: boolean;
  drawerCount: number;
}

export interface Room {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

export interface ApiDrawer {
  id: string;
  name: string;
  rows: number;
  cols: number;
  gridX: number;
  gridY: number;
  roomId: string;
  sortOrder: number;
}

export interface ApiCompartment {
  id: string;
  drawerId: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  dividerOrientation: 'horizontal' | 'vertical';
}

export interface ApiSubCompartment {
  id: string;
  compartmentId: string;
  relativeSize: number;
  sortOrder: number;
  itemLabel: string | null;
  itemCategoryId: string | null;
  itemQuantity: number | null;
}

export interface ApiCategory {
  id: string;
  roomId: string;
  name: string;
  colorIndex: number | null;
  color: string | null;
}

export interface DrawerWithCompartments extends ApiDrawer {
  compartments: Array<ApiCompartment & { subCompartments: ApiSubCompartment[] }>;
}

export interface RoomWithDrawers extends Room {
  drawers: DrawerWithCompartments[];
  categories: ApiCategory[];
  members: Array<{ userId: string; username: string; role: string }>;
}

export interface Invitation {
  id: string;
  roomId: string;
  roomName: string;
  inviterId: string;
  inviterUsername: string;
  role: 'owner' | 'editor' | 'viewer';
  createdAt: string;
}

export interface PendingInvitation {
  id: string;
  roomId: string;
  inviteeId: string;
  inviteeUsername: string;
  role: 'owner' | 'editor' | 'viewer';
  canInvite: boolean;
  invitedBy: string;
  createdAt: string;
}

export type RoomRole = 'owner' | 'editor' | 'viewer';

class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  setToken(token: string | null) {
    this.accessToken = token;
  }

  getToken(): string | null {
    return this.accessToken;
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include', // For cookies
    });

    // Handle 401 - try to refresh token
    if (response.status === 401 && !path.includes('/auth/refresh') && !path.includes('/auth/login') && !path.includes('/auth/register')) {
      const newToken = await this.refreshToken();
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers,
          credentials: 'include',
        });
        if (!retryResponse.ok) {
          const error = await retryResponse.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(error.error || 'Request failed');
        }
        return retryResponse.json();
      }
      throw new Error('Session expired');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
      // Handle different error formats
      let errorMessage = 'Request failed';
      if (typeof errorData.error === 'string') {
        errorMessage = errorData.error;
      } else if (errorData.error?.issues?.[0]?.message) {
        // Zod validation error format
        errorMessage = errorData.error.issues[0].message;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Auth endpoints
  async register(username: string, password: string, turnstileToken: string, displayName?: string): Promise<AuthResponse> {
    const response = await this.fetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName, turnstileToken }),
    });
    this.accessToken = response.accessToken;
    return response;
  }

  async login(username: string, password: string, turnstileToken: string): Promise<AuthResponse> {
    const response = await this.fetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, turnstileToken }),
    });
    this.accessToken = response.accessToken;
    return response;
  }

  async logout(): Promise<void> {
    await this.fetch('/auth/logout', { method: 'POST' });
    this.accessToken = null;
  }

  async refreshToken(): Promise<string | null> {
    // Prevent multiple simultaneous refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          this.accessToken = null;
          return null;
        }

        const data = await response.json() as { accessToken: string };
        this.accessToken = data.accessToken;
        return data.accessToken;
      } catch {
        this.accessToken = null;
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async getMe(): Promise<{ user: User }> {
    return this.fetch('/auth/me');
  }

  // Room endpoints
  async getRooms(): Promise<RoomSummary[]> {
    const response = await this.fetch<{ rooms: RoomSummary[] }>('/rooms');
    return response.rooms;
  }

  async getRoom(roomId: string): Promise<RoomWithDrawers> {
    const response = await this.fetch<{ room: RoomWithDrawers }>(`/rooms/${roomId}`);
    return response.room;
  }

  async createRoom(name: string): Promise<Room> {
    const response = await this.fetch<{ room: Room }>('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return response.room;
  }

  // Drawer endpoints
  async getDrawers(roomId: string): Promise<ApiDrawer[]> {
    const response = await this.fetch<{ drawers: ApiDrawer[] }>(`/rooms/${roomId}/drawers`);
    return response.drawers;
  }

  async getDrawer(roomId: string, drawerId: string): Promise<DrawerWithCompartments> {
    const response = await this.fetch<{ drawer: DrawerWithCompartments }>(`/rooms/${roomId}/drawers/${drawerId}`);
    return response.drawer;
  }

  async createDrawer(roomId: string, input: {
    name: string;
    rows?: number;
    cols?: number;
    gridX?: number;
    gridY?: number;
  }): Promise<DrawerWithCompartments> {
    const response = await this.fetch<{ drawer: DrawerWithCompartments }>(`/rooms/${roomId}/drawers`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return response.drawer;
  }

  async updateDrawer(roomId: string, drawerId: string, input: {
    name?: string;
    gridX?: number;
    gridY?: number;
    updatedAt?: number;
  }): Promise<ApiDrawer> {
    const response = await this.fetch<{ drawer: ApiDrawer }>(`/rooms/${roomId}/drawers/${drawerId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return response.drawer;
  }

  async deleteDrawer(roomId: string, drawerId: string): Promise<void> {
    await this.fetch(`/rooms/${roomId}/drawers/${drawerId}`, { method: 'DELETE' });
  }

  // Compartment endpoints
  async updateCompartment(drawerId: string, compartmentId: string, input: {
    dividerOrientation?: 'horizontal' | 'vertical';
    updatedAt?: number;
  }): Promise<ApiCompartment> {
    const response = await this.fetch<{ compartment: ApiCompartment }>(`/drawers/${drawerId}/compartments/${compartmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return response.compartment;
  }

  async setDividerCount(drawerId: string, compartmentId: string, count: number): Promise<ApiSubCompartment[]> {
    const response = await this.fetch<{ subCompartments: ApiSubCompartment[] }>(`/drawers/${drawerId}/compartments/${compartmentId}/dividers`, {
      method: 'PUT',
      body: JSON.stringify({ count }),
    });
    return response.subCompartments;
  }

  async updateSubCompartment(drawerId: string, subCompartmentId: string, input: {
    itemLabel?: string | null;
    itemCategoryId?: string | null;
    itemQuantity?: number | null;
    updatedAt?: number;
  }): Promise<ApiSubCompartment> {
    const response = await this.fetch<{ subCompartment: ApiSubCompartment }>(`/drawers/${drawerId}/sub-compartments/${subCompartmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return response.subCompartment;
  }

  async batchUpdateSubCompartments(drawerId: string, updates: Array<{
    id: string;
    itemLabel?: string | null;
    itemCategoryId?: string | null;
    itemQuantity?: number | null;
  }>): Promise<void> {
    await this.fetch(`/drawers/${drawerId}/sub-compartments/batch`, {
      method: 'PATCH',
      body: JSON.stringify({ updates }),
    });
  }

  async mergeCompartments(drawerId: string, compartmentIds: string[]): Promise<{
    compartment: ApiCompartment & { subCompartments: ApiSubCompartment[] };
    deletedIds: string[];
  }> {
    return this.fetch(`/drawers/${drawerId}/compartments/merge`, {
      method: 'POST',
      body: JSON.stringify({ compartmentIds }),
    });
  }

  async splitCompartment(drawerId: string, compartmentId: string): Promise<{
    compartments: Array<ApiCompartment & { subCompartments: ApiSubCompartment[] }>;
  }> {
    return this.fetch(`/drawers/${drawerId}/compartments/${compartmentId}/split`, {
      method: 'POST',
    });
  }

  // Category endpoints
  async getCategories(roomId: string): Promise<ApiCategory[]> {
    const response = await this.fetch<{ categories: ApiCategory[] }>(`/rooms/${roomId}/categories`);
    return response.categories;
  }

  async createCategory(roomId: string, input: {
    name: string;
    colorIndex?: number;
    color?: string;
  }): Promise<ApiCategory> {
    const response = await this.fetch<{ category: ApiCategory }>(`/rooms/${roomId}/categories`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return response.category;
  }

  async updateCategory(roomId: string, categoryId: string, input: {
    name?: string;
    colorIndex?: number;
    color?: string;
    updatedAt?: number;
  }): Promise<ApiCategory> {
    const response = await this.fetch<{ category: ApiCategory }>(`/rooms/${roomId}/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return response.category;
  }

  async deleteCategory(roomId: string, categoryId: string): Promise<void> {
    await this.fetch(`/rooms/${roomId}/categories/${categoryId}`, { method: 'DELETE' });
  }

  // Invitation endpoints
  async getInvitations(): Promise<Invitation[]> {
    const response = await this.fetch<{ invitations: Invitation[] }>('/invitations');
    return response.invitations;
  }

  async inviteUser(
    roomId: string,
    username: string,
    role: 'owner' | 'editor' | 'viewer' = 'editor',
    canInvite?: boolean
  ): Promise<Invitation> {
    const response = await this.fetch<{ invitation: Invitation }>(`/rooms/${roomId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ username, role, canInvite }),
    });
    return response.invitation;
  }

  async acceptInvitation(invitationId: string): Promise<void> {
    await this.fetch(`/invitations/${invitationId}/accept`, { method: 'POST' });
  }

  async declineInvitation(invitationId: string): Promise<void> {
    await this.fetch(`/invitations/${invitationId}`, { method: 'DELETE' });
  }

  // Room management
  async updateRoom(roomId: string, input: { name?: string }): Promise<Room> {
    const response = await this.fetch<{ room: Room }>(`/rooms/${roomId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return response.room;
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.fetch(`/rooms/${roomId}`, { method: 'DELETE' });
  }

  // Room members
  async getMembers(roomId: string): Promise<Array<{ userId: string; username: string; role: string; canInvite: boolean }>> {
    const response = await this.fetch<{ members: Array<{ userId: string; username: string; role: string; canInvite: boolean }> }>(`/rooms/${roomId}/members`);
    return response.members;
  }

  async updateMember(roomId: string, userId: string, input: { role?: 'owner' | 'editor' | 'viewer'; canInvite?: boolean }): Promise<void> {
    await this.fetch(`/rooms/${roomId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    await this.fetch(`/rooms/${roomId}/members/${userId}`, { method: 'DELETE' });
  }

  // Pending invitations for a room (sent invites)
  async getPendingInvitations(roomId: string): Promise<PendingInvitation[]> {
    const response = await this.fetch<{ invitations: PendingInvitation[] }>(`/rooms/${roomId}/invitations`);
    return response.invitations;
  }

  async cancelInvitation(roomId: string, invitationId: string): Promise<void> {
    await this.fetch(`/rooms/${roomId}/invitations/${invitationId}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
