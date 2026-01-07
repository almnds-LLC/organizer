import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Drawer,
  Compartment,
  SubCompartment,
  StoredItem,
  EditMode,
  CreateDrawerOptions,
  Category,
} from '../types/drawer';
import { api } from '../api/client';
import type { RoomWithDrawers } from '../api/client';
import { useAuthStore } from './authStore';
import { useOfflineStore } from './offlineStore';
import {
  broadcastDrawerCreated,
  broadcastDrawerUpdated,
  broadcastDrawerDeleted,
  broadcastCompartmentUpdated,
  broadcastDividersChanged,
  broadcastCompartmentsMerged,
  broadcastCompartmentSplit,
  broadcastItemUpdated,
  broadcastItemsBatchUpdated,
  broadcastCategoryCreated,
  broadcastCategoryUpdated,
  broadcastCategoryDeleted,
} from '../api/syncService';
import {
  DEFAULT_DRAWER_ROWS,
  DEFAULT_DRAWER_COLS,
  DEFAULT_DIVIDER_COUNT,
  DEFAULT_DIVIDER_ORIENTATION,
  STORAGE_KEY,
  COLOR_PRESETS,
} from '../constants/defaults';
import {
  canMergeCompartments,
  getOccupiedCells,
  getBoundingBox,
} from '../utils/compartmentHelpers';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getCategoryColor(category: Category): string {
  if (category.colorIndex !== undefined && COLOR_PRESETS[category.colorIndex]) {
    return COLOR_PRESETS[category.colorIndex];
  }
  return category.color || COLOR_PRESETS[0];
}

const DEFAULT_CAT_IDS = {
  hardware: '55e274fd-0f46-4d70-9df7-e9f6b94a0a08',
  electronics: '5d8972fe-b1e5-4bb2-b49c-68db858a8580',
  tools: '3d3f386b-b373-4f70-9d92-56a69d0424be',
  supplies: 'e082c665-04ab-4106-8ee4-db47152feade',
};

const defaultCategories: Record<string, Category> = {
  [DEFAULT_CAT_IDS.hardware]: { id: DEFAULT_CAT_IDS.hardware, name: 'Hardware', colorIndex: 4 },
  [DEFAULT_CAT_IDS.electronics]: { id: DEFAULT_CAT_IDS.electronics, name: 'Electronics', colorIndex: 3 },
  [DEFAULT_CAT_IDS.tools]: { id: DEFAULT_CAT_IDS.tools, name: 'Tools', colorIndex: 1 },
  [DEFAULT_CAT_IDS.supplies]: { id: DEFAULT_CAT_IDS.supplies, name: 'Supplies', colorIndex: 5 },
};

function createCompartment(
  row: number,
  col: number,
  dividerCount: number = DEFAULT_DIVIDER_COUNT
): Compartment {
  const subCompartmentCount = dividerCount + 1;
  const subCompartments: SubCompartment[] = Array.from(
    { length: subCompartmentCount },
    () => ({
      id: generateId(),
      relativeSize: 1 / subCompartmentCount,
      item: null,
    })
  );

  return {
    id: generateId(),
    row,
    col,
    rowSpan: 1,
    colSpan: 1,
    dividerOrientation: DEFAULT_DIVIDER_ORIENTATION,
    subCompartments,
  };
}

function createDrawer(options: CreateDrawerOptions & { gridX?: number; gridY?: number }): Drawer {
  const rows = options.rows ?? DEFAULT_DRAWER_ROWS;
  const cols = options.cols ?? DEFAULT_DRAWER_COLS;
  const dividerCount = options.defaultDividerCount ?? DEFAULT_DIVIDER_COUNT;

  const compartments: Record<string, Compartment> = {};

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const compartment = createCompartment(row, col, dividerCount);
      compartments[compartment.id] = compartment;
    }
  }

  return {
    id: generateId(),
    name: options.name,
    rows,
    cols,
    compartments,
    gridX: options.gridX ?? 0,
    gridY: options.gridY ?? 0,
  };
}

function getDrawerFootprint(cols: number, rows: number) {
  return {
    width: cols * 3 + 1,
    height: rows + 2,
  };
}

function wouldOverlap(
  drawers: Record<string, Drawer>,
  excludeId: string | null,
  gridX: number,
  gridY: number,
  cols: number,
  rows: number
): boolean {
  const newFp = getDrawerFootprint(cols, rows);

  for (const drawer of Object.values(drawers)) {
    if (drawer.id === excludeId) continue;

    const existFp = getDrawerFootprint(drawer.cols, drawer.rows);

    const noOverlap =
      gridX + newFp.width <= drawer.gridX ||
      drawer.gridX + existFp.width <= gridX ||
      gridY + newFp.height <= drawer.gridY ||
      drawer.gridY + existFp.height <= gridY;

    if (!noOverlap) return true;
  }
  return false;
}

function findNextAvailablePosition(
  drawers: Record<string, Drawer>,
  cols: number,
  rows: number
): { gridX: number; gridY: number } {
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      if (!wouldOverlap(drawers, null, x, y, cols, rows)) {
        return { gridX: x, gridY: y };
      }
    }
  }
  return { gridX: 0, gridY: 0 };
}

function createInitialState() {
  return {
    drawers: {} as Record<string, Drawer>,
    drawerOrder: [] as string[],
    activeDrawerId: null as string | null,
    categories: defaultCategories,
  };
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query || !text) return false;

  const normalizedQuery = query.toLowerCase().replace(/\s+/g, '');
  const normalizedText = text.toLowerCase().replace(/\s+/g, '');

  if (normalizedText.includes(normalizedQuery)) return true;

  const queryParts = query.toLowerCase().split(/\s+/).filter(Boolean);
  const textLower = text.toLowerCase();

  const allPartsMatch = queryParts.every(part =>
    textLower.includes(part) ||
    textLower.replace(/[^a-z0-9]/g, '').includes(part.replace(/[^a-z0-9]/g, ''))
  );

  if (allPartsMatch) return true;

  let queryIndex = 0;
  for (let i = 0; i < normalizedText.length && queryIndex < normalizedQuery.length; i++) {
    if (normalizedText[i] === normalizedQuery[queryIndex]) {
      queryIndex++;
    }
  }

  return queryIndex === normalizedQuery.length;
}

export type PanelMode = 'inventory' | 'edit';
export type PanelSnapPoint = 'collapsed' | 'half' | 'full';
export type InventoryGrouping = 'category' | 'drawer' | 'flat';

