-- Denormalize the entity creator out of the provenance JSONB into a dedicated column, so
-- reads no longer pull the JSONB per row. `createdById` is set once at creation and never
-- changes, keeping the column consistent with `provenance ->> 'createdById'`.
--
-- The columns stay nullable: binaries deployed before this migration keep inserting rows
-- without them during the rollout window. TODO(BE-639): backfill those rows and add NOT NULL.
ALTER TABLE entity_ids
    ADD COLUMN created_by_id UUID;

UPDATE entity_ids
    SET created_by_id = (provenance ->> 'createdById')::uuid;

-- Same denormalization for the edition-level creator out of `entity_editions.provenance`.
ALTER TABLE entity_editions
    ADD COLUMN created_by_id UUID;

UPDATE entity_editions
    SET created_by_id = (provenance ->> 'createdById')::uuid;
