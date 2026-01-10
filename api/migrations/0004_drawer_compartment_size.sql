-- Add compartment size columns to drawers
ALTER TABLE drawers ADD COLUMN compartment_width REAL NOT NULL DEFAULT 3;
ALTER TABLE drawers ADD COLUMN compartment_height REAL NOT NULL DEFAULT 1;
