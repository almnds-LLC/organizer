import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../../store/authStore';

// Mock the api client
vi.mock('../../api/client', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getRooms: vi.fn(),
    getRoom: vi.fn(),
    createRoom: vi.fn(),
    updateRoom: vi.fn(),
    deleteRoom: vi.fn(),
    getInvitations: vi.fn(),
    inviteUser: vi.fn(),
    acceptInvitation: vi.fn(),
    declineInvitation: vi.fn(),
    getPendingInvitations: vi.fn(),
    cancelInvitation: vi.fn(),
    getMembers: vi.fn(),
    removeMember: vi.fn(),
    updateMember: vi.fn(),
    refreshToken: vi.fn(),
    getMe: vi.fn(),
    createDrawer: vi.fn(),
    createCategory: vi.fn(),
    updateCompartment: vi.fn(),
    setDividerCount: vi.fn(),
    batchUpdateSubCompartments: vi.fn(),
    setAuthFailureHandler: vi.fn(),
  },
}));

import { api } from '../../api/client';

const mockApi = api as unknown as {
  login: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  getRooms: ReturnType<typeof vi.fn>;
  getRoom: ReturnType<typeof vi.fn>;
  createRoom: ReturnType<typeof vi.fn>;
  updateRoom: ReturnType<typeof vi.fn>;
  deleteRoom: ReturnType<typeof vi.fn>;
  getInvitations: ReturnType<typeof vi.fn>;
  inviteUser: ReturnType<typeof vi.fn>;
  acceptInvitation: ReturnType<typeof vi.fn>;
  declineInvitation: ReturnType<typeof vi.fn>;
  getPendingInvitations: ReturnType<typeof vi.fn>;
  cancelInvitation: ReturnType<typeof vi.fn>;
  getMembers: ReturnType<typeof vi.fn>;
  removeMember: ReturnType<typeof vi.fn>;
  updateMember: ReturnType<typeof vi.fn>;
  refreshToken: ReturnType<typeof vi.fn>;
  getMe: ReturnType<typeof vi.fn>;
  createDrawer: ReturnType<typeof vi.fn>;
  createCategory: ReturnType<typeof vi.fn>;
  updateCompartment: ReturnType<typeof vi.fn>;
  setDividerCount: ReturnType<typeof vi.fn>;
  batchUpdateSubCompartments: ReturnType<typeof vi.fn>;
};

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      isInitialized: false,
      currentRoomId: null,
      rooms: [],
      invitations: [],
      mode: 'local',
    });
  });

  describe('initial state', () => {
    it('should start in local mode', () => {
      const state = useAuthStore.getState();
      expect(state.mode).toBe('local');
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });
  });

  describe('login', () => {
    it('should set user and switch to online mode on success', async () => {
      const mockUser = { id: 'user1', username: 'testuser', displayName: null };
      const mockRooms = [{ id: 'room1', name: 'Test Room', isDefault: true, ownerId: 'user1' }];

      mockApi.login.mockResolvedValueOnce({ user: mockUser, accessToken: 'token' });
      mockApi.getRooms.mockResolvedValueOnce(mockRooms);
      mockApi.getInvitations.mockResolvedValueOnce([]);

      const { login } = useAuthStore.getState();
      await login('testuser', 'password123', 'turnstile-token');

      const state = useAuthStore.getState();
      expect(state.user?.username).toBe('testuser');
      expect(state.isAuthenticated).toBe(true);
      expect(state.mode).toBe('online');
      expect(state.rooms).toEqual(mockRooms);
    });

    it('should throw error on failure', async () => {
      mockApi.login.mockRejectedValueOnce(new Error('Invalid credentials'));

      const { login } = useAuthStore.getState();
      await expect(login('testuser', 'wrong', 'token')).rejects.toThrow('Invalid credentials');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('register', () => {
    it('should set user and switch to online mode on success', async () => {
      const mockUser = { id: 'user1', username: 'newuser', displayName: null };
      const mockRooms = [{ id: 'room1', name: 'Test Room', isDefault: true, ownerId: 'user1' }];

      mockApi.register.mockResolvedValueOnce({ user: mockUser, accessToken: 'token' });
      mockApi.getRooms.mockResolvedValueOnce(mockRooms);
      mockApi.getInvitations.mockResolvedValueOnce([]);

      const { register } = useAuthStore.getState();
      await register('newuser', 'password123', 'turnstile-token');

      const state = useAuthStore.getState();
      expect(state.user?.username).toBe('newuser');
      expect(state.isAuthenticated).toBe(true);
      expect(state.mode).toBe('online');
    });
  });

  describe('logout', () => {
    it('should clear user and switch to local mode', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        isAuthenticated: true,
        mode: 'online',
        rooms: [{ id: 'room1', name: 'Test', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 }],
      });

      mockApi.logout.mockResolvedValueOnce(undefined);

      const { logout } = useAuthStore.getState();
      await logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.mode).toBe('local');
      expect(state.rooms).toHaveLength(0);
    });

    it('should clear state even if API call fails', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        isAuthenticated: true,
        mode: 'online',
      });

      mockApi.logout.mockRejectedValueOnce(new Error('Network error'));

      const { logout } = useAuthStore.getState();
      await logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('setCurrentRoom', () => {
    it('should update currentRoomId', () => {
      const { setCurrentRoom } = useAuthStore.getState();
      setCurrentRoom('room123');

      expect(useAuthStore.getState().currentRoomId).toBe('room123');
    });

    it('should persist to localStorage', () => {
      const { setCurrentRoom } = useAuthStore.getState();
      setCurrentRoom('room123');

      expect(localStorage.getItem('organizer-current-room')).toBe('room123');
    });

    it('should remove from localStorage when null', () => {
      localStorage.setItem('organizer-current-room', 'room123');

      const { setCurrentRoom } = useAuthStore.getState();
      setCurrentRoom(null as unknown as string);

      expect(localStorage.getItem('organizer-current-room')).toBeNull();
    });
  });

  describe('checkAuth', () => {
    it('should restore session when valid refresh token exists', async () => {
      const mockUser = { id: 'user1', username: 'testuser', displayName: null };
      const mockRooms = [{ id: 'room1', name: 'Test Room', isDefault: true, ownerId: 'user1' }];

      mockApi.refreshToken.mockResolvedValueOnce('new-access-token');
      mockApi.getMe.mockResolvedValueOnce({ user: mockUser });
      mockApi.getRooms.mockResolvedValueOnce(mockRooms);
      mockApi.getInvitations.mockResolvedValueOnce([]);

      const result = await useAuthStore.getState().checkAuth();

      expect(result).toBe(true);
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.username).toBe('testuser');
      expect(state.isInitialized).toBe(true);
    });

    it('should return false when no refresh token', async () => {
      mockApi.refreshToken.mockResolvedValueOnce(null);

      const result = await useAuthStore.getState().checkAuth();

      expect(result).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().isInitialized).toBe(true);
    });

    it('should return false on error', async () => {
      mockApi.refreshToken.mockRejectedValueOnce(new Error('Token expired'));

      const result = await useAuthStore.getState().checkAuth();

      expect(result).toBe(false);
      expect(useAuthStore.getState().isInitialized).toBe(true);
    });

    it('should restore saved room from localStorage', async () => {
      const mockUser = { id: 'user1', username: 'testuser', displayName: null };
      const mockRooms = [
        { id: 'room1', name: 'Default', isDefault: true, ownerId: 'user1' },
        { id: 'room2', name: 'Saved', isDefault: false, ownerId: 'user1' },
      ];

      localStorage.setItem('organizer-current-room', 'room2');

      mockApi.refreshToken.mockResolvedValueOnce('token');
      mockApi.getMe.mockResolvedValueOnce({ user: mockUser });
      mockApi.getRooms.mockResolvedValueOnce(mockRooms);
      mockApi.getInvitations.mockResolvedValueOnce([]);

      await useAuthStore.getState().checkAuth();

      expect(useAuthStore.getState().currentRoomId).toBe('room2');
    });
  });

  describe('loadRooms', () => {
    it('should load and set rooms', async () => {
      const mockRooms = [
        { id: 'room1', name: 'Room 1', isDefault: true, ownerId: 'user1' },
        { id: 'room2', name: 'Room 2', isDefault: false, ownerId: 'user1' },
      ];

      mockApi.getRooms.mockResolvedValueOnce(mockRooms);

      await useAuthStore.getState().loadRooms();

      expect(useAuthStore.getState().rooms).toEqual(mockRooms);
    });
  });

  describe('getCurrentRoom', () => {
    it('should return null when no current room', async () => {
      const result = await useAuthStore.getState().getCurrentRoom();
      expect(result).toBeNull();
    });

    it('should fetch current room data', async () => {
      const mockRoomData = { id: 'room1', name: 'Test', drawers: [], categories: [] };
      useAuthStore.setState({ currentRoomId: 'room1' });
      mockApi.getRoom.mockResolvedValueOnce(mockRoomData);

      const result = await useAuthStore.getState().getCurrentRoom();

      expect(mockApi.getRoom).toHaveBeenCalledWith('room1');
      expect(result).toEqual(mockRoomData);
    });
  });

  describe('createRoom', () => {
    it('should create room and set as current', async () => {
      const newRoom = { id: 'new-room', name: 'New Room' };
      const allRooms = [
        { id: 'room1', name: 'Old', isDefault: true, ownerId: 'user1' },
        { id: 'new-room', name: 'New Room', isDefault: false, ownerId: 'user1' },
      ];

      mockApi.createRoom.mockResolvedValueOnce(newRoom);
      mockApi.getRooms.mockResolvedValueOnce(allRooms);

      await useAuthStore.getState().createRoom('New Room');

      expect(mockApi.createRoom).toHaveBeenCalledWith('New Room');
      expect(useAuthStore.getState().currentRoomId).toBe('new-room');
      expect(useAuthStore.getState().rooms).toEqual(allRooms);
    });
  });

  describe('updateRoom', () => {
    it('should update room and reload rooms', async () => {
      const updatedRooms = [{ id: 'room1', name: 'Updated Name', isDefault: true, ownerId: 'user1' }];

      mockApi.updateRoom.mockResolvedValueOnce({});
      mockApi.getRooms.mockResolvedValueOnce(updatedRooms);

      await useAuthStore.getState().updateRoom('room1', 'Updated Name');

      expect(mockApi.updateRoom).toHaveBeenCalledWith('room1', { name: 'Updated Name' });
      expect(useAuthStore.getState().rooms).toEqual(updatedRooms);
    });
  });

  describe('deleteRoom', () => {
    it('should delete room and update state', async () => {
      useAuthStore.setState({
        currentRoomId: 'room2',
        rooms: [
          { id: 'room1', name: 'Room 1', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 },
          { id: 'room2', name: 'Room 2', isDefault: false, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 },
        ],
      });

      const remainingRooms = [{ id: 'room1', name: 'Room 1', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 }];

      mockApi.deleteRoom.mockResolvedValueOnce({});
      mockApi.getRooms.mockResolvedValueOnce(remainingRooms);

      await useAuthStore.getState().deleteRoom('room2');

      expect(useAuthStore.getState().currentRoomId).toBe('room1');
      expect(useAuthStore.getState().rooms).toEqual(remainingRooms);
    });

    it('should keep current room if different room is deleted', async () => {
      useAuthStore.setState({
        currentRoomId: 'room1',
        rooms: [
          { id: 'room1', name: 'Room 1', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 },
          { id: 'room2', name: 'Room 2', isDefault: false, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 },
        ],
      });

      const remainingRooms = [{ id: 'room1', name: 'Room 1', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 }];

      mockApi.deleteRoom.mockResolvedValueOnce({});
      mockApi.getRooms.mockResolvedValueOnce(remainingRooms);

      await useAuthStore.getState().deleteRoom('room2');

      expect(useAuthStore.getState().currentRoomId).toBe('room1');
    });
  });

  describe('leaveRoom', () => {
    it('should leave room and switch to own default room', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        currentRoomId: 'shared-room',
        rooms: [
          { id: 'my-room', name: 'My Room', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 },
          { id: 'shared-room', name: 'Shared', isDefault: false, ownerId: 'user2', role: 'editor', canInvite: false, drawerCount: 0 },
        ],
      });

      const remainingRooms = [{ id: 'my-room', name: 'My Room', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 }];

      mockApi.removeMember.mockResolvedValueOnce({});
      mockApi.getRooms.mockResolvedValueOnce(remainingRooms);

      await useAuthStore.getState().leaveRoom('shared-room');

      expect(mockApi.removeMember).toHaveBeenCalledWith('shared-room', 'user1');
      expect(useAuthStore.getState().currentRoomId).toBe('my-room');
    });

    it('should do nothing if no user', async () => {
      useAuthStore.setState({ user: null });

      await useAuthStore.getState().leaveRoom('room1');

      expect(mockApi.removeMember).not.toHaveBeenCalled();
    });
  });

  describe('getMembers', () => {
    it('should return room members', async () => {
      const members = [
        { userId: 'user1', username: 'owner', role: 'owner', canInvite: true },
        { userId: 'user2', username: 'editor', role: 'editor', canInvite: false },
      ];

      mockApi.getMembers.mockResolvedValueOnce(members);

      const result = await useAuthStore.getState().getMembers('room1');

      expect(result).toEqual(members);
    });
  });

  describe('removeMember', () => {
    it('should remove member from room', async () => {
      mockApi.removeMember.mockResolvedValueOnce({});

      await useAuthStore.getState().removeMember('room1', 'user2');

      expect(mockApi.removeMember).toHaveBeenCalledWith('room1', 'user2');
    });
  });

  describe('updateMember', () => {
    it('should update member permissions', async () => {
      mockApi.updateMember.mockResolvedValueOnce({});

      await useAuthStore.getState().updateMember('room1', 'user2', { role: 'viewer', canInvite: true });

      expect(mockApi.updateMember).toHaveBeenCalledWith('room1', 'user2', { role: 'viewer', canInvite: true });
    });
  });

  describe('invitation actions', () => {
    it('loadInvitations should fetch and set invitations', async () => {
      const invitations = [
        { id: 'inv1', roomId: 'room1', roomName: 'Room 1', role: 'editor' },
      ];
      mockApi.getInvitations.mockResolvedValueOnce(invitations);

      await useAuthStore.getState().loadInvitations();

      expect(useAuthStore.getState().invitations).toEqual(invitations);
    });

    it('loadInvitations should handle errors gracefully', async () => {
      mockApi.getInvitations.mockRejectedValueOnce(new Error('Network error'));

      await useAuthStore.getState().loadInvitations();

      // Should not throw, invitations remain unchanged
      expect(useAuthStore.getState().invitations).toEqual([]);
    });

    it('inviteUser should call API', async () => {
      mockApi.inviteUser.mockResolvedValueOnce({});

      await useAuthStore.getState().inviteUser('room1', 'newuser', 'editor', true);

      expect(mockApi.inviteUser).toHaveBeenCalledWith('room1', 'newuser', 'editor', true);
    });

    it('acceptInvitation should update rooms and invitations', async () => {
      const newRooms = [{ id: 'room1', name: 'Room 1', isDefault: false, ownerId: 'user2' }];
      const newInvitations: never[] = [];

      mockApi.acceptInvitation.mockResolvedValueOnce({});
      mockApi.getRooms.mockResolvedValueOnce(newRooms);
      mockApi.getInvitations.mockResolvedValueOnce(newInvitations);

      await useAuthStore.getState().acceptInvitation('inv1');

      expect(mockApi.acceptInvitation).toHaveBeenCalledWith('inv1');
      expect(useAuthStore.getState().rooms).toEqual(newRooms);
      expect(useAuthStore.getState().invitations).toEqual([]);
    });

    it('declineInvitation should update invitations', async () => {
      useAuthStore.setState({
        invitations: [{ id: 'inv1', roomId: 'room1', roomName: 'Room 1', role: 'editor', inviterUsername: 'user2', inviterId: 'user2', createdAt: '2024-01-01' }],
      });

      mockApi.declineInvitation.mockResolvedValueOnce({});
      mockApi.getInvitations.mockResolvedValueOnce([]);

      await useAuthStore.getState().declineInvitation('inv1');

      expect(mockApi.declineInvitation).toHaveBeenCalledWith('inv1');
      expect(useAuthStore.getState().invitations).toEqual([]);
    });

    it('getPendingInvitations should return pending invitations', async () => {
      const pending = [{ id: 'inv1', inviteeUsername: 'newuser', role: 'editor' }];
      mockApi.getPendingInvitations.mockResolvedValueOnce(pending);

      const result = await useAuthStore.getState().getPendingInvitations('room1');

      expect(result).toEqual(pending);
    });

    it('cancelInvitation should call API', async () => {
      mockApi.cancelInvitation.mockResolvedValueOnce({});

      await useAuthStore.getState().cancelInvitation('room1', 'inv1');

      expect(mockApi.cancelInvitation).toHaveBeenCalledWith('room1', 'inv1');
    });
  });

  describe('migrateLocalData', () => {
    beforeEach(() => {
      localStorage.removeItem('drawer-organizer-state');
    });

    it('should do nothing when no currentRoomId', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        currentRoomId: null,
        rooms: [],
      });

      await useAuthStore.getState().migrateLocalData();

      expect(mockApi.getRoom).not.toHaveBeenCalled();
    });

    it('should do nothing when no user', async () => {
      useAuthStore.setState({
        user: null,
        currentRoomId: 'room1',
        rooms: [],
      });

      await useAuthStore.getState().migrateLocalData();

      expect(mockApi.getRoom).not.toHaveBeenCalled();
    });

    it('should do nothing when current room is not user default room', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        currentRoomId: 'shared-room',
        rooms: [
          { id: 'shared-room', name: 'Shared', isDefault: false, ownerId: 'user2', role: 'editor', canInvite: false, drawerCount: 0 },
        ],
      });

      await useAuthStore.getState().migrateLocalData();

      expect(mockApi.getRoom).not.toHaveBeenCalled();
    });

    it('should do nothing when no local data exists', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        currentRoomId: 'room1',
        rooms: [{ id: 'room1', name: 'My Room', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 }],
      });

      await useAuthStore.getState().migrateLocalData();

      expect(mockApi.getRoom).not.toHaveBeenCalled();
    });

    it('should clear localStorage when local data has no drawers', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        currentRoomId: 'room1',
        rooms: [{ id: 'room1', name: 'My Room', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 }],
      });

      localStorage.setItem('drawer-organizer-state', JSON.stringify({
        state: { drawers: {} },
      }));

      await useAuthStore.getState().migrateLocalData();

      expect(localStorage.getItem('drawer-organizer-state')).toBeNull();
      expect(mockApi.getRoom).not.toHaveBeenCalled();
    });

    it('should skip migration when room already has drawers', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        currentRoomId: 'room1',
        rooms: [{ id: 'room1', name: 'My Room', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 }],
      });

      localStorage.setItem('drawer-organizer-state', JSON.stringify({
        state: {
          drawers: { drawer1: { id: 'drawer1', name: 'Test' } },
          drawerOrder: ['drawer1'],
        },
      }));

      mockApi.getRoom.mockResolvedValueOnce({
        id: 'room1',
        drawers: [{ id: 'existing-drawer', name: 'Existing' }],
      });

      await useAuthStore.getState().migrateLocalData();

      expect(mockApi.createDrawer).not.toHaveBeenCalled();
      expect(localStorage.getItem('drawer-organizer-state')).toBeNull();
    });

    it('should migrate categories and drawers to empty room', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        currentRoomId: 'room1',
        rooms: [{ id: 'room1', name: 'My Room', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 }],
      });

      const localData = {
        state: {
          categories: {
            'local-cat1': { id: 'local-cat1', name: 'Hardware', colorIndex: 2 },
          },
          drawers: {
            'local-drawer1': {
              id: 'local-drawer1',
              name: 'My Drawer',
              rows: 2,
              cols: 3,
              gridX: 0,
              gridY: 0,
              compartments: {
                'comp1': {
                  id: 'comp1',
                  row: 0,
                  col: 0,
                  dividerOrientation: 'horizontal',
                  subCompartments: [
                    { id: 'sub1', relativeSize: 1, item: { label: 'Screws', categoryId: 'local-cat1', quantity: 10 } },
                  ],
                },
              },
            },
          },
          drawerOrder: ['local-drawer1'],
        },
      };

      localStorage.setItem('drawer-organizer-state', JSON.stringify(localData));

      mockApi.getRoom.mockResolvedValueOnce({ id: 'room1', drawers: [] });
      mockApi.createCategory.mockResolvedValueOnce({ id: 'server-cat1', name: 'Hardware', colorIndex: 2 });
      mockApi.createDrawer.mockResolvedValueOnce({
        id: 'server-drawer1',
        name: 'My Drawer',
        compartments: [
          {
            id: 'server-comp1',
            row: 0,
            col: 0,
            dividerOrientation: 'horizontal',
            subCompartments: [{ id: 'server-sub1', sortOrder: 0 }],
          },
        ],
      });
      mockApi.batchUpdateSubCompartments.mockResolvedValueOnce({});

      await useAuthStore.getState().migrateLocalData();

      expect(mockApi.createCategory).toHaveBeenCalledWith('room1', {
        name: 'Hardware',
        colorIndex: 2,
        color: undefined,
      });
      expect(mockApi.createDrawer).toHaveBeenCalledWith('room1', {
        name: 'My Drawer',
        rows: 2,
        cols: 3,
        gridX: 0,
        gridY: 0,
      });
      expect(mockApi.batchUpdateSubCompartments).toHaveBeenCalledWith('server-drawer1', [
        {
          id: 'server-sub1',
          itemLabel: 'Screws',
          itemCategoryId: 'server-cat1',
          itemQuantity: 10,
        },
      ]);
      expect(localStorage.getItem('drawer-organizer-state')).toBeNull();
    });

    it('should handle migration errors gracefully', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        currentRoomId: 'room1',
        rooms: [{ id: 'room1', name: 'My Room', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 }],
      });

      localStorage.setItem('drawer-organizer-state', JSON.stringify({
        state: {
          drawers: { drawer1: { id: 'drawer1', name: 'Test', rows: 1, cols: 1, gridX: 0, gridY: 0, compartments: {} } },
          drawerOrder: ['drawer1'],
        },
      }));

      mockApi.getRoom.mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await useAuthStore.getState().migrateLocalData();

      // localStorage should still exist since migration failed
      expect(localStorage.getItem('drawer-organizer-state')).not.toBeNull();
    });

    it('should update compartment orientation when not horizontal', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        currentRoomId: 'room1',
        rooms: [{ id: 'room1', name: 'My Room', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 }],
      });

      const localData = {
        state: {
          drawers: {
            'drawer1': {
              id: 'drawer1',
              name: 'Drawer',
              rows: 1,
              cols: 1,
              gridX: 0,
              gridY: 0,
              compartments: {
                'comp1': {
                  id: 'comp1',
                  row: 0,
                  col: 0,
                  dividerOrientation: 'vertical',
                  subCompartments: [{ id: 'sub1', relativeSize: 1, item: null }],
                },
              },
            },
          },
          drawerOrder: ['drawer1'],
        },
      };

      localStorage.setItem('drawer-organizer-state', JSON.stringify(localData));

      mockApi.getRoom.mockResolvedValueOnce({ id: 'room1', drawers: [] });
      mockApi.createDrawer.mockResolvedValueOnce({
        id: 'server-drawer1',
        compartments: [
          { id: 'server-comp1', row: 0, col: 0, subCompartments: [{ id: 'server-sub1', sortOrder: 0 }] },
        ],
      });
      mockApi.updateCompartment.mockResolvedValueOnce({});

      await useAuthStore.getState().migrateLocalData();

      expect(mockApi.updateCompartment).toHaveBeenCalledWith('server-drawer1', 'server-comp1', {
        dividerOrientation: 'vertical',
      });
    });

    it('should set divider count when different from default', async () => {
      useAuthStore.setState({
        user: { id: 'user1', username: 'test', displayName: null },
        currentRoomId: 'room1',
        rooms: [{ id: 'room1', name: 'My Room', isDefault: true, ownerId: 'user1', role: 'owner', canInvite: true, drawerCount: 0 }],
      });

      const localData = {
        state: {
          drawers: {
            'drawer1': {
              id: 'drawer1',
              name: 'Drawer',
              rows: 1,
              cols: 1,
              gridX: 0,
              gridY: 0,
              compartments: {
                'comp1': {
                  id: 'comp1',
                  row: 0,
                  col: 0,
                  dividerOrientation: 'horizontal',
                  subCompartments: [
                    { id: 'sub1', relativeSize: 0.33, item: null },
                    { id: 'sub2', relativeSize: 0.33, item: null },
                    { id: 'sub3', relativeSize: 0.34, item: null },
                  ],
                },
              },
            },
          },
          drawerOrder: ['drawer1'],
        },
      };

      localStorage.setItem('drawer-organizer-state', JSON.stringify(localData));

      mockApi.getRoom.mockResolvedValueOnce({ id: 'room1', drawers: [] });
      mockApi.createDrawer.mockResolvedValueOnce({
        id: 'server-drawer1',
        compartments: [
          {
            id: 'server-comp1',
            row: 0,
            col: 0,
            subCompartments: [
              { id: 'server-sub1', sortOrder: 0 },
              { id: 'server-sub2', sortOrder: 1 },
            ],
          },
        ],
      });
      mockApi.setDividerCount.mockResolvedValueOnce([
        { id: 'new-sub1', sortOrder: 0 },
        { id: 'new-sub2', sortOrder: 1 },
        { id: 'new-sub3', sortOrder: 2 },
      ]);

      await useAuthStore.getState().migrateLocalData();

      expect(mockApi.setDividerCount).toHaveBeenCalledWith('server-drawer1', 'server-comp1', 2);
    });
  });
});