interface DrawerStore {
  // State
  drawers: Record<string, Drawer>;
  drawerOrder: string[]; // Order of drawer IDs for display
  activeDrawerId: string | null;
  categories: Record<string, Category>;
  selectedDrawerIds: Set<string>; // Selected drawers for editing
  selectedCompartmentIds: Set<string>;
  selectedSubCompartmentId: string | null;
  editMode: EditMode;
  isMobileMenuOpen: boolean;
  isAddDrawerModalOpen: boolean;
  isCategoryModalOpen: boolean;
  searchQuery: string;
  searchMatchIds: Set<string>;

  // Panel state
  isPanelVisible: boolean;
  panelMode: PanelMode;
  panelSnapPoint: PanelSnapPoint;
  inventoryGrouping: InventoryGrouping;
  panelWasVisibleBeforeEdit: boolean;

  // Drawer actions
  addDrawer: (options: CreateDrawerOptions) => void | Promise<void>;
  removeDrawer: (drawerId: string) => void | Promise<void>;
  renameDrawer: (drawerId: string, name: string) => void | Promise<void>;
  setActiveDrawer: (drawerId: string) => void;
  resizeDrawer: (drawerId: string, rows: number, cols: number) => void;
  moveDrawerInGrid: (drawerId: string, gridX: number, gridY: number) => boolean | Promise<boolean>;
  canMoveDrawerTo: (drawerId: string, gridX: number, gridY: number) => boolean;
  selectDrawer: (drawerId: string, additive?: boolean) => void;
  toggleDrawerSelection: (drawerId: string) => void;
  clearDrawerSelection: () => void;

  // Category actions
  addCategory: (name: string, colorOrIndex: string | number) => void | Promise<void>;
  updateCategory: (id: string, name: string, colorOrIndex: string | number) => void | Promise<void>;
  removeCategory: (id: string) => void | Promise<void>;
  getCategoryColor: (categoryId: string) => string | undefined;

  // Compartment actions
  setDividerCount: (compartmentId: string, count: number) => void | Promise<void>;
  setDividerOrientation: (
    compartmentId: string,
    orientation: 'horizontal' | 'vertical'
  ) => void | Promise<void>;
  mergeSelectedCompartments: () => Promise<void>;
  splitCompartment: (compartmentId: string) => Promise<void>;

  // Sub-compartment actions
  updateItem: (
    compartmentId: string,
    subCompartmentId: string,
    item: StoredItem | null
  ) => void | Promise<void>;

  // Selection actions
  selectCompartment: (compartmentId: string, additive?: boolean, drawerId?: string) => void;
  selectSubCompartment: (subCompartmentId: string | null) => void;
  clearSelection: () => void;
  toggleCompartmentSelection: (compartmentId: string) => void;
  selectRectangle: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  lastSelectedPosition: { row: number; col: number } | null;

  // Hover tracking for collaborator cursors
  hoveredCompartmentId: string | null;
  setHoveredCompartment: (compartmentId: string | null) => void;

  // Touch interaction tracking (disables camera pan during long-press)
  isPointerDownOnCompartment: boolean;
  setPointerDownOnCompartment: (down: boolean) => void;

  // Rectangle drag selection (mobile long-press + drag)
  rectangleSelectStart: { row: number; col: number; drawerId: string } | null;
  setRectangleSelectStart: (start: { row: number; col: number; drawerId: string } | null) => void;
  updateRectangleSelect: (endRow: number, endCol: number) => void; // Updates selection in real-time during drag
  completeRectangleSelect: () => void; // Finalizes selection and clears start

  // Edit mode actions
  setEditMode: (mode: EditMode) => void;

  // Mass edit actions
  applyToSelected: (item: Partial<StoredItem>) => void | Promise<void>;
  setDividerCountForSelected: (count: number) => void;

  // Search actions
  setSearchQuery: (query: string) => void;

  // UI actions
  setMobileMenuOpen: (open: boolean) => void;
  setAddDrawerModalOpen: (open: boolean) => void;
  setCategoryModalOpen: (open: boolean) => void;

  // Panel actions
  setPanelVisible: (visible: boolean) => void;
  togglePanel: () => void;
  setPanelMode: (mode: PanelMode) => void;
  setPanelSnapPoint: (snap: PanelSnapPoint) => void;
  onSheetDragStart: () => void;
  setInventoryGrouping: (grouping: InventoryGrouping) => void;
  navigateToItem: (drawerId: string, compartmentId: string) => void;
  navigateToDrawer: (drawerId: string) => void;
  enterEditMode: () => void; // Enter edit mode, save panel state
  exitEditMode: () => void; // Go back from edit, restore panel visibility

  // Helpers
  getActiveDrawer: () => Drawer | null;
  getCompartment: (compartmentId: string) => Compartment | null;
  getCategory: (categoryId: string) => Category | undefined;
  getOrderedDrawers: () => Drawer[];

  // API integration
  loadFromApi: (room: RoomWithDrawers) => void;

  // Data management
  clearRoomData: () => void;
}

