export interface Category {
  id: string;
  name: string;
  colorIndex?: number;
  color?: string;
  displayOrder?: number;
}

export interface StoredItem {
  label: string;
  categoryId?: string;
  quantity?: number;
}

export interface SubCompartment {
  id: string;
  relativeSize: number;
  item: StoredItem | null;
}

export interface Compartment {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  dividerOrientation: 'horizontal' | 'vertical';
  subCompartments: SubCompartment[];
}

export interface Drawer {
  id: string;
  name: string;
  rows: number;
  cols: number;
  compartmentWidth?: number;  // Grid units (1, 2, 3, etc.) - defaults to 1
  compartmentHeight?: number; // Grid units (1, 2, 3, etc.) - defaults to 1
  compartments: Record<string, Compartment>;
  gridX: number;
  gridY: number;
  updatedAt?: number;
}

export type EditMode = 'view' | 'single' | 'mass';

export interface CreateDrawerOptions {
  name: string;
  rows?: number;
  cols?: number;
  defaultDividerCount?: number;
  compartmentWidth?: number;
  compartmentHeight?: number;
}
