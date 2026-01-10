import { useEffect, useRef } from 'react';
import { roomWebSocket, type SyncMessage } from '../api/websocket';
import { useAuthStore } from '../store/authStore';
import { useDrawerStore } from '../store/drawerStore';
import { api } from '../api/client';
import type { Drawer, Compartment, SubCompartment, Category } from '../types/drawer';

const RESYNC_THRESHOLD_MS = 5000;

export function useRoomSync(): void {
  const { mode, currentRoomId, isAuthenticated } = useAuthStore();
  const { loadFromApi } = useDrawerStore();
  const hiddenAtRef = useRef<number | null>(null);

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

  useEffect(() => {
    const unsubscribe = roomWebSocket.onMessage(handleRemoteMessage);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (mode !== 'online' || !isAuthenticated || !currentRoomId) return;

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;

        if (hiddenAt && Date.now() - hiddenAt > RESYNC_THRESHOLD_MS) {
          try {
            const room = await api.getRoom(currentRoomId);
            loadFromApi(room);
          } catch (error) {
            console.error('Failed to re-sync room data:', error);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [mode, isAuthenticated, currentRoomId, loadFromApi]);
}

function handleRemoteMessage(message: SyncMessage): void {
  switch (message.type) {
    case 'drawer_created':
      applyRemoteDrawerCreate(message.drawer);
      break;

    case 'drawer_updated':
      applyRemoteDrawerUpdate(message.drawerId, message.changes);
      break;

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

    case 'item_updated':
      applyRemoteItemUpdate(message.drawerId, message.compartmentId, message.subCompartmentId, message.item);
      break;

    case 'items_batch_updated':
      applyRemoteBatchItemUpdate(message.drawerId, message.updates);
      break;

    case 'category_created':
      applyRemoteCategoryCreate(message.category);
      break;

    case 'category_updated':
      applyRemoteCategoryUpdate(message.categoryId, message.changes);
      break;

    case 'category_deleted':
      applyRemoteCategoryDelete(message.categoryId);
      break;

    case 'user_joined':
    case 'user_left':
    case 'cursor_move':
      break;

    case 'member_removed':
      handleMemberRemoved(message.userId, message.roomId);
      break;

    case 'error':
      break;
  }
}

function handleMemberRemoved(userId: string, _roomId: string): void {
  const authState = useAuthStore.getState();
  if (authState.user?.id !== userId) return;

  useDrawerStore.getState().clearRoomData();
  roomWebSocket.disconnect();

  authState.loadRooms().then(() => {
    const { rooms, user } = useAuthStore.getState();
    const defaultRoom = rooms.find(r => r.isDefault && r.ownerId === user?.id) || rooms[0];

    if (defaultRoom) {
      useAuthStore.setState({ currentRoomId: defaultRoom.id });
      localStorage.setItem('organizer-current-room', defaultRoom.id);
      roomWebSocket.connect(defaultRoom.id);
    } else {
      useAuthStore.setState({ currentRoomId: null });
      localStorage.removeItem('organizer-current-room');
    }
  });
}

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
  changes: {
    name?: string;
    rows?: number;
    cols?: number;
    gridX?: number;
    gridY?: number;
    compartmentWidth?: number;
    compartmentHeight?: number;
  }
) {
  useDrawerStore.setState((state) => {
    const drawer = state.drawers[drawerId];
    if (!drawer) return state;

    const newRows = changes.rows ?? drawer.rows;
    const newCols = changes.cols ?? drawer.cols;

    let compartments = drawer.compartments;
    if (newRows !== drawer.rows || newCols !== drawer.cols) {
      compartments = {};
      const occupiedCells = new Set<string>();

      Object.values(drawer.compartments).forEach((comp) => {
        if (comp.row >= newRows || comp.col >= newCols) {
          return;
        }

        const clampedRowSpan = Math.min(comp.rowSpan ?? 1, newRows - comp.row);
        const clampedColSpan = Math.min(comp.colSpan ?? 1, newCols - comp.col);

        compartments[comp.id] = {
          ...comp,
          rowSpan: clampedRowSpan,
          colSpan: clampedColSpan,
        };

        for (let r = comp.row; r < comp.row + clampedRowSpan; r++) {
          for (let c = comp.col; c < comp.col + clampedColSpan; c++) {
            occupiedCells.add(`${r}-${c}`);
          }
        }
      });

      for (let row = 0; row < newRows; row++) {
        for (let col = 0; col < newCols; col++) {
          const key = `${row}-${col}`;
          if (!occupiedCells.has(key)) {
            const newComp: Compartment = {
              id: crypto.randomUUID(),
              row,
              col,
              rowSpan: 1,
              colSpan: 1,
              dividerOrientation: 'horizontal',
              subCompartments: [
                { id: crypto.randomUUID(), relativeSize: 0.5, item: null },
                { id: crypto.randomUUID(), relativeSize: 0.5, item: null },
              ],
            };
            compartments[newComp.id] = newComp;
          }
        }
      }
    }

    return {
      drawers: {
        ...state.drawers,
        [drawerId]: {
          ...drawer,
          name: changes.name ?? drawer.name,
          rows: newRows,
          cols: newCols,
          gridX: changes.gridX ?? drawer.gridX,
          gridY: changes.gridY ?? drawer.gridY,
          compartmentWidth: changes.compartmentWidth ?? drawer.compartmentWidth,
          compartmentHeight: changes.compartmentHeight ?? drawer.compartmentHeight,
          compartments,
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

    let newSelectedCompartmentIds = state.selectedCompartmentIds;
    if (deletedIds.some(id => state.selectedCompartmentIds.has(id))) {
      newSelectedCompartmentIds = new Set<string>();
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

    let newSelectedCompartmentIds = state.selectedCompartmentIds;
    if (state.selectedCompartmentIds.has(deletedId)) {
      newSelectedCompartmentIds = new Set<string>();
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
