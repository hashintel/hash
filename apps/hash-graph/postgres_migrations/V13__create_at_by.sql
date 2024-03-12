ALTER TABLE "entity_editions"
    RENAME COLUMN record_created_by_id TO edition_created_by_id;
ALTER TABLE "ontology_temporal_metadata"
    RENAME COLUMN record_created_by_id TO edition_created_by_id;
ALTER TABLE "ontology_temporal_metadata"
    RENAME COLUMN record_archived_by_id TO edition_archived_by_id;

ALTER TABLE "entity_ids"
    ADD COLUMN "created_by_id"               UUID REFERENCES "accounts",
    ADD COLUMN "created_at_transaction_time" TIMESTAMP WITH TIME ZONE,
    ADD COLUMN "created_at_decision_time"    TIMESTAMP WITH TIME ZONE;

-- This denormalizes the database to allow efficient querying for the creation date.
UPDATE "entity_ids"
SET created_by_id               = edition_created_by_id,
    created_at_transaction_time = transaction_time,
    created_at_decision_time    = decision_time
FROM (
    SELECT DISTINCT ON (web_id, entity_uuid, transaction_time)
          web_id,
          entity_uuid,
          min(lower(transaction_time)) OVER (PARTITION BY web_id, entity_uuid) AS "transaction_time",
          lower(decision_time)                                                 AS "decision_time",
          edition_created_by_id
     FROM "entity_temporal_metadata"
     JOIN entity_editions
       ON entity_temporal_metadata.entity_edition_id = entity_editions.entity_edition_id
) AS subquery
WHERE "entity_ids".web_id = subquery.web_id
  AND "entity_ids".entity_uuid = subquery.entity_uuid;

ALTER TABLE "entity_ids"
    ALTER COLUMN "created_by_id" SET NOT NULL,
    ALTER COLUMN "created_at_transaction_time" SET NOT NULL,
    ALTER COLUMN "created_at_decision_time" SET NOT NULL;
