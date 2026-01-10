import type { Category, CreateCategoryInput, UpdateCategoryInput } from '../types';
import type { ICategoryRepository } from '../interfaces';
import { generateId } from '../../lib/id';
import { NotFoundError } from '../../lib/errors';

export class CategoryRepository implements ICategoryRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<Category | null> {
    const row = await this.db
      .prepare('SELECT * FROM categories WHERE id = ?')
      .bind(id)
      .first<CategoryRow>();
    return row ? mapRowToCategory(row) : null;
  }

  async findByRoom(roomId: string): Promise<Category[]> {
    const rows = await this.db
      .prepare('SELECT * FROM categories WHERE room_id = ? ORDER BY name')
      .bind(roomId)
      .all<CategoryRow>();
    return rows.results.map(mapRowToCategory);
  }

  async create(roomId: string, input: CreateCategoryInput): Promise<Category> {
    const id = generateId();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO categories (id, room_id, name, color_index, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        roomId,
        input.name,
        input.colorIndex ?? null,
        input.color ?? null,
        now,
        now
      )
      .run();

    return {
      id,
      roomId,
      name: input.name,
      colorIndex: input.colorIndex ?? null,
      color: input.color ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category | null> {
    const category = await this.findById(id);
    if (!category) throw new NotFoundError('Category not found');

    if (input.updatedAt !== undefined) {
      const storedTime = new Date(category.updatedAt).getTime();
      if (input.updatedAt < storedTime) {
        return null;
      }
    }

    const timestamp = input.updatedAt
      ? new Date(input.updatedAt).toISOString()
      : new Date().toISOString();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.colorIndex !== undefined) {
      updates.push('color_index = ?');
      values.push(input.colorIndex);
    }
    if (input.color !== undefined) {
      updates.push('color = ?');
      values.push(input.color);
    }

    if (updates.length === 0) return category;

    updates.push('updated_at = ?');
    values.push(timestamp);
    values.push(id);

    await this.db
      .prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return {
      ...category,
      name: input.name ?? category.name,
      colorIndex: input.colorIndex !== undefined ? input.colorIndex : category.colorIndex,
      color: input.color !== undefined ? input.color : category.color,
      updatedAt: timestamp,
    };
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  }
}

interface CategoryRow {
  id: string;
  room_id: string;
  name: string;
  color_index: number | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

function mapRowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    colorIndex: row.color_index,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