export const useDrawerStore = create<DrawerStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),
      selectedDrawerIds: new Set<string>(),
      selectedCompartmentIds: new Set<string>(),
      selectedSubCompartmentId: null,
      editMode: 'view' as EditMode,
      isMobileMenuOpen: false,
      isAddDrawerModalOpen: false,
      isCategoryModalOpen: false,
      searchQuery: '',
      searchMatchIds: new Set<string>(),
      lastSelectedPosition: null as { row: number; col: number } | null,
      hoveredCompartmentId: null as string | null,
      isPointerDownOnCompartment: false,
      rectangleSelectStart: null as { row: number; col: number; drawerId: string } | null,
      isPanelVisible: false,
      panelMode: 'inventory' as PanelMode,
      panelSnapPoint: 'collapsed' as PanelSnapPoint,
      inventoryGrouping: 'category' as InventoryGrouping,
      panelWasVisibleBeforeEdit: false,

      addDrawer: async (options) => {
        const state = get();
        const authState = useAuthStore.getState();
        const rows = options.rows ?? DEFAULT_DRAWER_ROWS;
        const cols = options.cols ?? DEFAULT_DRAWER_COLS;
        const { gridX, gridY } = findNextAvailablePosition(state.drawers, cols, rows);

        // If online, create via API and use server-generated IDs
        if (authState.mode === 'online' && authState.currentRoomId) {
          try {
            const apiDrawer = await api.createDrawer(authState.currentRoomId, {
              name: options.name,
              rows,
              cols,
              gridX,
              gridY,
            });

            const compartments: Record<string, Compartment> = {};
            for (const apiComp of apiDrawer.compartments) {
              compartments[apiComp.id] = {
                id: apiComp.id,
                row: apiComp.row,
                col: apiComp.col,
                rowSpan: apiComp.rowSpan ?? 1,
                colSpan: apiComp.colSpan ?? 1,
                dividerOrientation: apiComp.dividerOrientation,
                subCompartments: apiComp.subCompartments
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map(sc => ({
                    id: sc.id,
                    relativeSize: sc.relativeSize,
                    item: null,
                  })),
              };
            }

            const newDrawer: Drawer = {
              id: apiDrawer.id,
              name: apiDrawer.name,
              rows: apiDrawer.rows,
              cols: apiDrawer.cols,
              compartments,
              gridX: apiDrawer.gridX,
              gridY: apiDrawer.gridY,
            };

            set((state) => ({
              drawers: { ...state.drawers, [newDrawer.id]: newDrawer },
              drawerOrder: [...state.drawerOrder, newDrawer.id],
              activeDrawerId: newDrawer.id,
              isAddDrawerModalOpen: false,
            }));

            // Broadcast to other connected users
            broadcastDrawerCreated(newDrawer, get().drawerOrder.length - 1);
          } catch (error) {
            console.error('Failed to create drawer:', error);
          }
        } else {
          const newDrawer = createDrawer({ ...options, gridX, gridY });
          set((state) => ({
            drawers: { ...state.drawers, [newDrawer.id]: newDrawer },
            drawerOrder: [...state.drawerOrder, newDrawer.id],
            activeDrawerId: newDrawer.id,
            isAddDrawerModalOpen: false,
          }));
        }
      },

      removeDrawer: async (drawerId) => {
        const authState = useAuthStore.getState();

        // If online, delete via API first
        if (authState.mode === 'online' && authState.currentRoomId) {
          try {
            await api.deleteDrawer(authState.currentRoomId, drawerId);
          } catch (error) {
            console.error('Failed to delete drawer:', error);
            return;
          }
        }

        set((state) => {
          const remaining = Object.fromEntries(
            Object.entries(state.drawers).filter(([id]) => id !== drawerId)
          );
          const newOrder = state.drawerOrder.filter(id => id !== drawerId);
          return {
            drawers: remaining,
            drawerOrder: newOrder,
            activeDrawerId:
              state.activeDrawerId === drawerId
                ? newOrder[0] || null
                : state.activeDrawerId,
            selectedCompartmentIds: new Set(),
            selectedSubCompartmentId: null,
          };
        });

        // Broadcast to other connected users
        broadcastDrawerDeleted(drawerId);
      },

      renameDrawer: async (drawerId, name) => {
        const authState = useAuthStore.getState();
        const timestamp = Date.now();

        // If online, update via API
        if (authState.mode === 'online' && authState.currentRoomId) {
          try {
            await api.updateDrawer(authState.currentRoomId, drawerId, { name, updatedAt: timestamp });
          } catch (error) {
            console.error('Failed to rename drawer:', error);
            return;
          }
        }

        set((state) => ({
          drawers: {
            ...state.drawers,
            [drawerId]: { ...state.drawers[drawerId], name },
          },
        }));

        // Broadcast to other connected users
        broadcastDrawerUpdated(drawerId, { name });
      },

      setActiveDrawer: (drawerId) => {
        set({
          activeDrawerId: drawerId,
          selectedCompartmentIds: new Set(),
          selectedSubCompartmentId: null,
          editMode: 'view',
          searchQuery: '',
          searchMatchIds: new Set(),
        });
      },

      resizeDrawer: (drawerId, rows, cols) => {
        const drawer = get().drawers[drawerId];
        if (!drawer) return;

        const compartments: Record<string, Compartment> = {};
        const existingByPosition: Record<string, Compartment> = {};

        Object.values(drawer.compartments).forEach((comp) => {
          existingByPosition[`${comp.row}-${comp.col}`] = comp;
        });

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const key = `${row}-${col}`;
            const existing = existingByPosition[key];
            if (existing) {
              compartments[existing.id] = existing;
            } else {
              const newComp = createCompartment(row, col);
              compartments[newComp.id] = newComp;
            }
          }
        }

        set((state) => ({
          drawers: {
            ...state.drawers,
            [drawerId]: { ...drawer, rows, cols, compartments },
          },
          selectedCompartmentIds: new Set(),
          selectedSubCompartmentId: null,
        }));
      },

      canMoveDrawerTo: (drawerId, gridX, gridY) => {
        const { drawers } = get();
        const drawer = drawers[drawerId];
        if (!drawer) return false;
        return !wouldOverlap(drawers, drawerId, gridX, gridY, drawer.cols, drawer.rows);
      },

      moveDrawerInGrid: async (drawerId, gridX, gridY) => {
        const state = get();
        const authState = useAuthStore.getState();
        const { isOnline, addPendingOperation } = useOfflineStore.getState();
        const drawer = state.drawers[drawerId];
        if (!drawer) return false;
        if (wouldOverlap(state.drawers, drawerId, gridX, gridY, drawer.cols, drawer.rows)) {
          return false;
        }

        const timestamp = Date.now();

        // If online and connected, update via API
        if (authState.mode === 'online' && authState.currentRoomId && isOnline) {
          try {
            await api.updateDrawer(authState.currentRoomId, drawerId, { gridX, gridY, updatedAt: timestamp });
          } catch (error) {
            console.error('Failed to move drawer:', error);
            // Queue for later sync and continue with local update
            addPendingOperation({
              type: 'update',
              entity: 'drawer',
              entityId: drawerId,
              data: { gridX, gridY, updatedAt: timestamp },
            });
          }
        } else if (authState.mode === 'online' && authState.currentRoomId && !isOnline) {
          // Offline but authenticated - queue for later
          addPendingOperation({
            type: 'update',
            entity: 'drawer',
            entityId: drawerId,
            data: { gridX, gridY, updatedAt: timestamp },
          });
        }

        set((s) => ({
          drawers: {
            ...s.drawers,
            [drawerId]: { ...drawer, gridX, gridY },
          },
        }));

        // Broadcast to other connected users (will be no-op if offline)
        broadcastDrawerUpdated(drawerId, { gridX, gridY });
        return true;
      },

      selectDrawer: (drawerId, additive = false) => {
        set((state) => {
          const newSelection = additive
            ? new Set(state.selectedDrawerIds)
            : new Set<string>();
          newSelection.add(drawerId);
          return {
            activeDrawerId: drawerId,
            selectedDrawerIds: newSelection,
            selectedCompartmentIds: new Set<string>(),
            selectedSubCompartmentId: null,
          };
        });
      },

      toggleDrawerSelection: (drawerId) => {
        set((state) => {
          const newSelection = new Set(state.selectedDrawerIds);
          if (newSelection.has(drawerId)) {
            newSelection.delete(drawerId);
          } else {
            newSelection.add(drawerId);
          }
          return {
            selectedDrawerIds: newSelection,
            selectedCompartmentIds: new Set<string>(),
            selectedSubCompartmentId: null,
          };
        });
      },

      clearDrawerSelection: () => {
        set({ selectedDrawerIds: new Set<string>() });
      },

      addCategory: async (name, colorOrIndex) => {
        const authState = useAuthStore.getState();

        // If online, create via API
        if (authState.mode === 'online' && authState.currentRoomId) {
          try {
            const input: { name: string; colorIndex?: number; color?: string } = { name };
            if (typeof colorOrIndex === 'number') {
              input.colorIndex = colorOrIndex;
            } else {
              input.color = colorOrIndex;
            }
            const apiCategory = await api.createCategory(authState.currentRoomId, input);
            const category: Category = {
              id: apiCategory.id,
              name: apiCategory.name,
              colorIndex: apiCategory.colorIndex ?? undefined,
              color: apiCategory.color ?? undefined,
            };
            set((state) => ({
              categories: {
                ...state.categories,
                [category.id]: category,
              },
            }));

            // Broadcast to other connected users
            broadcastCategoryCreated(category);
          } catch (error) {
            console.error('Failed to create category:', error);
          }
        } else {
          const id = generateId();
          const category: Category = { id, name };
          if (typeof colorOrIndex === 'number') {
            category.colorIndex = colorOrIndex;
          } else {
            category.color = colorOrIndex;
          }
          set((state) => ({
            categories: {
              ...state.categories,
              [id]: category,
            },
          }));
        }
      },

      updateCategory: async (id, name, colorOrIndex) => {
        const authState = useAuthStore.getState();
        const timestamp = Date.now();

        // If online, update via API
        if (authState.mode === 'online' && authState.currentRoomId) {
          try {
            const input: { name?: string; colorIndex?: number; color?: string; updatedAt: number } = { name, updatedAt: timestamp };
            if (typeof colorOrIndex === 'number') {
              input.colorIndex = colorOrIndex;
            } else {
              input.color = colorOrIndex;
            }
            await api.updateCategory(authState.currentRoomId, id, input);
          } catch (error) {
            console.error('Failed to update category:', error);
            return;
          }
        }

        set((state) => {
          const existing = state.categories[id];
          if (!existing) return state;
          const updated: Category = { id, name };
          if (typeof colorOrIndex === 'number') {
            updated.colorIndex = colorOrIndex;
          } else {
            updated.color = colorOrIndex;
          }
          return {
            categories: {
              ...state.categories,
              [id]: updated,
            },
          };
        });

        // Broadcast to other connected users
        const changes: { name?: string; colorIndex?: number; color?: string } = { name };
        if (typeof colorOrIndex === 'number') {
          changes.colorIndex = colorOrIndex;
        } else {
          changes.color = colorOrIndex;
        }
        broadcastCategoryUpdated(id, changes);
      },

      getCategoryColor: (categoryId) => {
        const category = get().categories[categoryId];
        return category ? getCategoryColor(category) : undefined;
      },

      removeCategory: async (id) => {
        const authState = useAuthStore.getState();

        // If online, delete via API
        if (authState.mode === 'online' && authState.currentRoomId) {
          try {
            await api.deleteCategory(authState.currentRoomId, id);
          } catch (error) {
            console.error('Failed to delete category:', error);
            return;
          }
        }

        set((state) => {
          const remaining = Object.fromEntries(
            Object.entries(state.categories).filter(([catId]) => catId !== id)
          );
          return { categories: remaining };
        });

        // Broadcast to other connected users
        broadcastCategoryDeleted(id);
      },

      setDividerCount: async (compartmentId, count) => {
        const { activeDrawerId, drawers } = get();
        const authState = useAuthStore.getState();
        const { isOnline } = useOfflineStore.getState();
        if (!activeDrawerId) return;

        const drawer = drawers[activeDrawerId];
        const compartment = drawer?.compartments[compartmentId];
        if (!compartment) return;

        // If online and connected, update via API and use server-generated subcompartment IDs
        if (authState.mode === 'online' && isOnline) {
          try {
            const apiSubCompartments = await api.setDividerCount(activeDrawerId, compartmentId, count);
            const subCompartments: SubCompartment[] = apiSubCompartments
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((sc) => ({
                id: sc.id,
                relativeSize: sc.relativeSize,
                item: sc.itemLabel
                  ? {
                      label: sc.itemLabel,
                      categoryId: sc.itemCategoryId ?? undefined,
                      quantity: sc.itemQuantity ?? undefined,
                    }
                  : null,
              }));

            set((state) => ({
              drawers: {
                ...state.drawers,
                [activeDrawerId]: {
                  ...drawer,
                  compartments: {
                    ...drawer.compartments,
                    [compartmentId]: { ...compartment, subCompartments },
                  },
                },
              },
            }));

            // Broadcast to other connected users
            broadcastDividersChanged(activeDrawerId, compartmentId, subCompartments);
            return;
          } catch (error) {
            console.error('Failed to set divider count:', error);
            // Fall through to local mode
          }
        }
        // Local mode (or offline fallback)
        const subCompartmentCount = count + 1;
        const existingItems = compartment.subCompartments
          .map((sc) => sc.item)
          .filter(Boolean);

        const subCompartments: SubCompartment[] = Array.from(
          { length: subCompartmentCount },
          (_, i) => ({
            id: generateId(),
            relativeSize: 1 / subCompartmentCount,
            item: existingItems[i] || null,
          })
        );

        set((state) => ({
          drawers: {
            ...state.drawers,
            [activeDrawerId]: {
              ...drawer,
              compartments: {
                ...drawer.compartments,
                [compartmentId]: { ...compartment, subCompartments },
              },
            },
          },
        }));
      },

      setDividerOrientation: async (compartmentId, orientation) => {
        const { activeDrawerId, drawers } = get();
        const authState = useAuthStore.getState();
        if (!activeDrawerId) return;

        const drawer = drawers[activeDrawerId];
        const compartment = drawer?.compartments[compartmentId];
        if (!compartment) return;

        const timestamp = Date.now();

        // If online, update via API
        if (authState.mode === 'online') {
          try {
            await api.updateCompartment(activeDrawerId, compartmentId, { dividerOrientation: orientation, updatedAt: timestamp });
          } catch (error) {
            console.error('Failed to update compartment orientation:', error);
            return;
          }
        }

        set((state) => ({
          drawers: {
            ...state.drawers,
            [activeDrawerId]: {
              ...drawer,
              compartments: {
                ...drawer.compartments,
                [compartmentId]: { ...compartment, dividerOrientation: orientation },
              },
            },
          },
        }));

        // Broadcast to other connected users
        broadcastCompartmentUpdated(activeDrawerId, compartmentId, { dividerOrientation: orientation });
      },

      mergeSelectedCompartments: async () => {
        const { activeDrawerId, drawers, selectedCompartmentIds } = get();
        const authState = useAuthStore.getState();
        const { isOnline } = useOfflineStore.getState();
        if (!activeDrawerId || selectedCompartmentIds.size < 2) return;

        const drawer = drawers[activeDrawerId];
        if (!drawer) return;

        const compartmentIds = Array.from(selectedCompartmentIds);
        const compartments = compartmentIds.map(id => drawer.compartments[id]).filter(Boolean);

        // Validate merge using helper (checks rectangle formation)
        const validation = canMergeCompartments(drawer.compartments, selectedCompartmentIds);
        if (!validation.valid) {
          console.error(validation.error);
          return;
        }

        // Get all cells occupied by selected compartments
        const allCells = compartments.flatMap(c => getOccupiedCells(c));
        const bbox = getBoundingBox(allCells);

        // Find anchor (top-left) compartment
        const anchor = compartments.find(c => c.row === bbox.minRow && c.col === bbox.minCol);
        if (!anchor) return;

        const toDeleteIds = compartmentIds.filter(id => id !== anchor.id);
        const rowSpan = bbox.maxRow - bbox.minRow + 1;
        const colSpan = bbox.maxCol - bbox.minCol + 1;

        // Collect all items from compartments being merged
        const allItems = compartments
          .flatMap(c => c.subCompartments)
          .filter(sc => sc.item)
          .map(sc => sc.item!);

        // If online and connected, try API
        if (authState.mode === 'online' && isOnline) {
          try {
            const result = await api.mergeCompartments(activeDrawerId, compartmentIds);

            // Update local state with server response
            const newCompartments = { ...drawer.compartments };
            for (const id of result.deletedIds) {
              delete newCompartments[id];
            }

            const subCompartments: SubCompartment[] = result.compartment.subCompartments
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map(sc => ({
                id: sc.id,
                relativeSize: sc.relativeSize,
                item: sc.itemLabel ? {
                  label: sc.itemLabel,
                  categoryId: sc.itemCategoryId ?? undefined,
                  quantity: sc.itemQuantity ?? undefined,
                } : null,
              }));

            newCompartments[result.compartment.id] = {
              id: result.compartment.id,
              row: result.compartment.row,
              col: result.compartment.col,
              rowSpan: result.compartment.rowSpan,
              colSpan: result.compartment.colSpan,
              dividerOrientation: result.compartment.dividerOrientation,
              subCompartments,
            };

            set(state => ({
              drawers: {
                ...state.drawers,
                [activeDrawerId]: { ...drawer, compartments: newCompartments },
              },
              selectedCompartmentIds: new Set([result.compartment.id]),
            }));

            // Broadcast merge to other users
            broadcastCompartmentsMerged(
              activeDrawerId,
              result.deletedIds,
              newCompartments[result.compartment.id]
            );
            return;
          } catch (error) {
            console.error('Failed to merge compartments:', error);
            // Fall through to local mode
          }
        }
        // Local mode (or offline fallback)
        const subCount = Math.max(2, allItems.length);
        const subCompartments: SubCompartment[] = Array.from({ length: subCount }, (_, i) => ({
          id: generateId(),
          relativeSize: 1 / subCount,
          item: allItems[i] ?? null,
        }));

        const newCompartments = { ...drawer.compartments };
        for (const id of toDeleteIds) {
          delete newCompartments[id];
        }
        newCompartments[anchor.id] = {
          ...anchor,
          rowSpan,
          colSpan,
          subCompartments,
        };

        set(state => ({
          drawers: {
            ...state.drawers,
            [activeDrawerId]: { ...drawer, compartments: newCompartments },
          },
          selectedCompartmentIds: new Set([anchor.id]),
        }));
      },

      splitCompartment: async (compartmentId) => {
        const { activeDrawerId, drawers } = get();
        const authState = useAuthStore.getState();
        const { isOnline } = useOfflineStore.getState();
        if (!activeDrawerId) return;

        const drawer = drawers[activeDrawerId];
        const compartment = drawer?.compartments[compartmentId];
        if (!compartment) return;

        const rowSpan = compartment.rowSpan ?? 1;
        const colSpan = compartment.colSpan ?? 1;

        if (rowSpan === 1 && colSpan === 1) {
          console.error('Cannot split a single-cell compartment');
          return;
        }

        // Collect existing items
        const existingItems = compartment.subCompartments
          .filter(sc => sc.item)
          .map(sc => sc.item!);

        // If online and connected, try API
        if (authState.mode === 'online' && isOnline) {
          try {
            const result = await api.splitCompartment(activeDrawerId, compartmentId);

            // Update local state with server response
            const newCompartments = { ...drawer.compartments };

            for (const comp of result.compartments) {
              const subCompartments: SubCompartment[] = comp.subCompartments
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(sc => ({
                  id: sc.id,
                  relativeSize: sc.relativeSize,
                  item: sc.itemLabel ? {
                    label: sc.itemLabel,
                    categoryId: sc.itemCategoryId ?? undefined,
                    quantity: sc.itemQuantity ?? undefined,
                  } : null,
                }));

              newCompartments[comp.id] = {
                id: comp.id,
                row: comp.row,
                col: comp.col,
                rowSpan: comp.rowSpan,
                colSpan: comp.colSpan,
                dividerOrientation: comp.dividerOrientation,
                subCompartments,
              };
            }

            set(state => ({
              drawers: {
                ...state.drawers,
                [activeDrawerId]: { ...drawer, compartments: newCompartments },
              },
              selectedCompartmentIds: new Set([compartmentId]),
            }));

            // Broadcast split to other users
            const newCompartmentsList = result.compartments.map(comp => newCompartments[comp.id]);
            broadcastCompartmentSplit(activeDrawerId, compartmentId, newCompartmentsList);
            return;
          } catch (error) {
            console.error('Failed to split compartment:', error);
            // Fall through to local mode
          }
        }
        // Local mode (or offline fallback)
        const newCompartments = { ...drawer.compartments };
        let itemIndex = 0;

        for (let r = 0; r < rowSpan; r++) {
          for (let c = 0; c < colSpan; c++) {
            const isAnchor = r === 0 && c === 0;
            const newRow = compartment.row + r;
            const newCol = compartment.col + c;
            const newId = isAnchor ? compartmentId : generateId();

            const subCompartments: SubCompartment[] = [
              {
                id: generateId(),
                relativeSize: 0.5,
                item: isAnchor && itemIndex < existingItems.length ? existingItems[itemIndex++] : null,
              },
              {
                id: generateId(),
                relativeSize: 0.5,
                item: isAnchor && itemIndex < existingItems.length ? existingItems[itemIndex++] : null,
              },
            ];

            newCompartments[newId] = {
              id: newId,
              row: newRow,
              col: newCol,
              rowSpan: 1,
              colSpan: 1,
              dividerOrientation: compartment.dividerOrientation,
              subCompartments,
            };
          }
        }

        set(state => ({
          drawers: {
            ...state.drawers,
            [activeDrawerId]: { ...drawer, compartments: newCompartments },
          },
          selectedCompartmentIds: new Set([compartmentId]),
        }));
      },

      updateItem: async (compartmentId, subCompartmentId, item) => {
        const { activeDrawerId, drawers } = get();
        const authState = useAuthStore.getState();
        const { isOnline, addPendingOperation } = useOfflineStore.getState();
        if (!activeDrawerId) return;

        const drawer = drawers[activeDrawerId];
        const compartment = drawer?.compartments[compartmentId];
        if (!compartment) return;

        const timestamp = Date.now();

        // If online and connected, update via API
        if (authState.mode === 'online' && isOnline) {
          try {
            await api.updateSubCompartment(activeDrawerId, subCompartmentId, {
              itemLabel: item?.label ?? null,
              itemCategoryId: item?.categoryId ?? null,
              itemQuantity: item?.quantity ?? null,
              updatedAt: timestamp,
            });
          } catch (error) {
            console.error('Failed to update item:', error);
            // Queue for later sync
            addPendingOperation({
              type: 'update',
              entity: 'subCompartment',
              entityId: subCompartmentId,
              data: { drawerId: activeDrawerId, compartmentId, item, updatedAt: timestamp },
            });
          }
        } else if (authState.mode === 'online' && !isOnline) {
          // Offline but authenticated - queue for later
          addPendingOperation({
            type: 'update',
            entity: 'subCompartment',
            entityId: subCompartmentId,
            data: { drawerId: activeDrawerId, compartmentId, item, updatedAt: timestamp },
          });
        }

        const subCompartments = compartment.subCompartments.map((sc) =>
          sc.id === subCompartmentId ? { ...sc, item } : sc
        );

        set((state) => ({
          drawers: {
            ...state.drawers,
            [activeDrawerId]: {
              ...drawer,
              compartments: {
                ...drawer.compartments,
                [compartmentId]: { ...compartment, subCompartments },
              },
            },
          },
        }));

        // Broadcast to other connected users
        broadcastItemUpdated(activeDrawerId, compartmentId, subCompartmentId, item);
      },

      selectCompartment: (compartmentId, additive = false, drawerId) => {
        const state = get();
        const targetDrawerId = drawerId ?? state.activeDrawerId;
        const drawer = targetDrawerId ? state.drawers[targetDrawerId] : null;
        const compartment = drawer?.compartments[compartmentId];
        // If sheet is collapsed on mobile, reset to inventory mode (not edit mode)
        const shouldResetMode = state.panelSnapPoint === 'collapsed' && state.panelMode === 'edit';

        set((s) => {
          const newSelection = additive
            ? new Set(s.selectedCompartmentIds)
            : new Set<string>();
          newSelection.add(compartmentId);
          return {
            activeDrawerId: targetDrawerId,
            selectedCompartmentIds: newSelection,
            selectedSubCompartmentId: null,
            selectedDrawerIds: new Set<string>(),
            lastSelectedPosition: compartment
              ? { row: compartment.row, col: compartment.col }
              : s.lastSelectedPosition,
            ...(shouldResetMode && { panelMode: 'inventory' as PanelMode }),
          };
        });
      },

      selectSubCompartment: (subCompartmentId) => {
        set({ selectedSubCompartmentId: subCompartmentId });
      },

      clearSelection: () => {
        const { panelWasVisibleBeforeEdit, panelMode, selectedCompartmentIds, selectedDrawerIds } = get();
        const wasInEditMode = panelMode === 'edit';
        const hadSelection = selectedCompartmentIds.size > 0 || selectedDrawerIds.size > 0;
        // Only restore panel state if we were in edit mode with a selection
        const shouldRestorePanel = wasInEditMode && hadSelection;

        set({
          selectedCompartmentIds: new Set(),
          selectedSubCompartmentId: null,
          selectedDrawerIds: new Set(),
          // Don't change panelMode here - keep it as 'edit' when closing.
          // Mode swap to 'inventory' happens when panel is reopened with no selection
          // (same behavior as mobile sheet)
          ...(shouldRestorePanel && panelWasVisibleBeforeEdit && { panelMode: 'inventory' as PanelMode }),
          ...(shouldRestorePanel && { isPanelVisible: panelWasVisibleBeforeEdit }),
          // On mobile, collapse sheet if it wasn't visible before edit
          ...(shouldRestorePanel && !panelWasVisibleBeforeEdit && { panelSnapPoint: 'collapsed' as PanelSnapPoint }),
          // Reset the flag after using it to prevent stale state in future sessions
          ...(shouldRestorePanel && { panelWasVisibleBeforeEdit: false }),
        });
      },

      toggleCompartmentSelection: (compartmentId) => {
        const drawer = get().getActiveDrawer();
        const compartment = drawer?.compartments[compartmentId];

        set((state) => {
          const newSelection = new Set(state.selectedCompartmentIds);
          if (newSelection.has(compartmentId)) {
            newSelection.delete(compartmentId);
          } else {
            newSelection.add(compartmentId);
          }

          // Auto-open edit pane when multi-selecting
          const openEditPane = newSelection.size > 1;

          return {
            selectedCompartmentIds: newSelection,
            lastSelectedPosition: compartment
              ? { row: compartment.row, col: compartment.col }
              : state.lastSelectedPosition,
            ...(openEditPane && { panelMode: 'edit' as PanelMode, isPanelVisible: true }),
          };
        });
      },

      selectRectangle: (fromRow, fromCol, toRow, toCol) => {
        const drawer = get().getActiveDrawer();
        if (!drawer) return;

        const minRow = Math.min(fromRow, toRow);
        const maxRow = Math.max(fromRow, toRow);
        const minCol = Math.min(fromCol, toCol);
        const maxCol = Math.max(fromCol, toCol);

        const newSelection = new Set<string>();
        Object.values(drawer.compartments).forEach((comp) => {
          if (
            comp.row >= minRow &&
            comp.row <= maxRow &&
            comp.col >= minCol &&
            comp.col <= maxCol
          ) {
            newSelection.add(comp.id);
          }
        });

        // Auto-open edit pane when multi-selecting
        const openEditPane = newSelection.size > 1;

        set({
          selectedCompartmentIds: newSelection,
          lastSelectedPosition: { row: toRow, col: toCol },
          ...(openEditPane && { panelMode: 'edit' as PanelMode, isPanelVisible: true }),
        });
      },

      setHoveredCompartment: (compartmentId) => {
        set({ hoveredCompartmentId: compartmentId });
      },

      setPointerDownOnCompartment: (down) => {
        set({ isPointerDownOnCompartment: down });
      },

      setRectangleSelectStart: (start) => {
        set({
          rectangleSelectStart: start,
          // Also set activeDrawerId so updateRectangleSelect works on first selection
          ...(start ? { activeDrawerId: start.drawerId } : {}),
        });
      },

      updateRectangleSelect: (endRow, endCol) => {
        const { rectangleSelectStart, activeDrawerId, drawers } = get();
        if (!rectangleSelectStart || rectangleSelectStart.drawerId !== activeDrawerId) {
          return;
        }

        const drawer = drawers[activeDrawerId];
        if (!drawer) {
          return;
        }

        // Find all compartments within the rectangle
        const fromRow = Math.min(rectangleSelectStart.row, endRow);
        const toRow = Math.max(rectangleSelectStart.row, endRow);
        const fromCol = Math.min(rectangleSelectStart.col, endCol);
        const toCol = Math.max(rectangleSelectStart.col, endCol);

        const compartmentIds = new Set<string>();
        Object.values(drawer.compartments).forEach((comp) => {
          const compRowSpan = comp.rowSpan ?? 1;
          const compColSpan = comp.colSpan ?? 1;
          const compEndRow = comp.row + compRowSpan - 1;
          const compEndCol = comp.col + compColSpan - 1;

          // Check if compartment overlaps with selection rectangle
          if (
            comp.row <= toRow &&
            compEndRow >= fromRow &&
            comp.col <= toCol &&
            compEndCol >= fromCol
          ) {
            compartmentIds.add(comp.id);
          }
        });

        set({
          selectedCompartmentIds: compartmentIds,
          lastSelectedPosition: { row: endRow, col: endCol },
        });
      },

      completeRectangleSelect: () => {
        set({ rectangleSelectStart: null });
      },

      setEditMode: (mode) => {
        set((state) => ({
          editMode: mode,
          selectedCompartmentIds:
            mode === 'view' ? new Set() : state.selectedCompartmentIds,
        }));
      },

      applyToSelected: async (itemUpdates) => {
        const { activeDrawerId, drawers, selectedCompartmentIds } = get();
        const authState = useAuthStore.getState();
        if (!activeDrawerId || selectedCompartmentIds.size === 0) return;

        const drawer = drawers[activeDrawerId];
        const updatedCompartments = { ...drawer.compartments };

        // Collect all sub-compartment updates for batch API call
        const batchUpdates: Array<{
          id: string;
          itemLabel?: string | null;
          itemCategoryId?: string | null;
          itemQuantity?: number | null;
        }> = [];

        selectedCompartmentIds.forEach((compId) => {
          const compartment = updatedCompartments[compId];
          if (!compartment) return;

          const subCompartments = compartment.subCompartments.map((sc) => {
            const newItem = sc.item
              ? { ...sc.item, ...itemUpdates }
              : itemUpdates.label
                ? { label: itemUpdates.label, ...itemUpdates }
                : null;

            // Collect for batch update if online
            if (authState.mode === 'online') {
              batchUpdates.push({
                id: sc.id,
                itemLabel: newItem?.label ?? null,
                itemCategoryId: newItem?.categoryId ?? null,
                itemQuantity: newItem?.quantity ?? null,
              });
            }

            return { ...sc, item: newItem };
          });

          updatedCompartments[compId] = { ...compartment, subCompartments };
        });

        // If online, send batch update to API
        if (authState.mode === 'online' && batchUpdates.length > 0) {
          try {
            await api.batchUpdateSubCompartments(activeDrawerId, batchUpdates);
          } catch (error) {
            console.error('Failed to batch update items:', error);
            return;
          }
        }

        set((state) => ({
          drawers: {
            ...state.drawers,
            [activeDrawerId]: { ...drawer, compartments: updatedCompartments },
          },
        }));

        // Broadcast batch updates to other connected users
        if (authState.mode === 'online') {
          const syncUpdates: Array<{ compartmentId: string; subCompartmentId: string; item: StoredItem | null }> = [];
          selectedCompartmentIds.forEach((compId) => {
            const compartment = updatedCompartments[compId];
            if (!compartment) return;
            compartment.subCompartments.forEach((sc) => {
              syncUpdates.push({
                compartmentId: compId,
                subCompartmentId: sc.id,
                item: sc.item,
              });
            });
          });
          if (syncUpdates.length > 0) {
            broadcastItemsBatchUpdated(activeDrawerId, syncUpdates);
          }
        }
      },

      setDividerCountForSelected: (count) => {
        const { selectedCompartmentIds, setDividerCount } = get();
        selectedCompartmentIds.forEach((compId) => {
          setDividerCount(compId, count);
        });
      },

      setSearchQuery: (query) => {
        const { drawers, categories } = get();

        if (!query.trim()) {
          set({ searchQuery: query, searchMatchIds: new Set() });
          return;
        }

        const matchIds = new Set<string>();

        Object.values(drawers).forEach((drawer) => {
          Object.values(drawer.compartments).forEach((comp) => {
            comp.subCompartments.forEach((sc) => {
              if (sc.item) {
                if (fuzzyMatch(query, sc.item.label)) {
                  matchIds.add(comp.id);
                }
                if (sc.item.categoryId) {
                  const category = categories[sc.item.categoryId];
                  if (category && fuzzyMatch(query, category.name)) {
                    matchIds.add(comp.id);
                  }
                }
              }
            });
          });
        });

        set({ searchQuery: query, searchMatchIds: matchIds });
      },

      setMobileMenuOpen: (open) => set({ isMobileMenuOpen: open }),
      setAddDrawerModalOpen: (open) => set({ isAddDrawerModalOpen: open }),
      setCategoryModalOpen: (open) => set({ isCategoryModalOpen: open }),

      setPanelVisible: (visible) => set({
        isPanelVisible: visible,
        // Keep panelSnapPoint in sync so navigateToItem/navigateToDrawer can correctly
        // determine if panel was visible (they check both isPanelVisible and panelSnapPoint)
        ...(!visible && { panelSnapPoint: 'collapsed' as PanelSnapPoint }),
      }),
      togglePanel: () => {
        const { isPanelVisible, selectedCompartmentIds, selectedDrawerIds } = get();
        const isOpening = !isPanelVisible;
        const hasSelection = selectedCompartmentIds.size > 0 || selectedDrawerIds.size > 0;

        set({
          isPanelVisible: isOpening,
          ...(isOpening && !hasSelection && { panelMode: 'inventory' as PanelMode }),
          // Keep panelSnapPoint in sync when closing
          ...(!isOpening && { panelSnapPoint: 'collapsed' as PanelSnapPoint }),
        });
      },
      setPanelMode: (mode) => set({ panelMode: mode }),
      setPanelSnapPoint: (snap) => {
        set({ panelSnapPoint: snap });
      },
      onSheetDragStart: () => {
        // No-op - mode swap happens in setPanelSnapPoint when sheet actually opens
      },
      setInventoryGrouping: (grouping) => set({ inventoryGrouping: grouping }),
      navigateToItem: (drawerId, compartmentId) => {
        const { isPanelVisible, panelSnapPoint } = get();
        const wasSheetOpen = panelSnapPoint !== 'collapsed';
        // On mobile, use sheet state; on desktop, use panel visibility
        const wasVisibleBefore = isPanelVisible || wasSheetOpen;
        set({
          activeDrawerId: drawerId,
          selectedCompartmentIds: new Set([compartmentId]),
          selectedSubCompartmentId: null,
          selectedDrawerIds: new Set<string>(),
          panelMode: 'edit' as PanelMode,
          panelWasVisibleBeforeEdit: wasVisibleBefore,
          isPanelVisible: true,
          panelSnapPoint: 'half' as PanelSnapPoint,
        });
      },
      navigateToDrawer: (drawerId) => {
        const { isPanelVisible, panelSnapPoint } = get();
        const wasSheetOpen = panelSnapPoint !== 'collapsed';
        // On mobile, use sheet state; on desktop, use panel visibility
        const wasVisibleBefore = isPanelVisible || wasSheetOpen;
        set({
          activeDrawerId: drawerId,
          selectedCompartmentIds: new Set<string>(),
          selectedSubCompartmentId: null,
          selectedDrawerIds: new Set([drawerId]),
          panelMode: 'edit' as PanelMode,
          panelWasVisibleBeforeEdit: wasVisibleBefore,
          isPanelVisible: true,
          panelSnapPoint: 'half' as PanelSnapPoint,
        });
      },
      enterEditMode: () => {
        const { isPanelVisible, panelSnapPoint, panelMode } = get();
        // Don't save state if already in edit mode
        if (panelMode === 'edit') return;
        const wasSheetOpen = panelSnapPoint !== 'collapsed';
        const wasVisibleBefore = isPanelVisible || wasSheetOpen;
        set({
          panelMode: 'edit' as PanelMode,
          panelWasVisibleBeforeEdit: wasVisibleBefore,
          isPanelVisible: true,
          panelSnapPoint: 'half' as PanelSnapPoint,
        });
      },
      exitEditMode: () => {
        set({
          panelMode: 'inventory' as PanelMode,
          // Don't change panelWasVisibleBeforeEdit - preserve the original state
          // so deselecting after manually exiting edit mode behaves correctly
        });
      },

      getActiveDrawer: () => {
        const { activeDrawerId, drawers } = get();
        return activeDrawerId ? drawers[activeDrawerId] : null;
      },

      getCompartment: (compartmentId) => {
        const drawer = get().getActiveDrawer();
        return drawer?.compartments[compartmentId] || null;
      },

      getCategory: (categoryId) => {
        return get().categories[categoryId];
      },

      getOrderedDrawers: () => {
        const { drawers, drawerOrder } = get();
        return drawerOrder.map(id => drawers[id]).filter(Boolean);
      },

      loadFromApi: (room) => {
        // Transform API data to local store format
        const drawers: Record<string, Drawer> = {};
        const drawerOrder: string[] = [];

        // Sort drawers by sortOrder
        const sortedDrawers = [...room.drawers].sort((a, b) => a.sortOrder - b.sortOrder);

        for (const apiDrawer of sortedDrawers) {
          const compartments: Record<string, Compartment> = {};

          for (const apiCompartment of apiDrawer.compartments) {
            const subCompartments: SubCompartment[] = apiCompartment.subCompartments
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((sc) => ({
                id: sc.id,
                relativeSize: sc.relativeSize,
                item: sc.itemLabel
                  ? {
                      label: sc.itemLabel,
                      categoryId: sc.itemCategoryId ?? undefined,
                      quantity: sc.itemQuantity ?? undefined,
                    }
                  : null,
              }));

            compartments[apiCompartment.id] = {
              id: apiCompartment.id,
              row: apiCompartment.row,
              col: apiCompartment.col,
              rowSpan: apiCompartment.rowSpan ?? 1,
              colSpan: apiCompartment.colSpan ?? 1,
              dividerOrientation: apiCompartment.dividerOrientation,
              subCompartments,
            };
          }

          drawers[apiDrawer.id] = {
            id: apiDrawer.id,
            name: apiDrawer.name,
            rows: apiDrawer.rows,
            cols: apiDrawer.cols,
            compartments,
            gridX: apiDrawer.gridX,
            gridY: apiDrawer.gridY,
          };

          drawerOrder.push(apiDrawer.id);
        }

        // Transform categories
        const categories: Record<string, Category> = {};
        for (const apiCategory of room.categories) {
          categories[apiCategory.id] = {
            id: apiCategory.id,
            name: apiCategory.name,
            colorIndex: apiCategory.colorIndex ?? undefined,
            color: apiCategory.color ?? undefined,
          };
        }

        set({
          drawers,
          drawerOrder,
          categories,
          activeDrawerId: drawerOrder[0] || null,
          selectedCompartmentIds: new Set(),
          selectedSubCompartmentId: null,
          selectedDrawerIds: new Set(),
        });
      },

      clearRoomData: () => {
        // Reset to initial state
        set({
          ...createInitialState(),
          selectedDrawerIds: new Set<string>(),
          selectedCompartmentIds: new Set<string>(),
          selectedSubCompartmentId: null,
          editMode: 'view' as EditMode,
          searchQuery: '',
          searchMatchIds: new Set<string>(),
          lastSelectedPosition: null,
          hoveredCompartmentId: null,
          isPanelVisible: false,
          panelMode: 'inventory' as PanelMode,
          panelSnapPoint: 'collapsed' as PanelSnapPoint,
        });
        // Clear persisted data
        localStorage.removeItem(STORAGE_KEY);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          if (parsed.state?.selectedCompartmentIds) {
            parsed.state.selectedCompartmentIds = new Set(
              parsed.state.selectedCompartmentIds
            );
          }
          if (parsed.state?.searchMatchIds) {
            parsed.state.searchMatchIds = new Set(parsed.state.searchMatchIds);
          }
          return parsed;
        },
        setItem: (name, value) => {
          const toStore = {
            ...value,
            state: {
              ...value.state,
              selectedCompartmentIds: Array.from(
                value.state.selectedCompartmentIds || []
              ),
              searchMatchIds: Array.from(value.state.searchMatchIds || []),
            },
          };
          localStorage.setItem(name, JSON.stringify(toStore));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      partialize: (state) =>
        ({
          drawers: state.drawers,
          drawerOrder: state.drawerOrder,
          activeDrawerId: state.activeDrawerId,
          categories: state.categories,
        }) as DrawerStore,
    }
  )
);
