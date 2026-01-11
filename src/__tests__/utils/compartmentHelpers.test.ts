import { describe, it, expect } from 'vitest';
import {
  getOccupiedCells,
  getBoundingBox,
  canMergeCompartments,
  canSplitCompartment,
} from '../../utils/compartmentHelpers';
import type { Compartment } from '../../types/drawer';

function createCompartment(overrides: Partial<Compartment> = {}): Compartment {
  return {
    id: 'comp1',
    row: 0,
    col: 0,
    rowSpan: 1,
    colSpan: 1,
    dividerOrientation: 'horizontal',
    subCompartments: [],
    ...overrides,
  };
}

describe('compartmentHelpers', () => {
  describe('getOccupiedCells', () => {
    it('should return single cell for 1x1 compartment', () => {
      const comp = createCompartment({ row: 2, col: 3 });
      const cells = getOccupiedCells(comp);

      expect(cells).toHaveLength(1);
      expect(cells[0]).toEqual({ row: 2, col: 3 });
    });

    it('should return all cells for multi-row compartment', () => {
      const comp = createCompartment({ row: 0, col: 0, rowSpan: 3, colSpan: 1 });
      const cells = getOccupiedCells(comp);

      expect(cells).toHaveLength(3);
      expect(cells).toContainEqual({ row: 0, col: 0 });
      expect(cells).toContainEqual({ row: 1, col: 0 });
      expect(cells).toContainEqual({ row: 2, col: 0 });
    });

    it('should return all cells for multi-col compartment', () => {
      const comp = createCompartment({ row: 0, col: 0, rowSpan: 1, colSpan: 3 });
      const cells = getOccupiedCells(comp);

      expect(cells).toHaveLength(3);
      expect(cells).toContainEqual({ row: 0, col: 0 });
      expect(cells).toContainEqual({ row: 0, col: 1 });
      expect(cells).toContainEqual({ row: 0, col: 2 });
    });

    it('should return all cells for 2x2 compartment', () => {
      const comp = createCompartment({ row: 1, col: 1, rowSpan: 2, colSpan: 2 });
      const cells = getOccupiedCells(comp);

      expect(cells).toHaveLength(4);
      expect(cells).toContainEqual({ row: 1, col: 1 });
      expect(cells).toContainEqual({ row: 1, col: 2 });
      expect(cells).toContainEqual({ row: 2, col: 1 });
      expect(cells).toContainEqual({ row: 2, col: 2 });
    });

    it('should handle undefined rowSpan/colSpan as 1', () => {
      const comp = {
        id: 'comp1',
        row: 0,
        col: 0,
        dividerOrientation: 'horizontal',
        subCompartments: [],
      } as unknown as Compartment;
      const cells = getOccupiedCells(comp);

      expect(cells).toHaveLength(1);
      expect(cells[0]).toEqual({ row: 0, col: 0 });
    });
  });

  describe('getBoundingBox', () => {
    it('should return zeros for empty array', () => {
      const bbox = getBoundingBox([]);
      expect(bbox).toEqual({ minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 });
    });

    it('should return same values for single cell', () => {
      const bbox = getBoundingBox([{ row: 2, col: 3 }]);
      expect(bbox).toEqual({ minRow: 2, maxRow: 2, minCol: 3, maxCol: 3 });
    });

    it('should calculate bounding box for multiple cells', () => {
      const cells = [
        { row: 1, col: 2 },
        { row: 3, col: 1 },
        { row: 2, col: 4 },
      ];
      const bbox = getBoundingBox(cells);
      expect(bbox).toEqual({ minRow: 1, maxRow: 3, minCol: 1, maxCol: 4 });
    });
  });

  describe('canMergeCompartments', () => {
    it('should reject fewer than 2 compartments', () => {
      const compartments = { comp1: createCompartment({ id: 'comp1' }) };
      const result = canMergeCompartments(compartments, new Set(['comp1']));

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Select at least 2 compartments to merge');
    });

    it('should reject empty selection', () => {
      const result = canMergeCompartments({}, new Set());

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Select at least 2 compartments to merge');
    });

    it('should reject if compartment not found', () => {
      const compartments = { comp1: createCompartment({ id: 'comp1' }) };
      const result = canMergeCompartments(compartments, new Set(['comp1', 'comp2']));

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Some selected compartments not found');
    });

    it('should allow merging adjacent horizontal compartments', () => {
      const compartments = {
        comp1: createCompartment({ id: 'comp1', row: 0, col: 0 }),
        comp2: createCompartment({ id: 'comp2', row: 0, col: 1 }),
      };
      const result = canMergeCompartments(compartments, new Set(['comp1', 'comp2']));

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should allow merging adjacent vertical compartments', () => {
      const compartments = {
        comp1: createCompartment({ id: 'comp1', row: 0, col: 0 }),
        comp2: createCompartment({ id: 'comp2', row: 1, col: 0 }),
      };
      const result = canMergeCompartments(compartments, new Set(['comp1', 'comp2']));

      expect(result.valid).toBe(true);
    });

    it('should allow merging 2x2 grid of compartments', () => {
      const compartments = {
        comp1: createCompartment({ id: 'comp1', row: 0, col: 0 }),
        comp2: createCompartment({ id: 'comp2', row: 0, col: 1 }),
        comp3: createCompartment({ id: 'comp3', row: 1, col: 0 }),
        comp4: createCompartment({ id: 'comp4', row: 1, col: 1 }),
      };
      const result = canMergeCompartments(
        compartments,
        new Set(['comp1', 'comp2', 'comp3', 'comp4'])
      );

      expect(result.valid).toBe(true);
    });

    it('should reject non-adjacent compartments', () => {
      const compartments = {
        comp1: createCompartment({ id: 'comp1', row: 0, col: 0 }),
        comp2: createCompartment({ id: 'comp2', row: 0, col: 2 }),
      };
      const result = canMergeCompartments(compartments, new Set(['comp1', 'comp2']));

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Selection must form a rectangle');
    });

    it('should reject L-shaped selection', () => {
      const compartments = {
        comp1: createCompartment({ id: 'comp1', row: 0, col: 0 }),
        comp2: createCompartment({ id: 'comp2', row: 0, col: 1 }),
        comp3: createCompartment({ id: 'comp3', row: 1, col: 0 }),
      };
      const result = canMergeCompartments(
        compartments,
        new Set(['comp1', 'comp2', 'comp3'])
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Selection must form a rectangle');
    });

    it('should handle merging with already-merged compartments', () => {
      const compartments = {
        comp1: createCompartment({ id: 'comp1', row: 0, col: 0, rowSpan: 2, colSpan: 1 }),
        comp2: createCompartment({ id: 'comp2', row: 0, col: 1, rowSpan: 2, colSpan: 1 }),
      };
      const result = canMergeCompartments(compartments, new Set(['comp1', 'comp2']));

      expect(result.valid).toBe(true);
    });
  });

  describe('canSplitCompartment', () => {
    it('should return false for 1x1 compartment', () => {
      const comp = createCompartment({ rowSpan: 1, colSpan: 1 });
      expect(canSplitCompartment(comp)).toBe(false);
    });

    it('should return true for multi-row compartment', () => {
      const comp = createCompartment({ rowSpan: 2, colSpan: 1 });
      expect(canSplitCompartment(comp)).toBe(true);
    });

    it('should return true for multi-col compartment', () => {
      const comp = createCompartment({ rowSpan: 1, colSpan: 2 });
      expect(canSplitCompartment(comp)).toBe(true);
    });

    it('should return true for 2x2 compartment', () => {
      const comp = createCompartment({ rowSpan: 2, colSpan: 2 });
      expect(canSplitCompartment(comp)).toBe(true);
    });

    it('should handle undefined spans as 1', () => {
      const comp = {
        id: 'comp1',
        row: 0,
        col: 0,
        dividerOrientation: 'horizontal',
        subCompartments: [],
      } as unknown as Compartment;
      expect(canSplitCompartment(comp)).toBe(false);
    });
  });
});
