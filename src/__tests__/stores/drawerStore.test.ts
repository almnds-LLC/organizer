import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDrawerStore, getCategoryColor } from '../../store/drawerStore';
import type { Category, Drawer, Compartment, SubCompartment } from '../../types/drawer';

// Mock the api client
vi.mock('../../api/client', () => ({
  api: {
    createDrawer: vi.fn(),
    updateDrawer: vi.fn(),
    deleteDrawer: vi.fn(),
    updateCompartment: vi.fn(),
    updateSubCompartment: vi.fn(),
    setDividerCount: vi.fn(),
    batchUpdateSubCompartments: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  },
}));

// Mock authStore - local mode by default
vi.mock('../../store/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      mode: 'local',
      currentRoomId: null,
    })),
  },
}));

// Mock syncService
vi.mock('../../api/syncService', () => ({
  broadcastDrawerCreated: vi.fn(),
  broadcastDrawerUpdated: vi.fn(),
  broadcastDrawerDeleted: vi.fn(),
  broadcastCompartmentUpdated: vi.fn(),
  broadcastDividersChanged: vi.fn(),
  broadcastItemUpdated: vi.fn(),
  broadcastItemsBatchUpdated: vi.fn(),
  broadcastCategoryCreated: vi.fn(),
  broadcastCategoryUpdated: vi.fn(),
  broadcastCategoryDeleted: vi.fn(),
}));

function createTestDrawer(overrides?: Partial<Drawer>): Drawer {
  const subCompartment: SubCompartment = {
    id: 'sub1',
    relativeSize: 1,
    item: null,
  };

  const compartment: Compartment = {
    id: 'comp1',
    row: 0,
    col: 0,
    rowSpan: 1,
    colSpan: 1,
    dividerOrientation: 'horizontal',
    subCompartments: [subCompartment],
  };

  return {
    id: 'drawer1',
    name: 'Test Drawer',
    rows: 2,
    cols: 3,
    compartments: { comp1: compartment },
    gridX: 0,
    gridY: 0,
    ...overrides,
  };
}

