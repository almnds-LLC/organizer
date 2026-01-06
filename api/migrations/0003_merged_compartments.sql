-- Add row_span and col_span columns to support merged compartments
-- Default value of 1 means a single-cell compartment (existing behavior)
ALTER TABLE compartments ADD COLUMN row_span INTEGER NOT NULL DEFAULT 1;
ALTER TABLE compartments ADD COLUMN col_span INTEGER NOT NULL DEFAULT 1;
