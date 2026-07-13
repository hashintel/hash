-- Backfill rows missing a value from the provenance JSONB, make the columns mandatory, and
-- index the creation timestamps.
UPDATE entity_ids
    SET created_by_id = COALESCE(created_by_id, (provenance ->> 'createdById')::uuid),
        created_at_transaction_time = COALESCE(
            created_at_transaction_time, (provenance ->> 'createdAtTransactionTime')::timestamptz
        ),
        created_at_decision_time = COALESCE(
            created_at_decision_time, (provenance ->> 'createdAtDecisionTime')::timestamptz
        )
    WHERE created_by_id IS NULL
       OR created_at_transaction_time IS NULL
       OR created_at_decision_time IS NULL;

UPDATE entity_editions
    SET created_by_id = (provenance ->> 'createdById')::uuid
    WHERE created_by_id IS NULL;

ALTER TABLE entity_ids
    ALTER COLUMN created_by_id SET NOT NULL,
    ALTER COLUMN created_at_transaction_time SET NOT NULL,
    ALTER COLUMN created_at_decision_time SET NOT NULL;

ALTER TABLE entity_editions
    ALTER COLUMN created_by_id SET NOT NULL;

CREATE INDEX entity_ids_created_at_transaction_time
    ON entity_ids (created_at_transaction_time);
CREATE INDEX entity_ids_created_at_decision_time
    ON entity_ids (created_at_decision_time);
