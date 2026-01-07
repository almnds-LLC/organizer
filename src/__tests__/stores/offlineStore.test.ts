import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useOfflineStore } from '../../store/offlineStore';

// Mock the api client
vi.mock('../../api/client', () => ({
  api: {
    createDrawer: vi.fn(),
    updateDrawer: vi.fn(),
    deleteDrawer: vi.fn(),
    updateCompartment: vi.fn(),
    updateSubCompartment: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  },
}));

// Mock authStore
vi.mock('../../store/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ currentRoomId: 'room1' })),
  },
}));

import { api } from '../../api/client';

const mockApi = api as unknown as {
  createDrawer: ReturnType<typeof vi.fn>;
  updateDrawer: ReturnType<typeof vi.fn>;
  deleteDrawer: ReturnType<typeof vi.fn>;
  updateCompartment: ReturnType<typeof vi.fn>;
  updateSubCompartment: ReturnType<typeof vi.fn>;
  createCategory: ReturnType<typeof vi.fn>;
  updateCategory: ReturnType<typeof vi.fn>;
  deleteCategory: ReturnType<typeof vi.fn>;
};

describe('offlineStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOfflineStore.setState({
      pendingOperations: [],
      isOnline: true,
      isSyncing: false,
      lastSyncError: null,
    });
  });

  describe('addPendingOperation', () => {
    it('should add a pending operation', () => {
      const { addPendingOperation } = useOfflineStore.getState();

      addPendingOperation({
        type: 'create',
        entity: 'drawer',
        entityId: 'drawer1',
        data: { name: 'Test Drawer' },
      });

      const { pendingOperations } = useOfflineStore.getState();
      expect(pendingOperations).toHaveLength(1);
      expect(pendingOperations[0].type).toBe('create');
      expect(pendingOperations[0].entity).toBe('drawer');
      expect(pendingOperations[0].retries).toBe(0);
    });

    it('should assign unique ids and timestamps', () => {
      const { addPendingOperation } = useOfflineStore.getState();

      addPendingOperation({
        type: 'create',
        entity: 'drawer',
        entityId: 'drawer1',
        data: { name: 'Drawer 1' },
      });

      addPendingOperation({
        type: 'update',
        entity: 'drawer',
        entityId: 'drawer2',
        data: { name: 'Drawer 2' },
      });

      const { pendingOperations } = useOfflineStore.getState();
      expect(pendingOperations[0].id).not.toBe(pendingOperations[1].id);
      expect(pendingOperations[0].timestamp).toBeLessThanOrEqual(pendingOperations[1].timestamp);
    });
  });

  describe('removePendingOperation', () => {
    it('should remove a pending operation by id', () => {
      const { addPendingOperation, removePendingOperation } = useOfflineStore.getState();

      addPendingOperation({
        type: 'create',
        entity: 'drawer',
        entityId: 'drawer1',
        data: { name: 'Test' },
      });

      const opId = useOfflineStore.getState().pendingOperations[0].id;
      removePendingOperation(opId);

      expect(useOfflineStore.getState().pendingOperations).toHaveLength(0);
    });
  });

  describe('setOnline', () => {
    it('should update online status', () => {
      const { setOnline } = useOfflineStore.getState();

      setOnline(false);
      expect(useOfflineStore.getState().isOnline).toBe(false);

      setOnline(true);
      expect(useOfflineStore.getState().isOnline).toBe(true);
    });

    it('should trigger sync when coming back online', async () => {
      const { addPendingOperation, setOnline } = useOfflineStore.getState();

      addPendingOperation({
        type: 'create',
        entity: 'drawer',
        entityId: 'drawer1',
        data: { name: 'Test' },
      });

      mockApi.createDrawer.mockResolvedValueOnce({});

      setOnline(false);
      setOnline(true);

      // Give time for async sync
      await new Promise((r) => setTimeout(r, 10));

      expect(mockApi.createDrawer).toHaveBeenCalled();
    });
  });

  describe('syncPendingOperations', () => {
    it('should sync drawer create operation', async () => {
      const { addPendingOperation, syncPendingOperations } = useOfflineStore.getState();

      addPendingOperation({
        type: 'create',
        entity: 'drawer',
        entityId: 'drawer1',
        data: { name: 'New Drawer', rows: 2, cols: 3 },
      });

      mockApi.createDrawer.mockResolvedValueOnce({});

      await syncPendingOperations();

      expect(mockApi.createDrawer).toHaveBeenCalledWith('room1', {
        name: 'New Drawer',
        rows: 2,
        cols: 3,
      });
      expect(useOfflineStore.getState().pendingOperations).toHaveLength(0);
    });

    it('should sync drawer update operation', async () => {
      const { addPendingOperation, syncPendingOperations } = useOfflineStore.getState();

      addPendingOperation({
        type: 'update',
        entity: 'drawer',
        entityId: 'drawer1',
        data: { name: 'Updated Name' },
      });

      mockApi.updateDrawer.mockResolvedValueOnce({});

      await syncPendingOperations();

      expect(mockApi.updateDrawer).toHaveBeenCalledWith('room1', 'drawer1', expect.objectContaining({
        name: 'Updated Name',
      }));
    });

    it('should sync drawer delete operation', async () => {
      const { addPendingOperation, syncPendingOperations } = useOfflineStore.getState();

      addPendingOperation({
        type: 'delete',
        entity: 'drawer',
        entityId: 'drawer1',
        data: null,
      });

      mockApi.deleteDrawer.mockResolvedValueOnce({});

      await syncPendingOperations();

      expect(mockApi.deleteDrawer).toHaveBeenCalledWith('room1', 'drawer1');
    });

    it('should sync category operations', async () => {
      const { addPendingOperation, syncPendingOperations } = useOfflineStore.getState();

      addPendingOperation({
        type: 'create',
        entity: 'category',
        entityId: 'cat1',
        data: { name: 'Test Category', colorIndex: 2 },
      });

      mockApi.createCategory.mockResolvedValueOnce({});

      await syncPendingOperations();

      expect(mockApi.createCategory).toHaveBeenCalledWith('room1', {
        name: 'Test Category',
        colorIndex: 2,
      });
    });

    it('should handle sync failures and increment retries', async () => {
      const { addPendingOperation, syncPendingOperations } = useOfflineStore.getState();

      addPendingOperation({
        type: 'create',
        entity: 'drawer',
        entityId: 'drawer1',
        data: { name: 'Test' },
      });

      mockApi.createDrawer.mockRejectedValueOnce(new Error('Network error'));

      await syncPendingOperations();

      const { pendingOperations } = useOfflineStore.getState();
      expect(pendingOperations).toHaveLength(1);
      expect(pendingOperations[0].retries).toBe(1);
    });

    it('should remove operation after max retries', async () => {
      useOfflineStore.setState({
        pendingOperations: [
          {
            id: 'op1',
            timestamp: Date.now(),
            type: 'create',
            entity: 'drawer',
            entityId: 'drawer1',
            data: { name: 'Test' },
            retries: 3,
          },
        ],
      });

      mockApi.createDrawer.mockRejectedValueOnce(new Error('Network error'));

      await useOfflineStore.getState().syncPendingOperations();

      const { pendingOperations, lastSyncError } = useOfflineStore.getState();
      expect(pendingOperations).toHaveLength(0);
      expect(lastSyncError).toContain('Failed to sync drawer');
    });

    it('should not sync when already syncing', async () => {
      useOfflineStore.setState({ isSyncing: true });

      const { addPendingOperation, syncPendingOperations } = useOfflineStore.getState();

      addPendingOperation({
        type: 'create',
        entity: 'drawer',
        entityId: 'drawer1',
        data: { name: 'Test' },
      });

      await syncPendingOperations();

      expect(mockApi.createDrawer).not.toHaveBeenCalled();
    });

    it('should not sync when no pending operations', async () => {
      await useOfflineStore.getState().syncPendingOperations();

      expect(mockApi.createDrawer).not.toHaveBeenCalled();
      expect(useOfflineStore.getState().isSyncing).toBe(false);
    });
  });

  describe('clearSyncError', () => {
    it('should clear the sync error', () => {
      useOfflineStore.setState({ lastSyncError: 'Some error' });

      useOfflineStore.getState().clearSyncError();

      expect(useOfflineStore.getState().lastSyncError).toBeNull();
    });
  });
});
