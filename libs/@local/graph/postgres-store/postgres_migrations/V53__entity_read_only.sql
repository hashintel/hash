-- Add with a default to backfill existing rows, then drop it so inserts must be explicit.
ALTER TABLE entity_ids
    ADD COLUMN read_only BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE entity_ids
    ALTER COLUMN read_only DROP DEFAULT;
