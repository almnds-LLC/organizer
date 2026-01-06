import type {
  Drawer,
  Compartment,
  SubCompartment,
  DrawerWithCompartments,
  CompartmentWithSubs,
  CreateDrawerInput,
  UpdateDrawerInput,
  UpdateCompartmentInput,
  UpdateSubCompartmentInput,
  DividerOrientation,
} from '../types';
import type { IDrawerRepository, ICompartmentRepository, ISubCompartmentRepository } from '../interfaces';
import { generateId } from '../../lib/id';
import { NotFoundError } from '../../lib/errors';

const DEFAULT_ROWS = 2;
const DEFAULT_COLS = 2;
const DEFAULT_DIVIDER_COUNT = 1;

export class DrawerRepository implements IDrawerRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<Drawer | null> {
    const row = await this.db
      .prepare('SELECT * FROM drawers WHERE id = ?')
      .bind(id)
      .first<DrawerRow>();
    return row ? mapRowToDrawer(row) : null;
  }

  async findByRoom(roomId: string): Promise<Drawer[]> {
    const rows = await this.db
      .prepare('SELECT * FROM drawers WHERE room_id = ? ORDER BY display_order, name')
      .bind(roomId)
      .all<DrawerRow>();
    return rows.results.map(mapRowToDrawer);
  }

  async findByIdWithCompartments(id: string): Promise<DrawerWithCompartments | null> {
    const drawer = await this.findById(id);
    if (!drawer) return null;

    const compartmentRows = await this.db
      .prepare('SELECT * FROM compartments WHERE drawer_id = ? ORDER BY row, col')
      .bind(id)
      .all<CompartmentRow>();

    const compartmentIds = compartmentRows.results.map((c) => c.id);
    let subCompartmentRows: SubCompartmentRow[] = [];

    if (compartmentIds.length > 0) {
      const placeholders = compartmentIds.map(() => '?').join(',');
      const result = await this.db
        .prepare(
          `SELECT * FROM sub_compartments WHERE compartment_id IN (${placeholders}) ORDER BY display_order`
        )
        .bind(...compartmentIds)
        .all<SubCompartmentRow>();
      subCompartmentRows = result.results;
    }

    // Group sub-compartments by compartment
    const subsByCompartment = new Map<string, SubCompartment[]>();
    for (const row of subCompartmentRows) {
      const sub = mapRowToSubCompartment(row);
      const existing = subsByCompartment.get(sub.compartmentId) ?? [];
      existing.push(sub);
      subsByCompartment.set(sub.compartmentId, existing);
    }

    // Build compartments record
    const compartments: Record<string, CompartmentWithSubs> = {};
    for (const row of compartmentRows.results) {
      const comp = mapRowToCompartment(row);
      compartments[comp.id] = {
        ...comp,
        subCompartments: subsByCompartment.get(comp.id) ?? [],
      };
    }

    return { ...drawer, compartments };
  }

  async create(roomId: string, input: CreateDrawerInput): Promise<DrawerWithCompartments> {
    const id = generateId();
    const now = new Date().toISOString();
    const rows = input.rows ?? DEFAULT_ROWS;
    const cols = input.cols ?? DEFAULT_COLS;

    // Get next display order
    const maxOrder = await this.db
      .prepare('SELECT MAX(display_order) as max_order FROM drawers WHERE room_id = ?')
      .bind(roomId)
      .first<{ max_order: number | null }>();
    const displayOrder = (maxOrder?.max_order ?? -1) + 1;

    // Create drawer
    await this.db
      .prepare(
        `INSERT INTO drawers (id, room_id, name, rows, cols, grid_x, grid_y, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        roomId,
        input.name,
        rows,
        cols,
        input.gridX ?? 0,
        input.gridY ?? 0,
        displayOrder,
        now,
        now
      )
      .run();

    // Create compartments and sub-compartments
    const compartments: Record<string, CompartmentWithSubs> = {};
    const statements: D1PreparedStatement[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const compId = generateId();
        statements.push(
          this.db
            .prepare(
              `INSERT INTO compartments (id, drawer_id, row, col, row_span, col_span, divider_orientation, created_at, updated_at)
               VALUES (?, ?, ?, ?, 1, 1, 'horizontal', ?, ?)`
            )
            .bind(compId, id, row, col, now, now)
        );

        const subs: SubCompartment[] = [];
        const subCount = DEFAULT_DIVIDER_COUNT + 1;
        const relativeSize = 1 / subCount;

        for (let i = 0; i < subCount; i++) {
          const subId = generateId();
          statements.push(
            this.db
              .prepare(
                `INSERT INTO sub_compartments (id, compartment_id, display_order, relative_size, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`
              )
              .bind(subId, compId, i, relativeSize, now, now)
          );
          subs.push({
            id: subId,
            compartmentId: compId,
            displayOrder: i,
            relativeSize,
            itemLabel: null,
            itemCategoryId: null,
            itemQuantity: null,
            createdAt: now,
            updatedAt: now,
          });
        }

        compartments[compId] = {
          id: compId,
          drawerId: id,
          row,
          col,
          rowSpan: 1,
          colSpan: 1,
          dividerOrientation: 'horizontal',
          createdAt: now,
          updatedAt: now,
          subCompartments: subs,
        };
      }
    }

    await this.db.batch(statements);

    return {
      id,
      roomId,
      name: input.name,
      rows,
      cols,
      gridX: input.gridX ?? 0,
      gridY: input.gridY ?? 0,
      displayOrder,
      createdAt: now,
      updatedAt: now,
      compartments,
    };
  }

  async update(id: string, input: UpdateDrawerInput): Promise<Drawer> {
    const drawer = await this.findById(id);
    if (!drawer) throw new NotFoundError('Drawer not found');

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.gridX !== undefined) {
      updates.push('grid_x = ?');
      values.push(input.gridX);
    }
    if (input.gridY !== undefined) {
      updates.push('grid_y = ?');
      values.push(input.gridY);
    }

    // Handle resize (rows/cols) - this is complex, so we'll just update the values
    // and let the frontend handle the compartment management
    if (input.rows !== undefined) {
      updates.push('rows = ?');
      values.push(input.rows);
    }
    if (input.cols !== undefined) {
      updates.push('cols = ?');
      values.push(input.cols);
    }

    if (updates.length === 0) return drawer;

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db
      .prepare(`UPDATE drawers SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return {
      ...drawer,
      name: input.name ?? drawer.name,
      rows: input.rows ?? drawer.rows,
      cols: input.cols ?? drawer.cols,
      gridX: input.gridX ?? drawer.gridX,
      gridY: input.gridY ?? drawer.gridY,
      updatedAt: now,
    };
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM drawers WHERE id = ?').bind(id).run();
  }

  async reorder(roomId: string, drawerIds: string[]): Promise<void> {
    const statements = drawerIds.map((id, index) =>
      this.db
        .prepare('UPDATE drawers SET display_order = ? WHERE id = ? AND room_id = ?')
        .bind(index, id, roomId)
    );
    await this.db.batch(statements);
  }
}

export class CompartmentRepository implements ICompartmentRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<Compartment | null> {
    const row = await this.db
      .prepare('SELECT * FROM compartments WHERE id = ?')
      .bind(id)
      .first<CompartmentRow>();
    return row ? mapRowToCompartment(row) : null;
  }

  async update(id: string, input: UpdateCompartmentInput): Promise<Compartment> {
    const comp = await this.findById(id);
    if (!comp) throw new NotFoundError('Compartment not found');

    if (input.dividerOrientation === undefined) return comp;

    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE compartments SET divider_orientation = ?, updated_at = ? WHERE id = ?')
      .bind(input.dividerOrientation, now, id)
      .run();

    return {
      ...comp,
      dividerOrientation: input.dividerOrientation,
      updatedAt: now,
    };
  }

  async setDividerCount(compartmentId: string, count: number): Promise<SubCompartment[]> {
    const comp = await this.findById(compartmentId);
    if (!comp) throw new NotFoundError('Compartment not found');

    // Get existing sub-compartments
    const existingRows = await this.db
      .prepare('SELECT * FROM sub_compartments WHERE compartment_id = ? ORDER BY display_order')
      .bind(compartmentId)
      .all<SubCompartmentRow>();
    const existing = existingRows.results.map(mapRowToSubCompartment);

    const targetCount = count + 1;
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    const result: SubCompartment[] = [];

    if (existing.length === targetCount) {
      // Same count, just redistribute sizes
      const newSize = 1 / targetCount;
      for (const sub of existing) {
        statements.push(
          this.db
            .prepare('UPDATE sub_compartments SET relative_size = ?, updated_at = ? WHERE id = ?')
            .bind(newSize, now, sub.id)
        );
        result.push({ ...sub, relativeSize: newSize, updatedAt: now });
      }
    } else if (existing.length < targetCount) {
      // Need to add more
      const newSize = 1 / targetCount;
      for (const sub of existing) {
        statements.push(
          this.db
            .prepare('UPDATE sub_compartments SET relative_size = ?, updated_at = ? WHERE id = ?')
            .bind(newSize, now, sub.id)
        );
        result.push({ ...sub, relativeSize: newSize, updatedAt: now });
      }
      for (let i = existing.length; i < targetCount; i++) {
        const id = generateId();
        statements.push(
          this.db
            .prepare(
              `INSERT INTO sub_compartments (id, compartment_id, display_order, relative_size, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`
            )
            .bind(id, compartmentId, i, newSize, now, now)
        );
        result.push({
          id,
          compartmentId,
          displayOrder: i,
          relativeSize: newSize,
          itemLabel: null,
          itemCategoryId: null,
          itemQuantity: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else {
      // Need to remove some
      const newSize = 1 / targetCount;
      const toKeep = existing.slice(0, targetCount);
      const toRemove = existing.slice(targetCount);

      for (const sub of toKeep) {
        statements.push(
          this.db
            .prepare('UPDATE sub_compartments SET relative_size = ?, updated_at = ? WHERE id = ?')
            .bind(newSize, now, sub.id)
        );
        result.push({ ...sub, relativeSize: newSize, updatedAt: now });
      }
      for (const sub of toRemove) {
        statements.push(
          this.db.prepare('DELETE FROM sub_compartments WHERE id = ?').bind(sub.id)
        );
      }
    }

    if (statements.length > 0) {
      await this.db.batch(statements);
    }

    return result;
  }
}

export class SubCompartmentRepository implements ISubCompartmentRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<SubCompartment | null> {
    const row = await this.db
      .prepare('SELECT * FROM sub_compartments WHERE id = ?')
      .bind(id)
      .first<SubCompartmentRow>();
    return row ? mapRowToSubCompartment(row) : null;
  }

  async update(id: string, input: UpdateSubCompartmentInput): Promise<SubCompartment> {
    const sub = await this.findById(id);
    if (!sub) throw new NotFoundError('Sub-compartment not found');

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.relativeSize !== undefined) {
      updates.push('relative_size = ?');
      values.push(input.relativeSize);
    }
    if (input.itemLabel !== undefined) {
      updates.push('item_label = ?');
      values.push(input.itemLabel);
    }
    if (input.itemCategoryId !== undefined) {
      updates.push('item_category_id = ?');
      values.push(input.itemCategoryId);
    }
    if (input.itemQuantity !== undefined) {
      updates.push('item_quantity = ?');
      values.push(input.itemQuantity);
    }

    if (updates.length === 0) return sub;

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db
      .prepare(`UPDATE sub_compartments SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return {
      ...sub,
      relativeSize: input.relativeSize ?? sub.relativeSize,
      itemLabel: input.itemLabel !== undefined ? input.itemLabel : sub.itemLabel,
      itemCategoryId: input.itemCategoryId !== undefined ? input.itemCategoryId : sub.itemCategoryId,
      itemQuantity: input.itemQuantity !== undefined ? input.itemQuantity : sub.itemQuantity,
      updatedAt: now,
    };
  }

  async updateBatch(
    updates: { id: string; input: UpdateSubCompartmentInput }[]
  ): Promise<void> {
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];

    for (const { id, input } of updates) {
      const updateClauses: string[] = [];
      const values: (string | number | null)[] = [];

      if (input.relativeSize !== undefined) {
        updateClauses.push('relative_size = ?');
        values.push(input.relativeSize);
      }
      if (input.itemLabel !== undefined) {
        updateClauses.push('item_label = ?');
        values.push(input.itemLabel);
      }
      if (input.itemCategoryId !== undefined) {
        updateClauses.push('item_category_id = ?');
        values.push(input.itemCategoryId);
      }
      if (input.itemQuantity !== undefined) {
        updateClauses.push('item_quantity = ?');
        values.push(input.itemQuantity);
      }

      if (updateClauses.length > 0) {
        updateClauses.push('updated_at = ?');
        values.push(now);
        values.push(id);

        statements.push(
          this.db
            .prepare(`UPDATE sub_compartments SET ${updateClauses.join(', ')} WHERE id = ?`)
            .bind(...values)
        );
      }
    }

    if (statements.length > 0) {
      await this.db.batch(statements);
    }
  }
}

interface DrawerRow {
  id: string;
  room_id: string;
  name: string;
  rows: number;
  cols: number;
  grid_x: number;
  grid_y: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface CompartmentRow {
  id: string;
  drawer_id: string;
  row: number;
  col: number;
  row_span: number;
  col_span: number;
  divider_orientation: DividerOrientation;
  created_at: string;
  updated_at: string;
}

interface SubCompartmentRow {
  id: string;
  compartment_id: string;
  display_order: number;
  relative_size: number;
  item_label: string | null;
  item_category_id: string | null;
  item_quantity: number | null;
  created_at: string;
  updated_at: string;
}

function mapRowToDrawer(row: DrawerRow): Drawer {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    rows: row.rows,
    cols: row.cols,
    gridX: row.grid_x,
    gridY: row.grid_y,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToCompartment(row: CompartmentRow): Compartment {
  return {
    id: row.id,
    drawerId: row.drawer_id,
    row: row.row,
    col: row.col,
    rowSpan: row.row_span ?? 1,
    colSpan: row.col_span ?? 1,
    dividerOrientation: row.divider_orientation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToSubCompartment(row: SubCompartmentRow): SubCompartment {
  return {
    id: row.id,
    compartmentId: row.compartment_id,
    displayOrder: row.display_order,
    relativeSize: row.relative_size,
    itemLabel: row.item_label,
    itemCategoryId: row.item_category_id,
    itemQuantity: row.item_quantity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
