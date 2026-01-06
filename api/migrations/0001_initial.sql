-- Users (username/password auth)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_username ON users(username);

-- Refresh tokens (long-lived, stored in httpOnly cookie)
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Rooms (collections of drawers)
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_rooms_owner ON rooms(owner_id);

-- Room members (sharing)
CREATE TABLE room_members (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
  can_invite INTEGER NOT NULL DEFAULT 0,
  invited_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(room_id, user_id)
);
CREATE INDEX idx_room_members_room ON room_members(room_id);
CREATE INDEX idx_room_members_user ON room_members(user_id);

-- Pending invitations (by username)
CREATE TABLE room_invitations (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('editor', 'viewer')),
  invited_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(room_id, invitee_id)
);
CREATE INDEX idx_room_invitations_invitee ON room_invitations(invitee_id);

-- Categories (per-room)
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_index INTEGER,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_categories_room ON categories(room_id);

-- Drawers
CREATE TABLE drawers (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rows INTEGER NOT NULL DEFAULT 2,
  cols INTEGER NOT NULL DEFAULT 2,
  grid_x INTEGER NOT NULL DEFAULT 0,
  grid_y INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_drawers_room ON drawers(room_id);

-- Compartments
CREATE TABLE compartments (
  id TEXT PRIMARY KEY,
  drawer_id TEXT NOT NULL REFERENCES drawers(id) ON DELETE CASCADE,
  row INTEGER NOT NULL,
  col INTEGER NOT NULL,
  divider_orientation TEXT NOT NULL DEFAULT 'horizontal',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(drawer_id, row, col)
);
CREATE INDEX idx_compartments_drawer ON compartments(drawer_id);

-- Sub-compartments (with denormalized item data)
CREATE TABLE sub_compartments (
  id TEXT PRIMARY KEY,
  compartment_id TEXT NOT NULL REFERENCES compartments(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  relative_size REAL NOT NULL DEFAULT 1.0,
  item_label TEXT,
  item_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  item_quantity INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sub_compartments_compartment ON sub_compartments(compartment_id);