describe('drawerStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDrawerStore.setState({
      drawers: {},
      drawerOrder: [],
      activeDrawerId: null,
      categories: {},
      selectedDrawerIds: new Set(),
      selectedCompartmentIds: new Set(),
      selectedSubCompartmentId: null,
      editMode: 'view',
      isMobileMenuOpen: false,
      isAddDrawerModalOpen: false,
      isCategoryModalOpen: false,
      searchQuery: '',
      searchMatchIds: new Set(),
      lastSelectedPosition: null,
      hoveredCompartmentId: null,
      isPanelVisible: false,
      panelMode: 'inventory',
      panelSnapPoint: 'collapsed',
      inventoryGrouping: 'category',
      panelWasVisibleBeforeEdit: false,
    });
  });

  describe('getCategoryColor helper', () => {
    it('should return color from colorIndex', () => {
      const category: Category = { id: 'cat1', name: 'Test', colorIndex: 0 };
      const color = getCategoryColor(category);
      expect(color).toBe('#fca5a5'); // First preset color
    });

    it('should return custom color if no colorIndex', () => {
      const category: Category = { id: 'cat1', name: 'Test', color: '#123456' };
      const color = getCategoryColor(category);
      expect(color).toBe('#123456');
    });

    it('should return default color if neither colorIndex nor color', () => {
      const category: Category = { id: 'cat1', name: 'Test' };
      const color = getCategoryColor(category);
      expect(color).toBe('#fca5a5'); // First preset as default
    });
  });

  describe('addDrawer (local mode)', () => {
    it('should add a drawer in local mode', async () => {
      const { addDrawer } = useDrawerStore.getState();
      await addDrawer({ name: 'New Drawer' });

      const { drawers, drawerOrder, activeDrawerId } = useDrawerStore.getState();
      expect(Object.keys(drawers)).toHaveLength(1);
      expect(drawerOrder).toHaveLength(1);
      expect(activeDrawerId).toBe(drawerOrder[0]);
      expect(Object.values(drawers)[0].name).toBe('New Drawer');
    });

    it('should close modal after adding', async () => {
      useDrawerStore.setState({ isAddDrawerModalOpen: true });
      await useDrawerStore.getState().addDrawer({ name: 'Test' });

      expect(useDrawerStore.getState().isAddDrawerModalOpen).toBe(false);
    });
  });

  describe('removeDrawer (local mode)', () => {
    it('should remove a drawer', async () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        drawerOrder: ['drawer1'],
        activeDrawerId: 'drawer1',
      });

      await useDrawerStore.getState().removeDrawer('drawer1');

      const { drawers, drawerOrder, activeDrawerId } = useDrawerStore.getState();
      expect(Object.keys(drawers)).toHaveLength(0);
      expect(drawerOrder).toHaveLength(0);
      expect(activeDrawerId).toBeNull();
    });

    it('should switch to next drawer when active is removed', async () => {
      const drawer1 = createTestDrawer({ id: 'drawer1', name: 'Drawer 1' });
      const drawer2 = createTestDrawer({ id: 'drawer2', name: 'Drawer 2' });

      useDrawerStore.setState({
        drawers: { drawer1, drawer2 },
        drawerOrder: ['drawer1', 'drawer2'],
        activeDrawerId: 'drawer1',
      });

      await useDrawerStore.getState().removeDrawer('drawer1');

      expect(useDrawerStore.getState().activeDrawerId).toBe('drawer2');
    });
  });

  describe('renameDrawer (local mode)', () => {
    it('should rename a drawer', async () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        drawerOrder: ['drawer1'],
      });

      await useDrawerStore.getState().renameDrawer('drawer1', 'New Name');

      expect(useDrawerStore.getState().drawers.drawer1.name).toBe('New Name');
    });
  });

  describe('setActiveDrawer', () => {
    it('should set active drawer and clear selection', () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        selectedCompartmentIds: new Set(['comp1']),
        editMode: 'single',
      });

      useDrawerStore.getState().setActiveDrawer('drawer1');

      const state = useDrawerStore.getState();
      expect(state.activeDrawerId).toBe('drawer1');
      expect(state.selectedCompartmentIds.size).toBe(0);
      expect(state.editMode).toBe('view');
    });
  });

  describe('selectCompartment', () => {
    it('should select a compartment', () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
      });

      useDrawerStore.getState().selectCompartment('comp1');

      expect(useDrawerStore.getState().selectedCompartmentIds.has('comp1')).toBe(true);
    });

    it('should support additive selection', () => {
      const comp2: Compartment = {
        id: 'comp2',
        row: 0,
        col: 1,
        rowSpan: 1,
        colSpan: 1,
        dividerOrientation: 'horizontal',
        subCompartments: [{ id: 'sub2', relativeSize: 1, item: null }],
      };
      const drawer = createTestDrawer({
        compartments: {
          comp1: createTestDrawer().compartments.comp1,
          comp2,
        },
      });

      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
        selectedCompartmentIds: new Set(['comp1']),
      });

      useDrawerStore.getState().selectCompartment('comp2', true);

      const { selectedCompartmentIds } = useDrawerStore.getState();
      expect(selectedCompartmentIds.has('comp1')).toBe(true);
      expect(selectedCompartmentIds.has('comp2')).toBe(true);
    });
  });

  describe('toggleCompartmentSelection', () => {
    it('should toggle compartment selection', () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
        selectedCompartmentIds: new Set(['comp1']),
      });

      useDrawerStore.getState().toggleCompartmentSelection('comp1');
      expect(useDrawerStore.getState().selectedCompartmentIds.has('comp1')).toBe(false);

      useDrawerStore.getState().toggleCompartmentSelection('comp1');
      expect(useDrawerStore.getState().selectedCompartmentIds.has('comp1')).toBe(true);
    });
  });

  describe('clearSelection', () => {
    it('should clear all selections', () => {
      useDrawerStore.setState({
        selectedCompartmentIds: new Set(['comp1', 'comp2']),
        selectedSubCompartmentId: 'sub1',
        selectedDrawerIds: new Set(['drawer1']),
      });

      useDrawerStore.getState().clearSelection();

      const state = useDrawerStore.getState();
      expect(state.selectedCompartmentIds.size).toBe(0);
      expect(state.selectedSubCompartmentId).toBeNull();
      expect(state.selectedDrawerIds.size).toBe(0);
    });
  });

  describe('selectRectangle', () => {
    it('should select compartments in rectangle', () => {
      // Create a 2x2 grid of compartments
      const compartments: Record<string, Compartment> = {};
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const id = `comp-${row}-${col}`;
          compartments[id] = {
            id,
            row,
            col,
            rowSpan: 1,
            colSpan: 1,
            dividerOrientation: 'horizontal',
            subCompartments: [{ id: `sub-${row}-${col}`, relativeSize: 1, item: null }],
          };
        }
      }

      const drawer = createTestDrawer({ compartments });
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
      });

      useDrawerStore.getState().selectRectangle(0, 0, 1, 1);

      const { selectedCompartmentIds } = useDrawerStore.getState();
      expect(selectedCompartmentIds.size).toBe(4);
    });
  });

  describe('setEditMode', () => {
    it('should set edit mode', () => {
      useDrawerStore.getState().setEditMode('single');
      expect(useDrawerStore.getState().editMode).toBe('single');
    });

    it('should clear selection when returning to view mode', () => {
      useDrawerStore.setState({
        selectedCompartmentIds: new Set(['comp1']),
        editMode: 'single',
      });

      useDrawerStore.getState().setEditMode('view');

      expect(useDrawerStore.getState().selectedCompartmentIds.size).toBe(0);
    });
  });

  describe('setSearchQuery', () => {
    it('should set search query and find matches', () => {
      const drawer = createTestDrawer();
      drawer.compartments.comp1.subCompartments[0].item = {
        label: 'Screws',
        categoryId: undefined,
        quantity: 10,
      };

      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
      });

      useDrawerStore.getState().setSearchQuery('screw');

      const { searchQuery, searchMatchIds } = useDrawerStore.getState();
      expect(searchQuery).toBe('screw');
      expect(searchMatchIds.has('comp1')).toBe(true);
    });

    it('should clear matches on empty query', () => {
      useDrawerStore.setState({
        searchQuery: 'test',
        searchMatchIds: new Set(['comp1']),
      });

      useDrawerStore.getState().setSearchQuery('');

      const { searchMatchIds } = useDrawerStore.getState();
      expect(searchMatchIds.size).toBe(0);
    });
  });

  describe('UI state setters', () => {
    it('should toggle mobile menu', () => {
      useDrawerStore.getState().setMobileMenuOpen(true);
      expect(useDrawerStore.getState().isMobileMenuOpen).toBe(true);

      useDrawerStore.getState().setMobileMenuOpen(false);
      expect(useDrawerStore.getState().isMobileMenuOpen).toBe(false);
    });

    it('should toggle add drawer modal', () => {
      useDrawerStore.getState().setAddDrawerModalOpen(true);
      expect(useDrawerStore.getState().isAddDrawerModalOpen).toBe(true);
    });

    it('should toggle category modal', () => {
      useDrawerStore.getState().setCategoryModalOpen(true);
      expect(useDrawerStore.getState().isCategoryModalOpen).toBe(true);
    });
  });

  describe('panel state', () => {
    it('should set panel visibility', () => {
      useDrawerStore.getState().setPanelVisible(true);
      expect(useDrawerStore.getState().isPanelVisible).toBe(true);
    });

    it('should toggle panel', () => {
      useDrawerStore.getState().togglePanel();
      expect(useDrawerStore.getState().isPanelVisible).toBe(true);

      useDrawerStore.getState().togglePanel();
      expect(useDrawerStore.getState().isPanelVisible).toBe(false);
    });

    it('should set panel mode', () => {
      useDrawerStore.getState().setPanelMode('edit');
      expect(useDrawerStore.getState().panelMode).toBe('edit');
    });

    it('should set panel snap point', () => {
      useDrawerStore.getState().setPanelSnapPoint('half');
      expect(useDrawerStore.getState().panelSnapPoint).toBe('half');
    });

    it('should set inventory grouping', () => {
      useDrawerStore.getState().setInventoryGrouping('drawer');
      expect(useDrawerStore.getState().inventoryGrouping).toBe('drawer');
    });
  });

  describe('navigateToItem', () => {
    it('should navigate to item and open panel', () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        isPanelVisible: false,
      });

      useDrawerStore.getState().navigateToItem('drawer1', 'comp1');

      const state = useDrawerStore.getState();
      expect(state.activeDrawerId).toBe('drawer1');
      expect(state.selectedCompartmentIds.has('comp1')).toBe(true);
      expect(state.panelMode).toBe('edit');
      expect(state.isPanelVisible).toBe(true);
    });
  });

  describe('getters', () => {
    it('should get active drawer', () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
      });

      const activeDrawer = useDrawerStore.getState().getActiveDrawer();
      expect(activeDrawer?.id).toBe('drawer1');
    });

    it('should return null when no active drawer', () => {
      const activeDrawer = useDrawerStore.getState().getActiveDrawer();
      expect(activeDrawer).toBeNull();
    });

    it('should get compartment', () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
      });

      const compartment = useDrawerStore.getState().getCompartment('comp1');
      expect(compartment?.id).toBe('comp1');
    });

    it('should get category', () => {
      useDrawerStore.setState({
        categories: { cat1: { id: 'cat1', name: 'Test Category', colorIndex: 2 } },
      });

      const category = useDrawerStore.getState().getCategory('cat1');
      expect(category?.name).toBe('Test Category');
    });

    it('should get ordered drawers', () => {
      const drawer1 = createTestDrawer({ id: 'drawer1', name: 'First' });
      const drawer2 = createTestDrawer({ id: 'drawer2', name: 'Second' });

      useDrawerStore.setState({
        drawers: { drawer1, drawer2 },
        drawerOrder: ['drawer2', 'drawer1'],
      });

      const ordered = useDrawerStore.getState().getOrderedDrawers();
      expect(ordered[0].id).toBe('drawer2');
      expect(ordered[1].id).toBe('drawer1');
    });
  });

  describe('addCategory (local mode)', () => {
    it('should add a category with colorIndex', async () => {
      await useDrawerStore.getState().addCategory('Test Cat', 3);

      const { categories } = useDrawerStore.getState();
      const catArray = Object.values(categories);
      expect(catArray).toHaveLength(1);
      expect(catArray[0].name).toBe('Test Cat');
      expect(catArray[0].colorIndex).toBe(3);
    });

    it('should add a category with custom color', async () => {
      await useDrawerStore.getState().addCategory('Custom', '#abcdef');

      const { categories } = useDrawerStore.getState();
      const catArray = Object.values(categories);
      expect(catArray[0].color).toBe('#abcdef');
    });
  });

  describe('removeCategory (local mode)', () => {
    it('should remove a category', async () => {
      useDrawerStore.setState({
        categories: { cat1: { id: 'cat1', name: 'Test', colorIndex: 0 } },
      });

      await useDrawerStore.getState().removeCategory('cat1');

      expect(Object.keys(useDrawerStore.getState().categories)).toHaveLength(0);
    });
  });

  describe('getCategoryColor (store method)', () => {
    it('should return category color', () => {
      useDrawerStore.setState({
        categories: { cat1: { id: 'cat1', name: 'Test', colorIndex: 2 } },
      });

      const color = useDrawerStore.getState().getCategoryColor('cat1');
      expect(color).toBeDefined();
    });

    it('should return undefined for unknown category', () => {
      const color = useDrawerStore.getState().getCategoryColor('unknown');
      expect(color).toBeUndefined();
    });
  });

  describe('selectDrawer', () => {
    it('should select a drawer', () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
      });

      useDrawerStore.getState().selectDrawer('drawer1');

      expect(useDrawerStore.getState().selectedDrawerIds.has('drawer1')).toBe(true);
      expect(useDrawerStore.getState().activeDrawerId).toBe('drawer1');
    });

    it('should support additive drawer selection', () => {
      const drawer1 = createTestDrawer({ id: 'drawer1' });
      const drawer2 = createTestDrawer({ id: 'drawer2' });

      useDrawerStore.setState({
        drawers: { drawer1, drawer2 },
        selectedDrawerIds: new Set(['drawer1']),
      });

      useDrawerStore.getState().selectDrawer('drawer2', true);

      const { selectedDrawerIds } = useDrawerStore.getState();
      expect(selectedDrawerIds.has('drawer1')).toBe(true);
      expect(selectedDrawerIds.has('drawer2')).toBe(true);
    });
  });

  describe('toggleDrawerSelection', () => {
    it('should toggle drawer selection', () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        selectedDrawerIds: new Set(['drawer1']),
      });

      useDrawerStore.getState().toggleDrawerSelection('drawer1');
      expect(useDrawerStore.getState().selectedDrawerIds.has('drawer1')).toBe(false);

      useDrawerStore.getState().toggleDrawerSelection('drawer1');
      expect(useDrawerStore.getState().selectedDrawerIds.has('drawer1')).toBe(true);
    });
  });

  describe('clearDrawerSelection', () => {
    it('should clear drawer selection', () => {
      useDrawerStore.setState({
        selectedDrawerIds: new Set(['drawer1', 'drawer2']),
      });

      useDrawerStore.getState().clearDrawerSelection();

      expect(useDrawerStore.getState().selectedDrawerIds.size).toBe(0);
    });
  });

  describe('setHoveredCompartment', () => {
    it('should set hovered compartment', () => {
      useDrawerStore.getState().setHoveredCompartment('comp1');
      expect(useDrawerStore.getState().hoveredCompartmentId).toBe('comp1');

      useDrawerStore.getState().setHoveredCompartment(null);
      expect(useDrawerStore.getState().hoveredCompartmentId).toBeNull();
    });
  });

  describe('canMoveDrawerTo', () => {
    it('should return true for valid position', () => {
      const drawer = createTestDrawer({ gridX: 0, gridY: 0 });
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
      });

      expect(useDrawerStore.getState().canMoveDrawerTo('drawer1', 10, 10)).toBe(true);
    });

    it('should return false for overlapping position', () => {
      const drawer1 = createTestDrawer({ id: 'drawer1', gridX: 0, gridY: 0 });
      const drawer2 = createTestDrawer({ id: 'drawer2', gridX: 5, gridY: 5 });

      useDrawerStore.setState({
        drawers: { drawer1, drawer2 },
      });

      // Try to move drawer1 to overlap drawer2
      expect(useDrawerStore.getState().canMoveDrawerTo('drawer1', 5, 5)).toBe(false);
    });
  });

  describe('exitEditMode', () => {
    it('should set panel mode to inventory and preserve panelWasVisibleBeforeEdit', () => {
      useDrawerStore.setState({
        panelMode: 'edit',
        panelWasVisibleBeforeEdit: false,
      });

      useDrawerStore.getState().exitEditMode();

      expect(useDrawerStore.getState().panelMode).toBe('inventory');
      // Should preserve the original value, not override it
      expect(useDrawerStore.getState().panelWasVisibleBeforeEdit).toBe(false);
    });
  });

  describe('resizeDrawer', () => {
    it('should resize drawer and preserve existing compartments', () => {
      const drawer = createTestDrawer({ rows: 2, cols: 2 });
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
      });

      useDrawerStore.getState().resizeDrawer('drawer1', 3, 3);

      const resized = useDrawerStore.getState().drawers.drawer1;
      expect(resized.rows).toBe(3);
      expect(resized.cols).toBe(3);
      expect(Object.keys(resized.compartments).length).toBe(9);
    });

    it('should do nothing for non-existent drawer', () => {
      useDrawerStore.getState().resizeDrawer('nonexistent', 3, 3);
      // No error thrown
    });
  });

  describe('moveDrawerInGrid', () => {
    it('should move drawer to new position', async () => {
      const drawer = createTestDrawer({ gridX: 0, gridY: 0 });
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
      });

      const result = await useDrawerStore.getState().moveDrawerInGrid('drawer1', 10, 10);

      expect(result).toBe(true);
      expect(useDrawerStore.getState().drawers.drawer1.gridX).toBe(10);
      expect(useDrawerStore.getState().drawers.drawer1.gridY).toBe(10);
    });

    it('should return false for non-existent drawer', async () => {
      const result = await useDrawerStore.getState().moveDrawerInGrid('nonexistent', 10, 10);
      expect(result).toBe(false);
    });

    it('should return false for overlapping position', async () => {
      const drawer1 = createTestDrawer({ id: 'drawer1', gridX: 0, gridY: 0 });
      const drawer2 = createTestDrawer({ id: 'drawer2', gridX: 20, gridY: 20 });

      useDrawerStore.setState({
        drawers: { drawer1, drawer2 },
      });

      const result = await useDrawerStore.getState().moveDrawerInGrid('drawer1', 20, 20);
      expect(result).toBe(false);
    });
  });

  describe('setDividerCount (local mode)', () => {
    it('should set divider count and create subcompartments', async () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
      });

      await useDrawerStore.getState().setDividerCount('comp1', 3);

      const comp = useDrawerStore.getState().drawers.drawer1.compartments.comp1;
      expect(comp.subCompartments.length).toBe(4); // 3 dividers = 4 subcompartments
    });

    it('should preserve existing items when changing dividers', async () => {
      const drawer = createTestDrawer();
      drawer.compartments.comp1.subCompartments[0].item = { label: 'Test Item' };
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
      });

      await useDrawerStore.getState().setDividerCount('comp1', 2);

      const comp = useDrawerStore.getState().drawers.drawer1.compartments.comp1;
      expect(comp.subCompartments[0].item?.label).toBe('Test Item');
    });

    it('should do nothing without active drawer', async () => {
      await useDrawerStore.getState().setDividerCount('comp1', 3);
      // No error thrown
    });
  });

  describe('setDividerOrientation (local mode)', () => {
    it('should set divider orientation', async () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
      });

      await useDrawerStore.getState().setDividerOrientation('comp1', 'vertical');

      const comp = useDrawerStore.getState().drawers.drawer1.compartments.comp1;
      expect(comp.dividerOrientation).toBe('vertical');
    });

    it('should do nothing without active drawer', async () => {
      await useDrawerStore.getState().setDividerOrientation('comp1', 'vertical');
      // No error thrown
    });
  });

  describe('updateItem (local mode)', () => {
    it('should update item in subcompartment', async () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
      });

      await useDrawerStore.getState().updateItem('comp1', 'sub1', { label: 'New Item', quantity: 5 });

      const sc = useDrawerStore.getState().drawers.drawer1.compartments.comp1.subCompartments[0];
      expect(sc.item?.label).toBe('New Item');
      expect(sc.item?.quantity).toBe(5);
    });

    it('should clear item when null is passed', async () => {
      const drawer = createTestDrawer();
      drawer.compartments.comp1.subCompartments[0].item = { label: 'Existing' };
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
      });

      await useDrawerStore.getState().updateItem('comp1', 'sub1', null);

      const sc = useDrawerStore.getState().drawers.drawer1.compartments.comp1.subCompartments[0];
      expect(sc.item).toBeNull();
    });

    it('should do nothing without active drawer', async () => {
      await useDrawerStore.getState().updateItem('comp1', 'sub1', { label: 'Test' });
      // No error thrown
    });
  });

  describe('applyToSelected (local mode)', () => {
    it('should apply item updates to all selected compartments', async () => {
      const compartments: Record<string, Compartment> = {
        comp1: {
          id: 'comp1',
          row: 0,
          col: 0,
          rowSpan: 1,
          colSpan: 1,
          dividerOrientation: 'horizontal',
          subCompartments: [{ id: 'sub1', relativeSize: 1, item: { label: 'Old' } }],
        },
        comp2: {
          id: 'comp2',
          row: 0,
          col: 1,
          rowSpan: 1,
          colSpan: 1,
          dividerOrientation: 'horizontal',
          subCompartments: [{ id: 'sub2', relativeSize: 1, item: null }],
        },
      };
      const drawer = createTestDrawer({ compartments });
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
        selectedCompartmentIds: new Set(['comp1', 'comp2']),
      });

      await useDrawerStore.getState().applyToSelected({ categoryId: 'cat1' });

      const state = useDrawerStore.getState();
      expect(state.drawers.drawer1.compartments.comp1.subCompartments[0].item?.categoryId).toBe('cat1');
    });

    it('should do nothing without selection', async () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
        selectedCompartmentIds: new Set(),
      });

      await useDrawerStore.getState().applyToSelected({ label: 'Test' });
      // No changes made
    });
  });

  describe('updateCategory (local mode)', () => {
    it('should update category with colorIndex', async () => {
      useDrawerStore.setState({
        categories: { cat1: { id: 'cat1', name: 'Old Name', colorIndex: 0 } },
      });

      await useDrawerStore.getState().updateCategory('cat1', 'New Name', 5);

      const cat = useDrawerStore.getState().categories.cat1;
      expect(cat.name).toBe('New Name');
      expect(cat.colorIndex).toBe(5);
    });

    it('should update category with custom color', async () => {
      useDrawerStore.setState({
        categories: { cat1: { id: 'cat1', name: 'Test', colorIndex: 0 } },
      });

      await useDrawerStore.getState().updateCategory('cat1', 'Test', '#ff0000');

      const cat = useDrawerStore.getState().categories.cat1;
      expect(cat.color).toBe('#ff0000');
    });

    it('should do nothing for non-existent category', async () => {
      await useDrawerStore.getState().updateCategory('nonexistent', 'Name', 0);
      // No error thrown
    });
  });

  describe('navigateToDrawer', () => {
    it('should navigate to drawer and set up edit mode', () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        isPanelVisible: false,
      });

      useDrawerStore.getState().navigateToDrawer('drawer1');

      const state = useDrawerStore.getState();
      expect(state.activeDrawerId).toBe('drawer1');
      expect(state.selectedDrawerIds.has('drawer1')).toBe(true);
      expect(state.panelMode).toBe('edit');
      expect(state.isPanelVisible).toBe(true);
    });
  });

  describe('selectSubCompartment', () => {
    it('should select a subcompartment', () => {
      useDrawerStore.getState().selectSubCompartment('sub1');
      expect(useDrawerStore.getState().selectedSubCompartmentId).toBe('sub1');
    });

    it('should clear subcompartment selection', () => {
      useDrawerStore.setState({ selectedSubCompartmentId: 'sub1' });
      useDrawerStore.getState().selectSubCompartment(null);
      expect(useDrawerStore.getState().selectedSubCompartmentId).toBeNull();
    });
  });

  describe('onSheetDragStart', () => {
    it('should be a no-op', () => {
      useDrawerStore.getState().onSheetDragStart();
      // No error thrown
    });
  });

  describe('loadFromApi', () => {
    it('should load room data from API format', () => {
      const apiRoom = {
        id: 'room1',
        name: 'Test Room',
        drawers: [
          {
            id: 'drawer1',
            name: 'API Drawer',
            rows: 2,
            cols: 2,
            gridX: 0,
            gridY: 0,
            sortOrder: 0,
            compartments: [
              {
                id: 'apiComp1',
                row: 0,
                col: 0,
                dividerOrientation: 'horizontal' as const,
                subCompartments: [
                  {
                    id: 'apiSub1',
                    relativeSize: 1,
                    sortOrder: 0,
                    itemLabel: 'Screws',
                    itemCategoryId: 'cat1',
                    itemQuantity: 10,
                  },
                ],
              },
            ],
          },
        ],
        categories: [
          { id: 'cat1', name: 'Hardware', colorIndex: 2, color: null },
        ],
      };

      useDrawerStore.getState().loadFromApi(apiRoom as any);

      const state = useDrawerStore.getState();
      expect(state.drawerOrder).toContain('drawer1');
      expect(state.drawers.drawer1.name).toBe('API Drawer');
      expect(state.categories.cat1.name).toBe('Hardware');
      expect(state.drawers.drawer1.compartments.apiComp1.subCompartments[0].item?.label).toBe('Screws');
    });

    it('should handle empty room', () => {
      const apiRoom = {
        id: 'room1',
        name: 'Empty Room',
        drawers: [],
        categories: [],
      };

      useDrawerStore.getState().loadFromApi(apiRoom as any);

      const state = useDrawerStore.getState();
      expect(state.drawerOrder).toHaveLength(0);
      expect(Object.keys(state.categories)).toHaveLength(0);
    });
  });

  describe('search with category matching', () => {
    it('should match items by category name', () => {
      const drawer = createTestDrawer();
      drawer.compartments.comp1.subCompartments[0].item = {
        label: 'Item',
        categoryId: 'cat1',
      };

      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
        categories: { cat1: { id: 'cat1', name: 'Electronics', colorIndex: 0 } },
      });

      useDrawerStore.getState().setSearchQuery('electr');

      expect(useDrawerStore.getState().searchMatchIds.has('comp1')).toBe(true);
    });
  });

  describe('clearSelection with panel state', () => {
    it('should restore panel visibility if it was visible before edit and in edit mode', () => {
      useDrawerStore.setState({
        selectedCompartmentIds: new Set(['comp1']),
        panelWasVisibleBeforeEdit: true,
        panelMode: 'edit',
        isPanelVisible: false,
      });

      useDrawerStore.getState().clearSelection();

      expect(useDrawerStore.getState().isPanelVisible).toBe(true);
      expect(useDrawerStore.getState().panelMode).toBe('inventory');
    });

    it('should collapse panel if it wasnt visible before edit and in edit mode', () => {
      useDrawerStore.setState({
        selectedCompartmentIds: new Set(['comp1']),
        panelWasVisibleBeforeEdit: false,
        panelMode: 'edit',
        panelSnapPoint: 'half',
      });

      useDrawerStore.getState().clearSelection();

      expect(useDrawerStore.getState().panelSnapPoint).toBe('collapsed');
      expect(useDrawerStore.getState().isPanelVisible).toBe(false);
      // panelMode stays 'edit' when closing - mode swap happens when reopening
      expect(useDrawerStore.getState().panelMode).toBe('edit');
    });

    it('should not change panel state when not in edit mode', () => {
      useDrawerStore.setState({
        selectedCompartmentIds: new Set(['comp1']),
        panelWasVisibleBeforeEdit: true,
        panelMode: 'inventory',
        isPanelVisible: false,
      });

      useDrawerStore.getState().clearSelection();

      // Panel should remain hidden since we weren't in edit mode
      expect(useDrawerStore.getState().isPanelVisible).toBe(false);
    });

    it('should reset panelWasVisibleBeforeEdit after restoring panel state', () => {
      useDrawerStore.setState({
        selectedCompartmentIds: new Set(['comp1']),
        panelWasVisibleBeforeEdit: true,
        panelMode: 'edit',
      });

      useDrawerStore.getState().clearSelection();

      // Flag should be reset to prevent stale state
      expect(useDrawerStore.getState().panelWasVisibleBeforeEdit).toBe(false);
    });
  });

  describe('selectCompartment with panel reset', () => {
    it('should reset panel mode when collapsed and in edit mode', () => {
      const drawer = createTestDrawer();
      useDrawerStore.setState({
        drawers: { drawer1: drawer },
        activeDrawerId: 'drawer1',
        panelSnapPoint: 'collapsed',
        panelMode: 'edit',
      });

      useDrawerStore.getState().selectCompartment('comp1');

      expect(useDrawerStore.getState().panelMode).toBe('inventory');
    });
  });
});
