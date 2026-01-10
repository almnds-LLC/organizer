import type { Drawer, StoredItem, Category } from '../types/drawer.js';

export interface InventoryItem {
  id: string;
  drawerId: string;
  drawerName: string;
  compartmentId: string;
  subCompartmentId: string;
  location: string;
  item: StoredItem;
  categoryId: string | null;
}

function getLocationString(row: number, col: number): string {
  const colLetter = String.fromCharCode(65 + col);
  return `${colLetter}${row + 1}`;
}

export function aggregateInventory(
  drawers: Record<string, Drawer>,
  drawerOrder: string[]
): InventoryItem[] {
  const items: InventoryItem[] = [];

  for (const drawerId of drawerOrder) {
    const drawer = drawers[drawerId];
    if (!drawer) continue;

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

  const uncategorized = groups.get(null);
  if (uncategorized) {
    sortedGroups.set(null, uncategorized);
  }

  return sortedGroups;
}

export function groupByDrawer(
  items: InventoryItem[],
  drawers: Record<string, Drawer>,
  drawerOrder: string[]
): Map<string, { drawer: Drawer; items: InventoryItem[] }> {
  const groups = new Map<string, { drawer: Drawer; items: InventoryItem[] }>();

  for (const drawerId of drawerOrder) {
    const drawer = drawers[drawerId];
    if (drawer) {
      groups.set(drawerId, { drawer, items: [] });
    }
  }

  for (const item of items) {
    groups.get(item.drawerId)?.items.push(item);
  }

  for (const [id, group] of groups) {
    if (group.items.length === 0) {
      groups.delete(id);
    }
  }

  return groups;
}
