export interface Category {
  id: string;
  name: string;
  colorIndex?: number;
  color?: string;
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
  dividerOrientation: 'horizontal' | 'vertical';
  subCompartments: SubCompartment[];
}

export interface Drawer {
  id: string;
  name: string;
  rows: number;
  cols: number;
  compartments: Record<string, Compartment>;
  gridX: number;
  gridY: number;
}

export type EditMode = 'view' | 'single' | 'mass';

export interface CreateDrawerOptions {
  name: string;
  rows?: number;
  cols?: number;
  defaultDividerCount?: number;
}
