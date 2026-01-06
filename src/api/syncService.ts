import { roomWebSocket } from './websocket';
import { useAuthStore } from '../store/authStore';
import { useOfflineStore } from '../store/offlineStore';
import type { Drawer, SubCompartment, StoredItem, Category } from '../types/drawer';

// Track if we're processing a remote update to avoid re-broadcasting
let isProcessingRemote = false;

export function setProcessingRemote(value: boolean) {
  isProcessingRemote = value;
}

export function isProcessingRemoteUpdate(): boolean {
  return isProcessingRemote;
}

// Check if we should broadcast (online mode + connected + not processing remote)
function shouldBroadcast(): boolean {
  const authState = useAuthStore.getState();
  const offlineState = useOfflineStore.getState();
  return authState.mode === 'online' && offlineState.isOnline && roomWebSocket.isConnected() && !isProcessingRemote;
}

// Check if we should queue for offline sync
function shouldQueueOffline(): boolean {
  const authState = useAuthStore.getState();
  const offlineState = useOfflineStore.getState();
  return authState.mode === 'online' && !offlineState.isOnline;
}

// Helper to get offline store
function getOfflineStore() {
  return useOfflineStore.getState();
}

// Broadcast drawer created
export function broadcastDrawerCreated(drawer: Drawer, sortOrder: number) {
  if (shouldBroadcast()) {
    const syncCompartments = Object.values(drawer.compartments).map((comp) => ({
      id: comp.id,
      row: comp.row,
      col: comp.col,
      dividerOrientation: comp.dividerOrientation,
      subCompartments: comp.subCompartments.map((sc, index) => ({
        id: sc.id,
        relativeSize: sc.relativeSize,
        sortOrder: index,
        item: sc.item ? {
          label: sc.item.label,
          categoryId: sc.item.categoryId,
          quantity: sc.item.quantity,
        } : null,
      })),
    }));

    roomWebSocket.send({
      type: 'drawer_created',
      drawer: {
        id: drawer.id,
        name: drawer.name,
        rows: drawer.rows,
        cols: drawer.cols,
        gridX: drawer.gridX,
        gridY: drawer.gridY,
        sortOrder,
        compartments: syncCompartments,
      },
    });
  } else if (shouldQueueOffline()) {
    getOfflineStore().addPendingOperation({
      type: 'create',
      entity: 'drawer',
      entityId: drawer.id,
      data: {
        name: drawer.name,
        rows: drawer.rows,
        cols: drawer.cols,
        gridX: drawer.gridX,
        gridY: drawer.gridY,
      },
    });
  }
}

// Broadcast drawer updated
export function broadcastDrawerUpdated(drawerId: string, changes: { name?: string; gridX?: number; gridY?: number }) {
  if (shouldBroadcast()) {
    roomWebSocket.send({
      type: 'drawer_updated',
      drawerId,
      changes,
    });
  } else if (shouldQueueOffline()) {
    getOfflineStore().addPendingOperation({
      type: 'update',
      entity: 'drawer',
      entityId: drawerId,
      data: changes,
    });
  }
}

// Broadcast drawer deleted
export function broadcastDrawerDeleted(drawerId: string) {
  if (shouldBroadcast()) {
    roomWebSocket.send({
      type: 'drawer_deleted',
      drawerId,
    });
  } else if (shouldQueueOffline()) {
    getOfflineStore().addPendingOperation({
      type: 'delete',
      entity: 'drawer',
      entityId: drawerId,
      data: null,
    });
  }
}

// Broadcast compartment updated (orientation change)
export function broadcastCompartmentUpdated(
  drawerId: string,
  compartmentId: string,
  changes: { dividerOrientation?: 'horizontal' | 'vertical' }
) {
  if (shouldBroadcast()) {
    roomWebSocket.send({
      type: 'compartment_updated',
      drawerId,
      compartmentId,
      changes,
    });
  } else if (shouldQueueOffline()) {
    getOfflineStore().addPendingOperation({
      type: 'update',
      entity: 'compartment',
      entityId: compartmentId,
      data: { drawerId, ...changes },
    });
  }
}

