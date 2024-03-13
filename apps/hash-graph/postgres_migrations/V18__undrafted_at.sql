ALTER TABLE "entity_ids"
    ADD COLUMN "first_non_draft_created_at_transaction_time" TIMESTAMP WITH TIME ZONE,
    ADD COLUMN "first_non_draft_created_at_decision_time"    TIMESTAMP WITH TIME ZONE;

-- Some created-at times were not calculated correctly. This will fix them.
UPDATE "entity_ids"
SET created_at_transaction_time = transaction_time,
    created_at_decision_time    = decision_time
FROM (
    WITH transaction_times AS (
        SELECT web_id,
               entity_uuid,
               min(lower(transaction_time)) AS "transaction_time"
        FROM entity_temporal_metadata
        GROUP BY web_id, entity_uuid
    ), decision_times AS (
        SELECT web_id,
               entity_uuid,
               min(lower(decision_time)) AS "decision_time"
        FROM entity_temporal_metadata
        GROUP BY web_id, entity_uuid
    )
    SELECT DISTINCT ON (web_id, entity_uuid)
          web_id,
          entity_uuid,
          transaction_times.transaction_time,
          decision_times.decision_time
     FROM entity_temporal_metadata
     JOIN decision_times USING (web_id, entity_uuid)
     JOIN transaction_times USING (web_id, entity_uuid)
) AS subquery
WHERE "entity_ids".web_id = subquery.web_id
  AND "entity_ids".entity_uuid = subquery.entity_uuid;

UPDATE "entity_ids"
SET first_non_draft_created_at_transaction_time = transaction_time,
    first_non_draft_created_at_decision_time    = decision_time
FROM (
    WITH transaction_times AS (
        SELECT web_id,
               entity_uuid,
               min(lower(transaction_time)) AS "transaction_time"
        FROM entity_temporal_metadata
        WHERE draft_id IS NULL
        GROUP BY web_id, entity_uuid
    ), decision_times AS (
        SELECT web_id,
               entity_uuid,
               min(lower(decision_time)) AS "decision_time"
        FROM entity_temporal_metadata
        WHERE draft_id IS NULL
        GROUP BY web_id, entity_uuid
    )
    SELECT DISTINCT ON (web_id, entity_uuid)
          web_id,
          entity_uuid,
          transaction_times.transaction_time,
          decision_times.decision_time
     FROM entity_temporal_metadata
     JOIN decision_times USING (web_id, entity_uuid)
     JOIN transaction_times USING (web_id, entity_uuid)
) AS subquery
WHERE "entity_ids".web_id = subquery.web_id
  AND "entity_ids".entity_uuid = subquery.entity_uuid;
