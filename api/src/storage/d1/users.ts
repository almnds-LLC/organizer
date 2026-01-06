import type { User, CreateUserInput } from '../types';
import type { IUserRepository } from '../interfaces';
import { generateId } from '../../lib/id';
import { hashPassword } from '../../auth/password';
import { ConflictError } from '../../lib/errors';

export class UserRepository implements IUserRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<UserRow>();
    return row ? mapRowToUser(row) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
      .bind(username)
      .first<UserRow>();
    return row ? mapRowToUser(row) : null;
  }

  async searchByUsername(query: string, limit = 10): Promise<User[]> {
    const rows = await this.db
      .prepare(
        'SELECT * FROM users WHERE username LIKE ? COLLATE NOCASE LIMIT ?'
      )
      .bind(`%${query}%`, limit)
      .all<UserRow>();
    return rows.results.map(mapRowToUser);
  }

  async create(input: CreateUserInput): Promise<User> {
    const existing = await this.findByUsername(input.username);
    if (existing) {
      throw new ConflictError('Username already taken');
    }

    const id = generateId();
    const passwordHash = await hashPassword(input.password);
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO users (id, username, password_hash, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, input.username, passwordHash, input.displayName ?? null, now, now)
      .run();

    return {
      id,
      username: input.username,
      passwordHash,
      displayName: input.displayName ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(passwordHash, now, id)
      .run();
  }

  async updateDisplayName(id: string, displayName: string | null): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
      .bind(displayName, now, id)
      .run();
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  }
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
