-- Denormalize the entity creator and creation timestamps out of the provenance JSONB into
-- dedicated columns, so authorization filters and sorting no longer pull the JSONB per row.
-- All three values are set once at creation and never change, keeping the columns consistent
-- with `provenance ->> 'createdById'`, `->> 'createdAtTransactionTime'` and
-- `->> 'createdAtDecisionTime'`.
--
-- The columns stay nullable: binaries deployed before this migration keep inserting rows
-- without them during the rollout window. TODO(BE-639): backfill those rows and add NOT NULL.
ALTER TABLE entity_ids
    ADD COLUMN created_by_id UUID,
    ADD COLUMN created_at_transaction_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN created_at_decision_time TIMESTAMP WITH TIME ZONE;

UPDATE entity_ids
    SET created_by_id = (provenance ->> 'createdById')::uuid,
        created_at_transaction_time = (provenance ->> 'createdAtTransactionTime')::timestamptz,
        created_at_decision_time = (provenance ->> 'createdAtDecisionTime')::timestamptz;

-- Same creator denormalization for the edition level out of `entity_editions.provenance`.
ALTER TABLE entity_editions
    ADD COLUMN created_by_id UUID;

UPDATE entity_editions
    SET created_by_id = (provenance ->> 'createdById')::uuid;
