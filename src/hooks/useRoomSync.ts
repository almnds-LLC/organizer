import { useEffect, useState, useCallback, useRef } from 'react';
import { roomWebSocket, type SyncMessage } from '../api/websocket';
import { useAuthStore } from '../store/authStore';
import { useDrawerStore } from '../store/drawerStore';
import { useOfflineStore } from '../store/offlineStore';
import { useConflictStore } from '../store/conflictStore';
import { api } from '../api/client';
import type { Drawer, Compartment, SubCompartment, Category, StoredItem } from '../types/drawer';

interface ConnectedUser {
  userId: string;
  username: string;
}

// Minimum time window must be hidden before triggering a re-sync (5 seconds)
const RESYNC_THRESHOLD_MS = 5000;

export function useRoomSync() {
  const { mode, currentRoomId, isAuthenticated } = useAuthStore();
  const { loadFromApi } = useDrawerStore();
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const isRemoteUpdateRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);

  // Connect/disconnect based on auth state
  useEffect(() => {
    if (mode === 'online' && isAuthenticated && currentRoomId) {
      roomWebSocket.connect(currentRoomId);
    } else {
      roomWebSocket.disconnect();
    }

    return () => {
      roomWebSocket.disconnect();
    };
  }, [mode, isAuthenticated, currentRoomId]);

  // Handle connection state changes
  useEffect(() => {
    const unsubscribe = roomWebSocket.onConnectionChange(setIsConnected);
    return unsubscribe;
  }, []);

  // Handle connected users changes
  useEffect(() => {
    const unsubscribe = roomWebSocket.onUsersChange(setConnectedUsers);
    return unsubscribe;
  }, []);

  // Handle incoming sync messages
  useEffect(() => {
    const unsubscribe = roomWebSocket.onMessage((message) => {
      // Mark that we're processing a remote update
      isRemoteUpdateRef.current = true;

      try {
        handleRemoteMessage(message);
      } finally {
        isRemoteUpdateRef.current = false;
      }
    });

    return unsubscribe;
  }, []);

  // Re-sync when window regains focus after being hidden
  useEffect(() => {
    if (mode !== 'online' || !isAuthenticated || !currentRoomId) return;

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // Window is now hidden, record the time
        hiddenAtRef.current = Date.now();
      } else {
        // Window is now visible
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;

        // If we were hidden for more than the threshold, re-sync
        if (hiddenAt && Date.now() - hiddenAt > RESYNC_THRESHOLD_MS) {
          console.log('Window refocused after being hidden, re-syncing room data...');
          try {
            const room = await api.getRoom(currentRoomId);
            // Mark as remote update to avoid re-broadcasting
            isRemoteUpdateRef.current = true;
            loadFromApi(room);
            isRemoteUpdateRef.current = false;
          } catch (error) {
            console.error('Failed to re-sync room data:', error);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [mode, isAuthenticated, currentRoomId, loadFromApi]);

  // Check if currently processing a remote update (to avoid re-broadcasting)
  const isRemoteUpdate = useCallback(() => isRemoteUpdateRef.current, []);

  return {
    isConnected,
    connectedUsers,
    send: roomWebSocket.send.bind(roomWebSocket),
    isRemoteUpdate,
  };
}

// Check if there's a pending operation that conflicts with the remote update
function checkForConflict(
  entity: 'drawer' | 'compartment' | 'subCompartment' | 'category',
  entityId: string,
  remoteVersion: Record<string, unknown>
): boolean {
  const { pendingOperations, removePendingOperation } = useOfflineStore.getState();
  const { addConflict } = useConflictStore.getState();
  const { drawers, categories } = useDrawerStore.getState();

  // Find pending operation for this entity
  const pendingOp = pendingOperations.find(
    op => op.entity === entity && op.entityId === entityId && op.type === 'update'
  );

  if (!pendingOp || !pendingOp.data) return false;

  // Get local version based on entity type
  let localVersion: Record<string, unknown> = {};
  let entityName: string | undefined;

  switch (entity) {
    case 'drawer': {
      const drawer = drawers[entityId];
      if (drawer) {
        localVersion = pendingOp.data;
        entityName = drawer.name;
      }
      break;
    }
    case 'category': {
      const category = categories[entityId];
      if (category) {
        localVersion = pendingOp.data;
        entityName = category.name;
      }
      break;
    }
    case 'subCompartment': {
      localVersion = pendingOp.data;
      const item = (pendingOp.data as { item?: StoredItem | null }).item;
      entityName = item?.label;
      break;
    }
    default:
      localVersion = pendingOp.data;
  }

  // Check if local and remote versions differ
  const localKeys = Object.keys(localVersion);
  const hasConflict = localKeys.some(key => {
    if (key === 'drawerId') return false; // Skip metadata
    const localVal = JSON.stringify(localVersion[key]);
    const remoteVal = JSON.stringify(remoteVersion[key]);
    return localVal !== remoteVal;
  });

  if (hasConflict) {
    // Remove the pending operation since we'll handle it via conflict resolution
    removePendingOperation(pendingOp.id);

    // Add conflict for user to resolve
    addConflict({
      entity,
      entityId,
      entityName,
      localVersion,
      remoteVersion,
    });

    return true;
  }

  // No conflict - remove pending operation as remote version matches
  removePendingOperation(pendingOp.id);
  return false;
}

// Handle incoming remote messages
function handleRemoteMessage(message: SyncMessage) {
  switch (message.type) {
    case 'drawer_created':
      applyRemoteDrawerCreate(message.drawer);
      break;

    case 'drawer_updated': {
      // Check for conflict before applying
      const hasConflict = checkForConflict('drawer', message.drawerId, message.changes);
      if (!hasConflict) {
        applyRemoteDrawerUpdate(message.drawerId, message.changes);
      }
      break;
    }

    case 'drawer_deleted':
      applyRemoteDrawerDelete(message.drawerId);
      break;

    case 'compartment_updated':
      applyRemoteCompartmentUpdate(message.drawerId, message.compartmentId, message.changes);
      break;

    case 'dividers_changed':
      applyRemoteDividersChange(message.drawerId, message.compartmentId, message.subCompartments);
      break;

    case 'compartments_merged':
      applyRemoteCompartmentsMerged(message.drawerId, message.deletedIds, message.newCompartment);
      break;

    case 'compartment_split':
      applyRemoteCompartmentSplit(message.drawerId, message.deletedId, message.newCompartments);
      break;

    case 'item_updated': {
      // Check for conflict before applying
      const remoteVersion = {
        drawerId: message.drawerId,
        item: message.item,
      };
      const hasConflict = checkForConflict('subCompartment', message.subCompartmentId, remoteVersion);
      if (!hasConflict) {
        applyRemoteItemUpdate(message.drawerId, message.compartmentId, message.subCompartmentId, message.item);
      }
      break;
    }

    case 'items_batch_updated':
      applyRemoteBatchItemUpdate(message.drawerId, message.updates);
      break;

    case 'category_created':
      applyRemoteCategoryCreate(message.category);
      break;

    case 'category_updated': {
      // Check for conflict before applying
      const hasConflict = checkForConflict('category', message.categoryId, message.changes);
      if (!hasConflict) {
        applyRemoteCategoryUpdate(message.categoryId, message.changes);
      }
      break;
    }

    case 'category_deleted':
      applyRemoteCategoryDelete(message.categoryId);
      break;

    case 'user_joined':
    case 'user_left':
    case 'cursor_move':
      // Handled by WebSocket client internally or ignored
      break;

    case 'member_removed':
      handleMemberRemoved(message.userId, message.roomId);
      break;

    case 'error':
      console.error('Sync error:', message.message);
      break;
  }
}

// Handle being removed from a room
function handleMemberRemoved(userId: string, roomId: string) {
  const authState = useAuthStore.getState();

  // Only handle if this is about the current user
  if (authState.user?.id !== userId) return;

  // Clear the current room data
  useDrawerStore.getState().clearRoomData();

  // Disconnect from this room (will be done by server closing connection, but be explicit)
  roomWebSocket.disconnect();

  // Reload rooms to get updated list (this room should be gone)
  authState.loadRooms().then(() => {
    const { rooms, user } = useAuthStore.getState();

    // Find user's own default room to switch to
    const defaultRoom = rooms.find(r => r.isDefault && r.ownerId === user?.id) || rooms[0];

    if (defaultRoom) {
      useAuthStore.setState({ currentRoomId: defaultRoom.id });
      localStorage.setItem('organizer-current-room', defaultRoom.id);

      // Reconnect to the new room
      roomWebSocket.connect(defaultRoom.id);
    } else {
      // No rooms available, clear current room
      useAuthStore.setState({ currentRoomId: null });
      localStorage.removeItem('organizer-current-room');
    }
  });
}

// Remote update handlers
function applyRemoteDrawerCreate(
  syncDrawer: SyncMessage & { type: 'drawer_created' } extends { drawer: infer D } ? D : never
) {
  const compartments: Record<string, Compartment> = {};

  for (const syncComp of syncDrawer.compartments) {
    const subCompartments: SubCompartment[] = syncComp.subCompartments
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((sc) => ({
        id: sc.id,
        relativeSize: sc.relativeSize,
        item: sc.item ? {
          label: sc.item.label,
          categoryId: sc.item.categoryId,
          quantity: sc.item.quantity,
        } : null,
      }));

    compartments[syncComp.id] = {
      id: syncComp.id,
      row: syncComp.row,
      col: syncComp.col,
      rowSpan: syncComp.rowSpan ?? 1,
      colSpan: syncComp.colSpan ?? 1,
      dividerOrientation: syncComp.dividerOrientation,
      subCompartments,
    };
  }

  const newDrawer: Drawer = {
    id: syncDrawer.id,
    name: syncDrawer.name,
    rows: syncDrawer.rows,
    cols: syncDrawer.cols,
    gridX: syncDrawer.gridX,
    gridY: syncDrawer.gridY,
    compartments,
  };

  useDrawerStore.setState((state) => ({
    drawers: { ...state.drawers, [newDrawer.id]: newDrawer },
    drawerOrder: [...state.drawerOrder, newDrawer.id],
  }));
}

function applyRemoteDrawerUpdate(
  drawerId: string,
  changes: { name?: string; gridX?: number; gridY?: number }
) {
  useDrawerStore.setState((state) => {
    const drawer = state.drawers[drawerId];
    if (!drawer) return state;

    return {
      drawers: {
        ...state.drawers,
        [drawerId]: {
          ...drawer,
          name: changes.name ?? drawer.name,
          gridX: changes.gridX ?? drawer.gridX,
          gridY: changes.gridY ?? drawer.gridY,
        },
      },
    };
  });
}

function applyRemoteDrawerDelete(
  drawerId: string
) {
  useDrawerStore.setState((state) => {
    const { [drawerId]: _removed, ...remaining } = state.drawers;
    const newOrder = state.drawerOrder.filter((id) => id !== drawerId);

    return {
      drawers: remaining,
      drawerOrder: newOrder,
      activeDrawerId: state.activeDrawerId === drawerId ? newOrder[0] || null : state.activeDrawerId,
    };
  });
}

function applyRemoteCompartmentUpdate(
  drawerId: string,
  compartmentId: string,
  changes: { dividerOrientation?: 'horizontal' | 'vertical' }
) {
  useDrawerStore.setState((state) => {
    const drawer = state.drawers[drawerId];
    if (!drawer) return state;

    const compartment = drawer.compartments[compartmentId];
    if (!compartment) return state;

    return {
      drawers: {
        ...state.drawers,
        [drawerId]: {
          ...drawer,
          compartments: {
            ...drawer.compartments,
            [compartmentId]: {
              ...compartment,
              dividerOrientation: changes.dividerOrientation ?? compartment.dividerOrientation,
            },
          },
        },
      },
    };
  });
}

function applyRemoteDividersChange(
  drawerId: string,
  compartmentId: string,
  syncSubCompartments: Array<{ id: string; relativeSize: number; sortOrder: number; item: { label: string; categoryId?: string; quantity?: number } | null }>
) {
  useDrawerStore.setState((state) => {
    const drawer = state.drawers[drawerId];
    if (!drawer) return state;

    const compartment = drawer.compartments[compartmentId];
    if (!compartment) return state;

    const subCompartments: SubCompartment[] = syncSubCompartments
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((sc) => ({
        id: sc.id,
        relativeSize: sc.relativeSize,
        item: sc.item ? {
          label: sc.item.label,
          categoryId: sc.item.categoryId,
          quantity: sc.item.quantity,
        } : null,
      }));

    return {
      drawers: {
        ...state.drawers,
        [drawerId]: {
          ...drawer,
          compartments: {
            ...drawer.compartments,
            [compartmentId]: {
              ...compartment,
              subCompartments,
            },
          },
        },
      },
    };
  });
}

function applyRemoteCompartmentsMerged(
  drawerId: string,
  deletedIds: string[],
  newCompartment: {
    id: string;
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
    dividerOrientation: 'horizontal' | 'vertical';
    subCompartments: Array<{ id: string; relativeSize: number; sortOrder: number; item: { label: string; categoryId?: string; quantity?: number } | null }>;
  }
) {
  useDrawerStore.setState((state) => {
    const drawer = state.drawers[drawerId];
    if (!drawer) return state;

    // Remove deleted compartments and add the new merged one
    const updatedCompartments = { ...drawer.compartments };
    for (const id of deletedIds) {
      delete updatedCompartments[id];
    }

    const subCompartments: SubCompartment[] = newCompartment.subCompartments
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((sc) => ({
        id: sc.id,
        relativeSize: sc.relativeSize,
        item: sc.item ? {
          label: sc.item.label,
          categoryId: sc.item.categoryId,
          quantity: sc.item.quantity,
        } : null,
      }));

    updatedCompartments[newCompartment.id] = {
      id: newCompartment.id,
      row: newCompartment.row,
      col: newCompartment.col,
      rowSpan: newCompartment.rowSpan,
      colSpan: newCompartment.colSpan,
      dividerOrientation: newCompartment.dividerOrientation,
      subCompartments,
    };

    // Clear selection if any selected compartment was deleted
    let newSelectedCompartmentIds = state.selectedCompartmentIds;
    if (deletedIds.some(id => state.selectedCompartmentIds.includes(id))) {
      newSelectedCompartmentIds = [];
    }

    return {
      drawers: {
        ...state.drawers,
        [drawerId]: {
          ...drawer,
          compartments: updatedCompartments,
        },
      },
      selectedCompartmentIds: newSelectedCompartmentIds,
    };
  });
}

function applyRemoteCompartmentSplit(
  drawerId: string,
  deletedId: string,
  newCompartments: Array<{
    id: string;
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
    dividerOrientation: 'horizontal' | 'vertical';
    subCompartments: Array<{ id: string; relativeSize: number; sortOrder: number; item: { label: string; categoryId?: string; quantity?: number } | null }>;
  }>
) {
  useDrawerStore.setState((state) => {
    const drawer = state.drawers[drawerId];
    if (!drawer) return state;

    // Remove the split compartment and add the new ones
    const updatedCompartments = { ...drawer.compartments };
    delete updatedCompartments[deletedId];

    for (const comp of newCompartments) {
      const subCompartments: SubCompartment[] = comp.subCompartments
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((sc) => ({
          id: sc.id,
          relativeSize: sc.relativeSize,
          item: sc.item ? {
            label: sc.item.label,
            categoryId: sc.item.categoryId,
            quantity: sc.item.quantity,
          } : null,
        }));

      updatedCompartments[comp.id] = {
        id: comp.id,
        row: comp.row,
        col: comp.col,
        rowSpan: comp.rowSpan,
        colSpan: comp.colSpan,
        dividerOrientation: comp.dividerOrientation,
        subCompartments,
      };
    }

    // Clear selection if the split compartment was selected
    let newSelectedCompartmentIds = state.selectedCompartmentIds;
    if (state.selectedCompartmentIds.includes(deletedId)) {
      newSelectedCompartmentIds = [];
    }

    return {
      drawers: {
        ...state.drawers,
        [drawerId]: {
          ...drawer,
          compartments: updatedCompartments,
        },
      },
      selectedCompartmentIds: newSelectedCompartmentIds,
    };
  });
}

function applyRemoteItemUpdate(
  drawerId: string,
  compartmentId: string,
  subCompartmentId: string,
  syncItem: { label: string; categoryId?: string; quantity?: number } | null
) {
  useDrawerStore.setState((state) => {
    const drawer = state.drawers[drawerId];
    if (!drawer) return state;

    const compartment = drawer.compartments[compartmentId];
    if (!compartment) return state;

    const subCompartments = compartment.subCompartments.map((sc) => {
      if (sc.id !== subCompartmentId) return sc;
      return {
        ...sc,
        item: syncItem ? {
          label: syncItem.label,
          categoryId: syncItem.categoryId,
          quantity: syncItem.quantity,
        } : null,
      };
    });

    return {
      drawers: {
        ...state.drawers,
        [drawerId]: {
          ...drawer,
          compartments: {
            ...drawer.compartments,
            [compartmentId]: {
              ...compartment,
              subCompartments,
            },
          },
        },
      },
    };
  });
}

function applyRemoteBatchItemUpdate(
  drawerId: string,
  updates: Array<{ compartmentId: string; subCompartmentId: string; item: { label: string; categoryId?: string; quantity?: number } | null }>
) {
  useDrawerStore.setState((state) => {
    const drawer = state.drawers[drawerId];
    if (!drawer) return state;

    const updatedCompartments = { ...drawer.compartments };

    for (const update of updates) {
      const compartment = updatedCompartments[update.compartmentId];
      if (!compartment) continue;

      const subCompartments = compartment.subCompartments.map((sc) => {
        if (sc.id !== update.subCompartmentId) return sc;
        return {
          ...sc,
          item: update.item ? {
            label: update.item.label,
            categoryId: update.item.categoryId,
            quantity: update.item.quantity,
          } : null,
        };
      });

      updatedCompartments[update.compartmentId] = {
        ...compartment,
        subCompartments,
      };
    }

    return {
      drawers: {
        ...state.drawers,
        [drawerId]: {
          ...drawer,
          compartments: updatedCompartments,
        },
      },
    };
  });
}

function applyRemoteCategoryCreate(
  syncCategory: { id: string; name: string; colorIndex?: number; color?: string }
) {
  const category: Category = {
    id: syncCategory.id,
    name: syncCategory.name,
    colorIndex: syncCategory.colorIndex,
    color: syncCategory.color,
  };

  useDrawerStore.setState((state) => ({
    categories: {
      ...state.categories,
      [category.id]: category,
    },
  }));
}

function applyRemoteCategoryUpdate(
  categoryId: string,
  changes: { name?: string; colorIndex?: number; color?: string }
) {
  useDrawerStore.setState((state) => {
    const category = state.categories[categoryId];
    if (!category) return state;

    return {
      categories: {
        ...state.categories,
        [categoryId]: {
          ...category,
          name: changes.name ?? category.name,
          colorIndex: changes.colorIndex ?? category.colorIndex,
          color: changes.color ?? category.color,
        },
      },
    };
  });
}

function applyRemoteCategoryDelete(
  categoryId: string
) {
  useDrawerStore.setState((state) => {
    const { [categoryId]: _removed, ...remaining } = state.categories;
    return { categories: remaining };
  });
}
