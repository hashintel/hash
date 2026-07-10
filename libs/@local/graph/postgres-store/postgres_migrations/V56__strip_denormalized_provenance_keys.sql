-- Remove the provenance values that live in dedicated columns from the JSONB, so each datum is
-- stored exactly once.
UPDATE entity_ids
    SET provenance = provenance
        - 'createdById' - 'createdAtTransactionTime' - 'createdAtDecisionTime'
    WHERE provenance ?| array['createdById', 'createdAtTransactionTime', 'createdAtDecisionTime'];

UPDATE entity_editions
    SET provenance = provenance - 'createdById'
    WHERE provenance ? 'createdById';
