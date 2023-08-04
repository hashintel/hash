ALTER TABLE
  "ontology_temporal_metadata"
ADD COLUMN
  "record_created_by_id" UUID REFERENCES "accounts";

UPDATE
  "ontology_temporal_metadata"
SET
  "record_created_by_id" = "ontology_ids"."record_created_by_id"
FROM
  "ontology_ids"
WHERE
  "ontology_temporal_metadata"."ontology_id" = "ontology_ids"."ontology_id";

ALTER TABLE
  "ontology_temporal_metadata"
ALTER COLUMN
  "record_created_by_id"
SET NOT NULL
,
ADD COLUMN
  "record_archived_by_id" UUID REFERENCES "accounts",
ADD
  CONSTRAINT "record_archived_transaction_check" CHECK (
    ("record_archived_by_id" IS NULL) = (UPPER("transaction_time") IS NULL)
  );

DROP VIEW
  "ontology_id_with_metadata";

ALTER TABLE
  "ontology_ids"
DROP COLUMN
  "record_created_by_id";

CREATE VIEW
  "ontology_additional_metadata" AS
SELECT
  "ontology_id",
  JSONB_BUILD_OBJECT(
    'owned_by_id',
    ontology_owned_metadata.owned_by_id
  ) AS "additional_metadata"
FROM
  ontology_owned_metadata
UNION ALL
SELECT
  "ontology_id",
  JSONB_BUILD_OBJECT(
    'fetched_at',
    ontology_external_metadata.fetched_at
  ) AS "additional_metadata"
FROM
  ontology_external_metadata;
