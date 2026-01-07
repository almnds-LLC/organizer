import type { Compartment } from '../types/drawer';

interface GridCell {
  row: number;
  col: number;
}

interface BoundingBox {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

/**
 * Check if two compartments overlap in the grid.
 */
export function compartmentsOverlap(a: Compartment, b: Compartment): boolean {
  const aRowEnd = a.row + (a.rowSpan ?? 1) - 1;
  const aColEnd = a.col + (a.colSpan ?? 1) - 1;
  const bRowEnd = b.row + (b.rowSpan ?? 1) - 1;
  const bColEnd = b.col + (b.colSpan ?? 1) - 1;

  return !(
    aRowEnd < b.row ||
    a.row > bRowEnd ||
    aColEnd < b.col ||
    a.col > bColEnd
  );
}

/**
 * Get all grid cells occupied by a compartment.
 */
export function getOccupiedCells(compartment: Compartment): GridCell[] {
  const cells: GridCell[] = [];
  const rowSpan = compartment.rowSpan ?? 1;
  const colSpan = compartment.colSpan ?? 1;

  for (let r = 0; r < rowSpan; r++) {
    for (let c = 0; c < colSpan; c++) {
      cells.push({ row: compartment.row + r, col: compartment.col + c });
    }
  }
  return cells;
}

/**
 * Check if a set of cells forms a valid rectangle.
 */
export function isValidRectangle(cells: GridCell[]): boolean {
  if (cells.length === 0) return false;
  if (cells.length === 1) return true;

  const bbox = getBoundingBox(cells);
  const expectedCount = (bbox.maxRow - bbox.minRow + 1) * (bbox.maxCol - bbox.minCol + 1);

  if (cells.length !== expectedCount) return false;

  // Verify all expected cells are present
  const cellSet = new Set(cells.map(c => `${c.row},${c.col}`));
  for (let r = bbox.minRow; r <= bbox.maxRow; r++) {
    for (let c = bbox.minCol; c <= bbox.maxCol; c++) {
      if (!cellSet.has(`${r},${c}`)) return false;
    }
  }

  return true;
}

/**
 * Get the bounding box of a set of cells.
 */
export function getBoundingBox(cells: GridCell[]): BoundingBox {
  if (cells.length === 0) {
    return { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 };
  }

  let minRow = cells[0].row;
  let maxRow = cells[0].row;
  let minCol = cells[0].col;
  let maxCol = cells[0].col;

  for (const cell of cells) {
    minRow = Math.min(minRow, cell.row);
    maxRow = Math.max(maxRow, cell.row);
    minCol = Math.min(minCol, cell.col);
    maxCol = Math.max(maxCol, cell.col);
  }

  return { minRow, maxRow, minCol, maxCol };
}

/**
 * Check if selected compartments can be merged.
 * All occupied cells must form a valid rectangle with no gaps.
 */
export function canMergeCompartments(
  compartments: Record<string, Compartment>,
  selectedIds: Set<string>
): { valid: boolean; error?: string } {
  if (selectedIds.size < 2) {
    return { valid: false, error: 'Select at least 2 compartments to merge' };
  }

  const selected = Array.from(selectedIds)
    .map(id => compartments[id])
    .filter((c): c is Compartment => c !== undefined);

  if (selected.length !== selectedIds.size) {
    return { valid: false, error: 'Some selected compartments not found' };
  }

  // Get all cells occupied by all selected compartments
  const allCells: GridCell[] = [];
  for (const comp of selected) {
    allCells.push(...getOccupiedCells(comp));
  }

  // Check they form a rectangle
  if (!isValidRectangle(allCells)) {
    return { valid: false, error: 'Selection must form a rectangle' };
  }

  return { valid: true };
}

/**
 * Check if a compartment can be split (has spans > 1).
 */
export function canSplitCompartment(compartment: Compartment): boolean {
  return (compartment.rowSpan ?? 1) > 1 || (compartment.colSpan ?? 1) > 1;
}

/**
 * Get the merged compartment result from a set of compartments.
 * Returns the bounding box and anchor compartment (top-left).
 */
export function getMergeResult(
  compartments: Record<string, Compartment>,
  selectedIds: Set<string>
): { anchorId: string; rowSpan: number; colSpan: number } | null {
  const selected = Array.from(selectedIds)
    .map(id => compartments[id])
    .filter((c): c is Compartment => c !== undefined);

  if (selected.length < 2) return null;

  // Get all cells occupied by all selected compartments
  const allCells: GridCell[] = [];
  for (const comp of selected) {
    allCells.push(...getOccupiedCells(comp));
  }

  if (!isValidRectangle(allCells)) return null;

  const bbox = getBoundingBox(allCells);

  // Find the anchor (top-left) compartment
  const anchor = selected.find(c => c.row === bbox.minRow && c.col === bbox.minCol);
  if (!anchor) return null;

  return {
    anchorId: anchor.id,
    rowSpan: bbox.maxRow - bbox.minRow + 1,
    colSpan: bbox.maxCol - bbox.minCol + 1,
  };
}

/**
 * Get all compartments that would be affected by a merge (excluding anchor).
 */
export function getDeletedCompartmentIds(
  compartments: Record<string, Compartment>,
  selectedIds: Set<string>
): string[] {
  const result = getMergeResult(compartments, selectedIds);
  if (!result) return [];

  return Array.from(selectedIds).filter(id => id !== result.anchorId);
}
