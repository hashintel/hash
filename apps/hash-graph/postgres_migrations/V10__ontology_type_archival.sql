CREATE TABLE IF NOT EXISTS
  "ontology_temporal_metadata" (
    "ontology_id" UUID NOT NULL REFERENCES "ontology_ids",
    "transaction_time" tstzrange NOT NULL,
    EXCLUDE USING gist (
      ontology_id
      WITH
        =,
        transaction_time
      WITH
        &&
    )
  );

INSERT INTO
  "ontology_temporal_metadata" ("ontology_id", "transaction_time")
SELECT
  "ontology_id",
  "transaction_time"
FROM
  "ontology_ids";

DROP VIEW
  "ontology_id_with_metadata";

ALTER TABLE
  "ontology_ids"
DROP COLUMN
  "transaction_time";

CREATE VIEW
  "ontology_id_with_metadata" AS
SELECT
  "ontology_id",
  "base_url",
  "version",
  "record_created_by_id",
  "transaction_time",
  JSONB_BUILD_OBJECT(
    'owned_by_id',
    ontology_owned_metadata.owned_by_id
  ) AS "additional_metadata"
FROM
  ontology_ids
  NATURAL JOIN ontology_owned_metadata
  NATURAL JOIN ontology_temporal_metadata
UNION ALL
SELECT
  "ontology_id",
  "base_url",
  "version",
  "record_created_by_id",
  "transaction_time",
  JSONB_BUILD_OBJECT(
    'fetched_at',
    ontology_external_metadata.fetched_at
  ) AS "additional_metadata"
FROM
  ontology_ids
  NATURAL JOIN ontology_external_metadata
  NATURAL JOIN ontology_temporal_metadata;

DROP FUNCTION
  "create_ontology_id";

DROP FUNCTION
  "create_owned_ontology_id";

DROP FUNCTION
  "create_external_ontology_id";

DROP FUNCTION
  update_ontology_id;

DROP FUNCTION
  update_owned_ontology_id;

DROP TRIGGER
  update_owned_ontology_metadata_trigger ON ontology_owned_metadata;

DROP FUNCTION
  update_owned_ontology_metadata_trigger;

DROP TRIGGER
  update_ontology_ids_trigger ON ontology_ids;

DROP FUNCTION
  update_ontology_ids_trigger;
