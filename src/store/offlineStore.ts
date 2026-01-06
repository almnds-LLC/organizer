import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';
import { useAuthStore } from './authStore';
import type { StoredItem } from '../types/drawer';

export interface PendingOperation {
  id: string;
  timestamp: number;
  type: 'create' | 'update' | 'delete';
  entity: 'drawer' | 'compartment' | 'subCompartment' | 'category';
  entityId: string;
  data: Record<string, unknown> | null;
  retries: number;
}

interface OfflineState {
  pendingOperations: PendingOperation[];
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncError: string | null;

  addPendingOperation: (op: Omit<PendingOperation, 'id' | 'timestamp' | 'retries'>) => void;
  removePendingOperation: (id: string) => void;
  setOnline: (online: boolean) => void;
  syncPendingOperations: () => Promise<void>;
  clearSyncError: () => void;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      pendingOperations: [],
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isSyncing: false,
      lastSyncError: null,

      addPendingOperation: (op) => {
        const operation: PendingOperation = {
          ...op,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          retries: 0,
        };
        set((state) => ({
          pendingOperations: [...state.pendingOperations, operation],
        }));
      },

      removePendingOperation: (id) => {
        set((state) => ({
          pendingOperations: state.pendingOperations.filter((op) => op.id !== id),
        }));
      },

      setOnline: (online) => {
        const wasOffline = !get().isOnline;
        set({ isOnline: online });

        // Auto-sync when coming back online
        if (online && wasOffline) {
          get().syncPendingOperations();
        }
      },

      syncPendingOperations: async () => {
        const { pendingOperations, removePendingOperation, isSyncing } = get();

        if (isSyncing || pendingOperations.length === 0) return;

        set({ isSyncing: true, lastSyncError: null });

        const authState = useAuthStore.getState();
        const roomId = authState.currentRoomId;

        if (!roomId) {
          set({ isSyncing: false });
          return;
        }

        // Sort by timestamp (oldest first)
        const sortedOps = [...pendingOperations].sort((a, b) => a.timestamp - b.timestamp);

        for (const op of sortedOps) {
          try {
            await syncOperation(op, roomId);
            removePendingOperation(op.id);
          } catch (error) {
            console.error('Failed to sync operation:', op, error);

            // Increment retry count
            if (op.retries >= 3) {
              // Remove after too many retries
              removePendingOperation(op.id);
              set({
                lastSyncError: `Failed to sync ${op.entity} after multiple attempts`,
              });
            } else {
              // Update retry count
              set((state) => ({
                pendingOperations: state.pendingOperations.map((p) =>
                  p.id === op.id ? { ...p, retries: p.retries + 1 } : p
                ),
              }));
            }
          }
        }

        set({ isSyncing: false });
      },

      clearSyncError: () => set({ lastSyncError: null }),
    }),
    {
      name: 'offline-operations',
      partialize: (state) => ({
        pendingOperations: state.pendingOperations,
      }),
    }
  )
);

async function syncOperation(op: PendingOperation, roomId: string): Promise<void> {
  switch (op.entity) {
    case 'drawer':
      if (op.type === 'create') {
        await api.createDrawer(roomId, op.data as {
          name: string;
          rows?: number;
          cols?: number;
          gridX?: number;
          gridY?: number;
        });
      } else if (op.type === 'update') {
        await api.updateDrawer(roomId, op.entityId, op.data as {
          name?: string;
          gridX?: number;
          gridY?: number;
        });
      } else if (op.type === 'delete') {
        await api.deleteDrawer(roomId, op.entityId);
      }
      break;

    case 'compartment':
      if (op.type === 'update') {
        const data = op.data as { drawerId: string; dividerOrientation?: 'horizontal' | 'vertical' };
        await api.updateCompartment(data.drawerId, op.entityId, {
          dividerOrientation: data.dividerOrientation,
        });
      }
      break;

    case 'subCompartment':
      if (op.type === 'update') {
        const data = op.data as {
          drawerId: string;
          item: StoredItem | null;
        };
        await api.updateSubCompartment(data.drawerId, op.entityId, {
          itemLabel: data.item?.label ?? null,
          itemCategoryId: data.item?.categoryId ?? null,
          itemQuantity: data.item?.quantity ?? null,
        });
      }
      break;

    case 'category':
      if (op.type === 'create') {
        await api.createCategory(roomId, op.data as {
          name: string;
          colorIndex?: number;
          color?: string;
        });
      } else if (op.type === 'update') {
        await api.updateCategory(roomId, op.entityId, op.data as {
          name?: string;
          colorIndex?: number;
          color?: string;
        });
      } else if (op.type === 'delete') {
        await api.deleteCategory(roomId, op.entityId);
      }
      break;
  }
}