// Broadcast dividers changed
// Note: Divider count changes are complex and best handled via API when back online
// For offline, we just broadcast when online - users may see stale divider counts until sync
export function broadcastDividersChanged(
  drawerId: string,
  compartmentId: string,
  subCompartments: SubCompartment[]
) {
  if (shouldBroadcast()) {
    roomWebSocket.send({
      type: 'dividers_changed',
      drawerId,
      compartmentId,
      subCompartments: subCompartments.map((sc, index) => ({
        id: sc.id,
        relativeSize: sc.relativeSize,
        sortOrder: index,
        item: sc.item ? {
          label: sc.item.label,
          categoryId: sc.item.categoryId,
          quantity: sc.item.quantity,
        } : null,
      })),
    });
  }
  // Note: Divider changes aren't queued offline as they involve complex server-side logic
  // (creating/deleting sub-compartments with new IDs). These changes will be lost if made offline.
}

// Broadcast item updated
export function broadcastItemUpdated(
  drawerId: string,
  compartmentId: string,
  subCompartmentId: string,
  item: StoredItem | null
) {
  if (shouldBroadcast()) {
    roomWebSocket.send({
      type: 'item_updated',
      drawerId,
      compartmentId,
      subCompartmentId,
      item: item ? {
        label: item.label,
        categoryId: item.categoryId,
        quantity: item.quantity,
      } : null,
    });
  } else if (shouldQueueOffline()) {
    getOfflineStore().addPendingOperation({
      type: 'update',
      entity: 'subCompartment',
      entityId: subCompartmentId,
      data: { drawerId, item },
    });
  }
}

// Broadcast batch item updates
export function broadcastItemsBatchUpdated(
  drawerId: string,
  updates: Array<{ compartmentId: string; subCompartmentId: string; item: StoredItem | null }>
) {
  if (shouldBroadcast()) {
    roomWebSocket.send({
      type: 'items_batch_updated',
      drawerId,
      updates: updates.map((u) => ({
        compartmentId: u.compartmentId,
        subCompartmentId: u.subCompartmentId,
        item: u.item ? {
          label: u.item.label,
          categoryId: u.item.categoryId,
          quantity: u.item.quantity,
        } : null,
      })),
    });
  } else if (shouldQueueOffline()) {
    // Queue each update individually for offline sync
    const offlineStore = getOfflineStore();
    for (const u of updates) {
      offlineStore.addPendingOperation({
        type: 'update',
        entity: 'subCompartment',
        entityId: u.subCompartmentId,
        data: { drawerId, item: u.item },
      });
    }
  }
}

// Broadcast category created
export function broadcastCategoryCreated(category: Category) {
  if (shouldBroadcast()) {
    roomWebSocket.send({
      type: 'category_created',
      category: {
        id: category.id,
        name: category.name,
        colorIndex: category.colorIndex,
        color: category.color,
      },
    });
  } else if (shouldQueueOffline()) {
    getOfflineStore().addPendingOperation({
      type: 'create',
      entity: 'category',
      entityId: category.id,
      data: {
        name: category.name,
        colorIndex: category.colorIndex,
        color: category.color,
      },
    });
  }
}

// Broadcast category updated
export function broadcastCategoryUpdated(categoryId: string, changes: { name?: string; colorIndex?: number; color?: string }) {
  if (shouldBroadcast()) {
    roomWebSocket.send({
      type: 'category_updated',
      categoryId,
      changes,
    });
  } else if (shouldQueueOffline()) {
    getOfflineStore().addPendingOperation({
      type: 'update',
      entity: 'category',
      entityId: categoryId,
      data: changes,
    });
  }
}

// Broadcast category deleted
export function broadcastCategoryDeleted(categoryId: string) {
  if (shouldBroadcast()) {
    roomWebSocket.send({
      type: 'category_deleted',
      categoryId,
    });
  } else if (shouldQueueOffline()) {
    getOfflineStore().addPendingOperation({
      type: 'delete',
      entity: 'category',
      entityId: categoryId,
      data: null,
    });
  }
}
