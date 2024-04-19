ALTER TABLE entity_editions
    ADD COLUMN provenance JSONB;

UPDATE entity_editions
SET provenance = JSONB_BUILD_OBJECT(
    'createdById', edition_created_by_id
);

ALTER TABLE entity_editions
    ALTER COLUMN provenance SET NOT NULL,
    DROP COLUMN edition_created_by_id;

ALTER TABLE entity_ids
    ADD COLUMN provenance JSONB;

UPDATE entity_ids
SET provenance = JSONB_BUILD_OBJECT(
    'createdById', created_by_id,
    'createdAtTransactionTime', created_at_transaction_time,
    'createdAtDecisionTime', created_at_decision_time,
    'firstNonDraftCreatedAtTransactionTime', first_non_draft_created_at_transaction_time,
    'firstNonDraftCreatedAtDecisionTime', first_non_draft_created_at_decision_time
);

ALTER TABLE entity_ids
    ALTER COLUMN provenance SET NOT NULL,
    DROP COLUMN created_by_id,
    DROP COLUMN created_at_transaction_time,
    DROP COLUMN created_at_decision_time,
    DROP COLUMN first_non_draft_created_at_transaction_time,
    DROP COLUMN first_non_draft_created_at_decision_time;

ALTER TABLE ontology_temporal_metadata
    ADD COLUMN provenance JSONB;

UPDATE ontology_temporal_metadata
SET provenance = JSONB_BUILD_OBJECT(
    'createdById', edition_created_by_id,
    'archivedById', edition_archived_by_id
);

ALTER TABLE ontology_temporal_metadata
    ALTER COLUMN provenance SET NOT NULL,
    DROP COLUMN edition_created_by_id,
    DROP COLUMN edition_archived_by_id;
