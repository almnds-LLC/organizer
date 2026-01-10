import type { Compartment } from '../types/drawer.js';

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

function isValidRectangle(cells: GridCell[]): boolean {
  if (cells.length === 0) return false;
  if (cells.length === 1) return true;

  const bbox = getBoundingBox(cells);
  const expectedCount = (bbox.maxRow - bbox.minRow + 1) * (bbox.maxCol - bbox.minCol + 1);

  if (cells.length !== expectedCount) return false;

  const cellSet = new Set(cells.map(c => `${c.row},${c.col}`));
  for (let r = bbox.minRow; r <= bbox.maxRow; r++) {
    for (let c = bbox.minCol; c <= bbox.maxCol; c++) {
      if (!cellSet.has(`${r},${c}`)) return false;
    }
  }

  return true;
}

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

  const allCells = selected.flatMap(getOccupiedCells);

  if (!isValidRectangle(allCells)) {
    return { valid: false, error: 'Selection must form a rectangle' };
  }

  return { valid: true };
}

export function canSplitCompartment(compartment: Compartment): boolean {
  return (compartment.rowSpan ?? 1) > 1 || (compartment.colSpan ?? 1) > 1;
}
