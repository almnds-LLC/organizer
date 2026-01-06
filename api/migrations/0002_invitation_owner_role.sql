-- Allow owner role in invitations and add can_invite column
-- SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table

-- Create new table with updated constraints
CREATE TABLE room_invitations_new (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
  can_invite INTEGER NOT NULL DEFAULT 0,
  invited_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(room_id, invitee_id)
);

-- Copy existing data (default can_invite to 0)
INSERT INTO room_invitations_new (id, room_id, invitee_id, role, can_invite, invited_by, created_at)
SELECT id, room_id, invitee_id, role, 0, invited_by, created_at
FROM room_invitations;

-- Drop old table and rename new one
DROP TABLE room_invitations;
ALTER TABLE room_invitations_new RENAME TO room_invitations;

-- Recreate index
CREATE INDEX idx_room_invitations_invitee ON room_invitations(invitee_id);
