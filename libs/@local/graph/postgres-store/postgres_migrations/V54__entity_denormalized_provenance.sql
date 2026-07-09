-- Denormalize the entity creator and creation timestamps out of the provenance JSONB into
-- dedicated columns, so authorization filters and sorting no longer read the JSONB per row.
ALTER TABLE entity_ids
    ADD COLUMN created_by_id UUID,
    ADD COLUMN created_at_transaction_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN created_at_decision_time TIMESTAMP WITH TIME ZONE;

UPDATE entity_ids
    SET created_by_id = (provenance ->> 'createdById')::uuid,
        created_at_transaction_time = (provenance ->> 'createdAtTransactionTime')::timestamptz,
        created_at_decision_time = (provenance ->> 'createdAtDecisionTime')::timestamptz;

ALTER TABLE entity_editions
    ADD COLUMN created_by_id UUID;

UPDATE entity_editions
    SET created_by_id = (provenance ->> 'createdById')::uuid;
