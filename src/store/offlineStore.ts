import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';
import { roomWebSocket } from '../api/websocket';
import { useAuthStore } from './authStore';

// Wait for WebSocket to be connected (with timeout)
function waitForWebSocket(timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    if (roomWebSocket.isConnected()) {
      resolve(true);
      return;
    }

    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (roomWebSocket.isConnected()) {
        clearInterval(checkInterval);
        resolve(true);
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        resolve(false);
      }
    }, 100);
  });
}

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
        set((state) => {
          // Check if there's already a pending operation for the same entity
          const existingIndex = state.pendingOperations.findIndex(
            (existing) => existing.entity === op.entity && existing.entityId === op.entityId
          );

          if (existingIndex !== -1) {
            const updated = [...state.pendingOperations];
            updated[existingIndex] = {
              ...updated[existingIndex],
              data: op.data,
              timestamp: Date.now(),
            };
            return { pendingOperations: updated };
          }

          const operation: PendingOperation = {
            ...op,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            retries: 0,
          };
          return { pendingOperations: [...state.pendingOperations, operation] };
        });
      },

      removePendingOperation: (id) => {
        set((state) => ({
          pendingOperations: state.pendingOperations.filter((op) => op.id !== id),
        }));
      },

      setOnline: async (online) => {
        const wasOffline = !get().isOnline;
        set({ isOnline: online });

        // Auto-sync when coming back online
        if (online && wasOffline) {
          // Trigger WebSocket reconnection and wait for it
          roomWebSocket.tryReconnect();
          await waitForWebSocket(5000);
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
  // Note: Server now handles broadcasting on all API calls, so we just call the API
  // Include the original timestamp for conflict resolution
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
        const data = op.data as { name?: string; gridX?: number; gridY?: number; updatedAt?: number };
        await api.updateDrawer(roomId, op.entityId, {
          ...data,
          updatedAt: data.updatedAt ?? op.timestamp, // Use stored timestamp for conflict resolution
        });
      } else if (op.type === 'delete') {
        await api.deleteDrawer(roomId, op.entityId);
      }
      break;

    case 'compartment':
      if (op.type === 'update') {
        const data = op.data as { drawerId: string; dividerOrientation?: 'horizontal' | 'vertical'; updatedAt?: number };
        await api.updateCompartment(data.drawerId, op.entityId, {
          dividerOrientation: data.dividerOrientation,
          updatedAt: data.updatedAt ?? op.timestamp,
        });
      }
      break;

    case 'subCompartment':
      if (op.type === 'update') {
        const data = op.data as {
          drawerId: string;
          compartmentId: string;
          item: { label: string; categoryId?: string; quantity?: number } | null;
          updatedAt?: number;
        };
        await api.updateSubCompartment(data.drawerId, op.entityId, {
          itemLabel: data.item?.label ?? null,
          itemCategoryId: data.item?.categoryId ?? null,
          itemQuantity: data.item?.quantity ?? null,
          updatedAt: data.updatedAt ?? op.timestamp,
        });
      }
      break;

    case 'category':
      if (op.type === 'create') {
        const data = op.data as { name: string; colorIndex?: number; color?: string };
        await api.createCategory(roomId, data);
      } else if (op.type === 'update') {
        const data = op.data as { name?: string; colorIndex?: number; color?: string; updatedAt?: number };
        await api.updateCategory(roomId, op.entityId, {
          ...data,
          updatedAt: data.updatedAt ?? op.timestamp,
        });
      } else if (op.type === 'delete') {
        await api.deleteCategory(roomId, op.entityId);
      }
      break;
  }
}
