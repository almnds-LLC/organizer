import { env } from 'cloudflare:test';

// Run migrations before each test
export async function setupDatabase() {
  const db = env.DB;

  // Batch all table creations
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        UNIQUE(token_hash)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS room_members (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
        can_invite INTEGER NOT NULL DEFAULT 0,
        invited_by TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(room_id, user_id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS room_invitations (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        invitee_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
        can_invite INTEGER NOT NULL DEFAULT 0,
        invited_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(room_id, invitee_id)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color_index INTEGER,
        color TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS drawers (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        name TEXT NOT NULL,
        rows INTEGER NOT NULL DEFAULT 2,
        cols INTEGER NOT NULL DEFAULT 2,
        grid_x INTEGER NOT NULL DEFAULT 0,
        grid_y INTEGER NOT NULL DEFAULT 0,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS compartments (
        id TEXT PRIMARY KEY,
        drawer_id TEXT NOT NULL,
        row INTEGER NOT NULL,
        col INTEGER NOT NULL,
        row_span INTEGER NOT NULL DEFAULT 1,
        col_span INTEGER NOT NULL DEFAULT 1,
        divider_orientation TEXT NOT NULL DEFAULT 'horizontal' CHECK(divider_orientation IN ('horizontal', 'vertical')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(drawer_id, row, col)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS sub_compartments (
        id TEXT PRIMARY KEY,
        compartment_id TEXT NOT NULL,
        display_order INTEGER NOT NULL,
        relative_size REAL NOT NULL DEFAULT 0.5,
        item_label TEXT,
        item_category_id TEXT,
        item_quantity INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
  ]);
}

// Clean database after tests
export async function cleanDatabase() {
  const db = env.DB;
  await db.batch([
    db.prepare('DELETE FROM sub_compartments'),
    db.prepare('DELETE FROM compartments'),
    db.prepare('DELETE FROM drawers'),
    db.prepare('DELETE FROM categories'),
    db.prepare('DELETE FROM room_invitations'),
    db.prepare('DELETE FROM room_members'),
    db.prepare('DELETE FROM rooms'),
    db.prepare('DELETE FROM refresh_tokens'),
    db.prepare('DELETE FROM users'),
  ]);
}
