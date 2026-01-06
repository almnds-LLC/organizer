import { describe, it, expect } from 'vitest';
import {
  getLocationString,
  aggregateInventory,
  groupByCategory,
  groupByDrawer,
  getTotalItemCount,
} from '../../utils/inventoryHelpers';
import type { Drawer, Category } from '../../types/drawer';

function createTestDrawer(id: string, name: string, items: Array<{ row: number; col: number; label: string; categoryId?: string }>): Drawer {
  const compartments: Drawer['compartments'] = {};

  items.forEach((item, idx) => {
    const compId = `comp-${idx}`;
    const subId = `sub-${idx}`;
    compartments[compId] = {
      id: compId,
      row: item.row,
      col: item.col,
      dividerOrientation: 'horizontal',
      subCompartments: [
        {
          id: subId,
          relativeSize: 1,
          item: {
            label: item.label,
            categoryId: item.categoryId,
          },
        },
      ],
    };
  });

  return {
    id,
    name,
    rows: 2,
    cols: 2,
    compartments,
    gridX: 0,
    gridY: 0,
  };
}

describe('inventoryHelpers', () => {
  describe('getLocationString', () => {
    it('should convert row/col to location string', () => {
      expect(getLocationString(0, 0)).toBe('A1');
      expect(getLocationString(0, 1)).toBe('B1');
      expect(getLocationString(1, 0)).toBe('A2');
      expect(getLocationString(2, 2)).toBe('C3');
    });

    it('should handle larger columns', () => {
      expect(getLocationString(0, 25)).toBe('Z1');
    });
  });

  describe('aggregateInventory', () => {
    it('should return empty array for no drawers', () => {
      expect(aggregateInventory({}, [])).toEqual([]);
    });

    it('should aggregate items from single drawer', () => {
      const drawer = createTestDrawer('d1', 'Drawer 1', [
        { row: 0, col: 0, label: 'Screws' },
        { row: 0, col: 1, label: 'Nails' },
      ]);

      const result = aggregateInventory({ d1: drawer }, ['d1']);

      expect(result).toHaveLength(2);
      expect(result[0].item.label).toBe('Screws');
      expect(result[0].drawerName).toBe('Drawer 1');
      expect(result[1].item.label).toBe('Nails');
    });

    it('should aggregate items from multiple drawers in order', () => {
      const drawer1 = createTestDrawer('d1', 'First', [{ row: 0, col: 0, label: 'A' }]);
      const drawer2 = createTestDrawer('d2', 'Second', [{ row: 0, col: 0, label: 'B' }]);

      const result = aggregateInventory({ d1: drawer1, d2: drawer2 }, ['d2', 'd1']);

      expect(result[0].drawerName).toBe('Second');
      expect(result[1].drawerName).toBe('First');
    });

    it('should skip empty compartments', () => {
      const drawer: Drawer = {
        id: 'd1',
        name: 'Test',
        rows: 1,
        cols: 1,
        compartments: {
          c1: {
            id: 'c1',
            row: 0,
            col: 0,
            dividerOrientation: 'horizontal',
            subCompartments: [{ id: 's1', relativeSize: 1, item: null }],
          },
        },
        gridX: 0,
        gridY: 0,
      };

      const result = aggregateInventory({ d1: drawer }, ['d1']);
      expect(result).toHaveLength(0);
    });

    it('should include location string', () => {
      const drawer = createTestDrawer('d1', 'Test', [
        { row: 1, col: 2, label: 'Item' },
      ]);

      const result = aggregateInventory({ d1: drawer }, ['d1']);
      expect(result[0].location).toBe('C2');
    });
  });

  describe('groupByCategory', () => {
    it('should group items by category', () => {
      const categories: Record<string, Category> = {
        cat1: { id: 'cat1', name: 'Hardware', colorIndex: 0 },
        cat2: { id: 'cat2', name: 'Electronics', colorIndex: 1 },
      };

      const drawer = createTestDrawer('d1', 'Test', [
        { row: 0, col: 0, label: 'Screws', categoryId: 'cat1' },
        { row: 0, col: 1, label: 'Nails', categoryId: 'cat1' },
        { row: 1, col: 0, label: 'LEDs', categoryId: 'cat2' },
      ]);

      const items = aggregateInventory({ d1: drawer }, ['d1']);
      const groups = groupByCategory(items, categories);

      expect(groups.size).toBe(2);
      expect(groups.get('cat1')?.items).toHaveLength(2);
      expect(groups.get('cat2')?.items).toHaveLength(1);
    });

    it('should handle uncategorized items', () => {
      const drawer = createTestDrawer('d1', 'Test', [
        { row: 0, col: 0, label: 'Random' },
      ]);

      const items = aggregateInventory({ d1: drawer }, ['d1']);
      const groups = groupByCategory(items, {});

      expect(groups.get(null)?.items).toHaveLength(1);
    });

    it('should sort categories alphabetically with uncategorized last', () => {
      const categories: Record<string, Category> = {
        cat1: { id: 'cat1', name: 'Zebra', colorIndex: 0 },
        cat2: { id: 'cat2', name: 'Apple', colorIndex: 1 },
      };

      const drawer = createTestDrawer('d1', 'Test', [
        { row: 0, col: 0, label: 'A', categoryId: 'cat2' },
        { row: 0, col: 1, label: 'Z', categoryId: 'cat1' },
        { row: 1, col: 0, label: 'None' },
      ]);

      const items = aggregateInventory({ d1: drawer }, ['d1']);
      const groups = groupByCategory(items, categories);
      const keys = Array.from(groups.keys());

      expect(keys[0]).toBe('cat2'); // Apple
      expect(keys[1]).toBe('cat1'); // Zebra
      expect(keys[2]).toBeNull(); // Uncategorized
    });
  });

  describe('groupByDrawer', () => {
    it('should group items by drawer', () => {
      const drawer1 = createTestDrawer('d1', 'First', [
        { row: 0, col: 0, label: 'A' },
      ]);
      const drawer2 = createTestDrawer('d2', 'Second', [
        { row: 0, col: 0, label: 'B' },
        { row: 0, col: 1, label: 'C' },
      ]);

      const drawers = { d1: drawer1, d2: drawer2 };
      const items = aggregateInventory(drawers, ['d1', 'd2']);
      const groups = groupByDrawer(items, drawers, ['d1', 'd2']);

      expect(groups.get('d1')?.items).toHaveLength(1);
      expect(groups.get('d2')?.items).toHaveLength(2);
    });

    it('should remove empty drawers from groups', () => {
      const drawer1 = createTestDrawer('d1', 'First', [
        { row: 0, col: 0, label: 'A' },
      ]);
      const drawer2: Drawer = {
        id: 'd2',
        name: 'Empty',
        rows: 1,
        cols: 1,
        compartments: {},
        gridX: 0,
        gridY: 0,
      };

      const drawers = { d1: drawer1, d2: drawer2 };
      const items = aggregateInventory(drawers, ['d1', 'd2']);
      const groups = groupByDrawer(items, drawers, ['d1', 'd2']);

      expect(groups.has('d1')).toBe(true);
      expect(groups.has('d2')).toBe(false);
    });
  });

  describe('getTotalItemCount', () => {
    it('should return 0 for empty drawers', () => {
      expect(getTotalItemCount({})).toBe(0);
    });

    it('should count all items across drawers', () => {
      const drawer1 = createTestDrawer('d1', 'First', [
        { row: 0, col: 0, label: 'A' },
        { row: 0, col: 1, label: 'B' },
      ]);
      const drawer2 = createTestDrawer('d2', 'Second', [
        { row: 0, col: 0, label: 'C' },
      ]);

      expect(getTotalItemCount({ d1: drawer1, d2: drawer2 })).toBe(3);
    });

    it('should not count empty compartments', () => {
      const drawer: Drawer = {
        id: 'd1',
        name: 'Test',
        rows: 1,
        cols: 2,
        compartments: {
          c1: {
            id: 'c1',
            row: 0,
            col: 0,
            dividerOrientation: 'horizontal',
            subCompartments: [
              { id: 's1', relativeSize: 1, item: { label: 'Item' } },
            ],
          },
          c2: {
            id: 'c2',
            row: 0,
            col: 1,
            dividerOrientation: 'horizontal',
            subCompartments: [
              { id: 's2', relativeSize: 1, item: null },
            ],
          },
        },
        gridX: 0,
        gridY: 0,
      };

      expect(getTotalItemCount({ d1: drawer })).toBe(1);
    });
  });
});
