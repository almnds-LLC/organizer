import { create } from 'zustand';
import { api } from '../api/client';
import { roomWebSocket } from '../api/websocket';
import { useDrawerStore } from './drawerStore';
import { useCursorStore } from './cursorStore';
import type { User, RoomSummary, RoomWithDrawers, Invitation, PendingInvitation } from '../api/client';

export type AuthMode = 'local' | 'online';

export interface RoomMember {
  userId: string;
  username: string;
  role: string;
  canInvite: boolean;
}

interface AuthState {
  // User state
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  // Room state
  currentRoomId: string | null;
  rooms: RoomSummary[];

  // Invitations
  invitations: Invitation[];

  // Mode
  mode: AuthMode;

  // Actions
  login: (username: string, password: string, turnstileToken: string) => Promise<void>;
  register: (username: string, password: string, turnstileToken: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  setCurrentRoom: (roomId: string) => void;
  loadRooms: () => Promise<void>;
  getCurrentRoom: () => Promise<RoomWithDrawers | null>;
  createRoom: (name: string) => Promise<void>;
  migrateLocalData: () => Promise<void>;
  // Room management actions
  updateRoom: (roomId: string, name: string) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
  getMembers: (roomId: string) => Promise<RoomMember[]>;
  removeMember: (roomId: string, userId: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
  // Invitation actions
  loadInvitations: () => Promise<void>;
  inviteUser: (roomId: string, username: string, role?: 'owner' | 'editor' | 'viewer', canInvite?: boolean) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  declineInvitation: (invitationId: string) => Promise<void>;
  // Pending invitations (sent by current user)
  getPendingInvitations: (roomId: string) => Promise<PendingInvitation[]>;
  cancelInvitation: (roomId: string, invitationId: string) => Promise<void>;
  // Member management
  updateMember: (roomId: string, userId: string, input: { role?: 'owner' | 'editor' | 'viewer'; canInvite?: boolean }) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,
  currentRoomId: null,
  rooms: [],
  invitations: [],
  mode: 'local',

  login: async (username, password, turnstileToken) => {
    set({ isLoading: true });
    try {
      const response = await api.login(username, password, turnstileToken);

      // Load rooms
      const rooms = await api.getRooms();

      // Try to restore last viewed room, fall back to user's own default room
      const savedRoomId = localStorage.getItem('organizer-current-room');
      const savedRoom = savedRoomId ? rooms.find(r => r.id === savedRoomId) : null;
      const defaultRoom = rooms.find(r => r.isDefault && r.ownerId === response.user.id) || rooms[0];
      const currentRoom = savedRoom || defaultRoom;

      set({
        user: response.user,
        isAuthenticated: true,
        mode: 'online',
        rooms,
        currentRoomId: currentRoom?.id || null,
        isLoading: false,
      });

      // Load invitations (no migration on login - only on register)
      await get().loadInvitations();

      // Clear any local data to prevent it from being imported into a different account
      localStorage.removeItem('drawer-organizer-state');
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (username, password, turnstileToken) => {
    set({ isLoading: true });
    try {
      const response = await api.register(username, password, turnstileToken);

      // Load rooms (should have a default room created)
      const rooms = await api.getRooms();
      // For new user, use their own default room
      const defaultRoom = rooms.find(r => r.isDefault && r.ownerId === response.user.id) || rooms[0];

      set({
        user: response.user,
        isAuthenticated: true,
        mode: 'online',
        rooms,
        currentRoomId: defaultRoom?.id || null,
        isLoading: false,
      });

      // Load invitations and migrate local data
      await get().loadInvitations();
      await get().migrateLocalData();
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      // Ignore errors, still clear local state
    }

    // Disconnect WebSocket and clear cursors
    roomWebSocket.disconnect();
    useCursorStore.getState().clearAllCursors();

    // Clear room data from localStorage
    useDrawerStore.getState().clearRoomData();

    // Clear current room preference
    localStorage.removeItem('organizer-current-room');

    set({
      user: null,
      isAuthenticated: false,
      mode: 'local',
      rooms: [],
      currentRoomId: null,
      invitations: [],
    });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      // Try to refresh the access token
      const token = await api.refreshToken();

      if (!token) {
        set({ isLoading: false, isInitialized: true });
        return false;
      }

      const { user } = await api.getMe();
      const rooms = await api.getRooms();

      // Try to restore last viewed room, fall back to user's own default room
      const savedRoomId = localStorage.getItem('organizer-current-room');
      const savedRoom = savedRoomId ? rooms.find(r => r.id === savedRoomId) : null;
      const defaultRoom = rooms.find(r => r.isDefault && r.ownerId === user.id) || rooms[0];
      const currentRoom = savedRoom || defaultRoom;

      set({
        user,
        isAuthenticated: true,
        mode: 'online',
        rooms,
        currentRoomId: currentRoom?.id || null,
        isLoading: false,
        isInitialized: true,
      });

      // Load invitations in background
      get().loadInvitations();

      return true;
    } catch {
      set({ isLoading: false, isInitialized: true });
      return false;
    }
  },

  setCurrentRoom: (roomId) => {
    set({ currentRoomId: roomId });
    // Persist to localStorage for page refresh
    if (roomId) {
      localStorage.setItem('organizer-current-room', roomId);
    } else {
      localStorage.removeItem('organizer-current-room');
    }
  },

  loadRooms: async () => {
    const rooms = await api.getRooms();
    set({ rooms });
  },

  getCurrentRoom: async () => {
    const { currentRoomId } = get();
    if (!currentRoomId) return null;
    return api.getRoom(currentRoomId);
  },

  createRoom: async (name: string) => {
    const newRoom = await api.createRoom(name);
    const rooms = await api.getRooms();
    set({
      rooms,
      currentRoomId: newRoom.id,
    });
  },

  updateRoom: async (roomId: string, name: string) => {
    await api.updateRoom(roomId, { name });
    const rooms = await api.getRooms();
    set({ rooms });
  },

  deleteRoom: async (roomId: string) => {
    const { currentRoomId } = get();
    await api.deleteRoom(roomId);
    const updatedRooms = await api.getRooms();

    // If we deleted the current room, switch to the first available room
    let newCurrentRoomId = currentRoomId;
    if (currentRoomId === roomId) {
      const newRoom = updatedRooms.find(r => r.isDefault) || updatedRooms[0];
      newCurrentRoomId = newRoom?.id || null;
    }

    set({
      rooms: updatedRooms,
      currentRoomId: newCurrentRoomId,
    });
  },

  getMembers: async (roomId: string) => {
    return api.getMembers(roomId);
  },

  removeMember: async (roomId: string, userId: string) => {
    await api.removeMember(roomId, userId);
  },

  leaveRoom: async (roomId: string) => {
    const { user, currentRoomId } = get();
    if (!user) return;

    await api.removeMember(roomId, user.id);
    const rooms = await api.getRooms();

    // If we left the current room, switch to user's own default room
    let newCurrentRoomId = currentRoomId;
    if (currentRoomId === roomId) {
      const newRoom = rooms.find(r => r.isDefault && r.ownerId === user.id) || rooms[0];
      newCurrentRoomId = newRoom?.id || null;
    }

    set({
      rooms,
      currentRoomId: newCurrentRoomId,
    });
  },

  migrateLocalData: async () => {
    const { currentRoomId, rooms, user } = get();
    if (!currentRoomId || !user) return;

    // Only migrate to the user's own default room (where they are the original creator)
    const currentRoom = rooms.find(r => r.id === currentRoomId);
    if (!currentRoom?.isDefault || currentRoom.ownerId !== user.id) {
      // Not the user's own default room - don't migrate into shared rooms
      return;
    }

    // Check if there's local data to migrate
    const localStorageKey = 'drawer-organizer-state';
    const localData = localStorage.getItem(localStorageKey);
    if (!localData) return;

    try {
      const parsed = JSON.parse(localData);
      const state = parsed.state;

      if (!state?.drawers || Object.keys(state.drawers).length === 0) {
        // No drawers to migrate, clear localStorage anyway
        localStorage.removeItem(localStorageKey);
        return;
      }

      // Check if the room already has drawers - don't overwrite existing data
      const roomData = await api.getRoom(currentRoomId);
      if (roomData.drawers.length > 0) {
        // Room already has data, don't migrate
        // Clear localStorage to prevent future migration attempts
        localStorage.removeItem(localStorageKey);
        console.log('Room already has data, skipping migration');
        return;
      }

      // Migrate categories first
      const categoryIdMap: Record<string, string> = {};
      if (state.categories) {
        for (const category of Object.values(state.categories) as Array<{ id: string; name: string; colorIndex?: number; color?: string }>) {
          try {
            const newCategory = await api.createCategory(currentRoomId, {
              name: category.name,
              colorIndex: category.colorIndex,
              color: category.color,
            });
            categoryIdMap[category.id] = newCategory.id;
          } catch {
            // Category might already exist, continue
          }
        }
      }

      // Migrate drawers
      const drawerOrder = state.drawerOrder || Object.keys(state.drawers);
      for (const drawerId of drawerOrder) {
        const drawer = state.drawers[drawerId];
        if (!drawer) continue;

        try {
          const newDrawer = await api.createDrawer(currentRoomId, {
            name: drawer.name,
            rows: drawer.rows,
            cols: drawer.cols,
            gridX: drawer.gridX,
            gridY: drawer.gridY,
          });

          // Update compartments and sub-compartments
          for (const compartment of Object.values(drawer.compartments) as Array<{
            id: string;
            dividerOrientation: 'horizontal' | 'vertical';
            subCompartments: Array<{
              id: string;
              item: { label: string; categoryId?: string; quantity?: number } | null;
            }>;
          }>) {
            const newCompartment = newDrawer.compartments.find(
              c => c.row === (compartment as unknown as { row: number }).row && c.col === (compartment as unknown as { col: number }).col
            );
            if (!newCompartment) continue;

            if (compartment.dividerOrientation !== 'horizontal') {
              await api.updateCompartment(newDrawer.id, newCompartment.id, {
                dividerOrientation: compartment.dividerOrientation,
              });
            }

            // Set divider count if different
            const oldDividerCount = compartment.subCompartments.length - 1;
            const newDividerCount = newCompartment.subCompartments.length - 1;

            let subCompartments = newCompartment.subCompartments;
            if (oldDividerCount !== newDividerCount) {
              subCompartments = await api.setDividerCount(newDrawer.id, newCompartment.id, oldDividerCount);
            }

            // Update items in sub-compartments
            const updates: Array<{
              id: string;
              itemLabel?: string | null;
              itemCategoryId?: string | null;
              itemQuantity?: number | null;
            }> = [];

            compartment.subCompartments.forEach((sc, index) => {
              if (sc.item && subCompartments[index]) {
                updates.push({
                  id: subCompartments[index].id,
                  itemLabel: sc.item.label,
                  itemCategoryId: sc.item.categoryId ? categoryIdMap[sc.item.categoryId] || sc.item.categoryId : null,
                  itemQuantity: sc.item.quantity ?? null,
                });
              }
            });

            if (updates.length > 0) {
              await api.batchUpdateSubCompartments(newDrawer.id, updates);
            }
          }
        } catch (error) {
          console.error('Failed to migrate drawer:', drawer.name, error);
        }
      }

      // Clear local storage after successful migration
      localStorage.removeItem(localStorageKey);
      console.log('Local data migrated successfully');
    } catch (error) {
      console.error('Failed to migrate local data:', error);
    }
  },

  loadInvitations: async () => {
    try {
      const invitations = await api.getInvitations();
      set({ invitations });
    } catch (error) {
      console.error('Failed to load invitations:', error);
    }
  },

  inviteUser: async (roomId, username, role = 'editor', canInvite) => {
    await api.inviteUser(roomId, username, role, canInvite);
  },

  acceptInvitation: async (invitationId) => {
    await api.acceptInvitation(invitationId);
    // Reload rooms and invitations
    const [rooms, invitations] = await Promise.all([
      api.getRooms(),
      api.getInvitations(),
    ]);
    set({ rooms, invitations });
  },

  declineInvitation: async (invitationId) => {
    await api.declineInvitation(invitationId);
    // Reload invitations
    const invitations = await api.getInvitations();
    set({ invitations });
  },

  getPendingInvitations: async (roomId) => {
    return api.getPendingInvitations(roomId);
  },

  cancelInvitation: async (roomId, invitationId) => {
    await api.cancelInvitation(roomId, invitationId);
  },

  updateMember: async (roomId, userId, input) => {
    await api.updateMember(roomId, userId, input);
  },
}));

// Register auth failure handler to clear state when token refresh fails
api.setAuthFailureHandler(() => {
  roomWebSocket.disconnect();
  useCursorStore.getState().clearAllCursors();
  useDrawerStore.getState().clearRoomData();
  localStorage.removeItem('organizer-current-room');

  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    mode: 'local',
    rooms: [],
    currentRoomId: null,
    invitations: [],
  });
});
