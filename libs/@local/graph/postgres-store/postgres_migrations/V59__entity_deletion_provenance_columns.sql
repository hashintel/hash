ALTER TABLE entity_ids
    ADD COLUMN deleted_by_id UUID,
    ADD COLUMN deleted_at_transaction_time TIMESTAMPTZ,
    ADD COLUMN deleted_at_decision_time TIMESTAMPTZ,
    -- The deletion tombstone is total or absent: either all three deleted_* columns are set, or
    -- none is.
    ADD CONSTRAINT entity_ids_deletion_tombstone_total CHECK (
        ((deleted_by_id IS NULL) = (deleted_at_transaction_time IS NULL))
        AND ((deleted_by_id IS NULL) = (deleted_at_decision_time IS NULL))
    );

UPDATE entity_ids
    SET deleted_by_id = (provenance ->> 'deletedById')::uuid,
        deleted_at_transaction_time = (provenance ->> 'deletedAtTransactionTime')::timestamptz,
        deleted_at_decision_time = (provenance ->> 'deletedAtDecisionTime')::timestamptz
    WHERE provenance ? 'deletedById';

UPDATE entity_ids
    SET provenance = provenance
        - 'deletedById' - 'deletedAtTransactionTime' - 'deletedAtDecisionTime'
    WHERE provenance ?| array['deletedById', 'deletedAtTransactionTime', 'deletedAtDecisionTime'];

CREATE INDEX entity_ids_deleted_at_transaction_time
    ON entity_ids (deleted_at_transaction_time)
    INCLUDE (web_id, entity_uuid)
    WHERE deleted_at_transaction_time IS NOT NULL;
