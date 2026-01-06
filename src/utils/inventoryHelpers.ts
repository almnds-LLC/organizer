import type { Drawer, StoredItem, Category } from '../types/drawer';

/**
 * Represents a single item in the aggregated inventory view
 */
export interface InventoryItem {
  /** Unique ID: `${drawerId}-${compartmentId}-${subId}` */
  id: string;
  drawerId: string;
  drawerName: string;
  compartmentId: string;
  subCompartmentId: string;
  /** Human-readable location like "A1", "B3" */
  location: string;
  item: StoredItem;
  categoryId: string | null;
}

/**
 * Convert row/col to human-readable location (A1, B2, etc.)
 */
export function getLocationString(row: number, col: number): string {
  const colLetter = String.fromCharCode(65 + col); // A, B, C...
  const rowNumber = row + 1; // 1-indexed for display
  return `${colLetter}${rowNumber}`;
}

/**
 * Aggregate all items across all drawers into a flat list
 */
export function aggregateInventory(
  drawers: Record<string, Drawer>,
  drawerOrder: string[]
): InventoryItem[] {
  const items: InventoryItem[] = [];

  // Iterate in drawer order for consistent display
  for (const drawerId of drawerOrder) {
    const drawer = drawers[drawerId];
    if (!drawer) continue;

    // Sort compartments by position (top-left to bottom-right)
    const sortedCompartments = Object.values(drawer.compartments).sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });

    for (const compartment of sortedCompartments) {
      for (const sub of compartment.subCompartments) {
        if (sub.item) {
          items.push({
            id: `${drawerId}-${compartment.id}-${sub.id}`,
            drawerId,
            drawerName: drawer.name,
            compartmentId: compartment.id,
            subCompartmentId: sub.id,
            location: getLocationString(compartment.row, compartment.col),
            item: sub.item,
            categoryId: sub.item.categoryId || null,
          });
        }
      }
    }
  }

  return items;
}

/**
 * Group items by category
 * Returns a Map with category ID as key (or 'uncategorized' for items without category)
 */
export function groupByCategory(
  items: InventoryItem[],
  categories: Record<string, Category>
): Map<string | null, { category: Category | null; items: InventoryItem[] }> {
  const groups = new Map<string | null, { category: Category | null; items: InventoryItem[] }>();

  for (const item of items) {
    const categoryId = item.categoryId;

    if (!groups.has(categoryId)) {
      groups.set(categoryId, {
        category: categoryId ? categories[categoryId] || null : null,
        items: [],
      });
    }

    groups.get(categoryId)!.items.push(item);
  }

  // Sort groups: categories first (alphabetically), then uncategorized last
  const sortedGroups = new Map<string | null, { category: Category | null; items: InventoryItem[] }>();

  const categoryEntries = Array.from(groups.entries())
    .filter(([id]) => id !== null)
    .sort(([, a], [, b]) => {
      const nameA = a.category?.name || '';
      const nameB = b.category?.name || '';
      return nameA.localeCompare(nameB);
    });

  for (const [id, group] of categoryEntries) {
    sortedGroups.set(id, group);
  }

  // Add uncategorized last if it exists
  const uncategorized = groups.get(null);
  if (uncategorized) {
    sortedGroups.set(null, uncategorized);
  }

  return sortedGroups;
}

/**
 * Group items by drawer
 */
export function groupByDrawer(
  items: InventoryItem[],
  drawers: Record<string, Drawer>,
  drawerOrder: string[]
): Map<string, { drawer: Drawer; items: InventoryItem[] }> {
  const groups = new Map<string, { drawer: Drawer; items: InventoryItem[] }>();

  // Initialize in drawer order
  for (const drawerId of drawerOrder) {
    const drawer = drawers[drawerId];
    if (drawer) {
      groups.set(drawerId, { drawer, items: [] });
    }
  }

  // Add items to their groups
  for (const item of items) {
    const group = groups.get(item.drawerId);
    if (group) {
      group.items.push(item);
    }
  }

  // Remove empty groups
  for (const [id, group] of groups) {
    if (group.items.length === 0) {
      groups.delete(id);
    }
  }

  return groups;
}

/**
 * Get total item count across all drawers
 */
export function getTotalItemCount(drawers: Record<string, Drawer>): number {
  let count = 0;
  for (const drawer of Object.values(drawers)) {
    for (const compartment of Object.values(drawer.compartments)) {
      for (const sub of compartment.subCompartments) {
        if (sub.item) count++;
      }
    }
  }
  return count;
}
