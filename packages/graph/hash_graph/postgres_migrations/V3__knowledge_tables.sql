CREATE TABLE IF NOT EXISTS
  "entity_ids" (
    "owned_by_id" UUID NOT NULL,
    "entity_uuid" UUID NOT NULL,
    "left_owned_by_id" UUID,
    "left_entity_uuid" UUID,
    "right_owned_by_id" UUID,
    "right_entity_uuid" UUID,
    PRIMARY KEY ("owned_by_id", "entity_uuid"),
    -- Set in CITUS script instead.
    -- THIS HAS CHANGED!
    -- we no longer allow the left and right entity to have their own owned_by_ids
    FOREIGN KEY ("owned_by_id", "left_entity_uuid") REFERENCES "entity_ids",
    FOREIGN KEY ("owned_by_id", "right_entity_uuid") REFERENCES "entity_ids",
    CHECK (
      left_entity_uuid IS NULL
      AND right_entity_uuid IS NULL
      AND left_owned_by_id IS NULL
      AND right_owned_by_id IS NULL
      OR left_entity_uuid IS NOT NULL
      AND right_entity_uuid IS NOT NULL
      AND left_owned_by_id IS NOT NULL
      AND right_owned_by_id IS NOT NULL
    )
  );

CREATE TABLE IF NOT EXISTS
  "entity_editions" (
    "owned_by_id" UUID NOT NULL,
    "entity_record_id" BIGSERIAL NOT NULL,
    "entity_type_version_id" UUID NOT NULL REFERENCES "entity_types",
    "properties" JSONB NOT NULL,
    "left_to_right_order" INTEGER,
    "right_to_left_order" INTEGER,
    "updated_by_id" UUID NOT NULL,
    "archived" BOOLEAN NOT NULL,
    PRIMARY KEY ("owned_by_id", "entity_record_id")
  );

CREATE TABLE IF NOT EXISTS
  "entity_versions" (
    "owned_by_id" UUID NOT NULL,
    "entity_uuid" UUID NOT NULL,
    "entity_record_id" BIGINT NOT NULL,
    "decision_time" tstzrange NOT NULL,
    "transaction_time" tstzrange NOT NULL,
    -- FOREIGN KEY ("owned_by_id", "entity_uuid") REFERENCES "entity_ids",
    CONSTRAINT entity_versions_overlapping EXCLUDE USING gist (
      owned_by_id
      WITH
        =,
        entity_uuid
      WITH
        =,
        decision_time
      WITH
        &&,
        transaction_time
      WITH
        &&
    ) DEFERRABLE INITIALLY IMMEDIATE,
    CHECK (LOWER(decision_time) <= LOWER(transaction_time))
  );

CREATE VIEW
  "entities" AS
SELECT
  entity_versions.entity_record_id,
  entity_versions.owned_by_id,
  entity_versions.entity_uuid,
  entity_versions.decision_time,
  entity_versions.transaction_time,
  entity_editions.entity_type_version_id,
  entity_editions.updated_by_id,
  entity_editions.properties,
  entity_editions.archived,
  entity_ids.left_owned_by_id,
  entity_ids.left_entity_uuid,
  entity_editions.left_to_right_order,
  entity_ids.right_owned_by_id,
  entity_ids.right_entity_uuid,
  entity_editions.right_to_left_order
FROM
  entity_versions
  JOIN entity_editions ON entity_versions.entity_record_id = entity_editions.entity_record_id
  JOIN entity_ids ON entity_versions.owned_by_id = entity_ids.owned_by_id
  AND entity_versions.entity_uuid = entity_ids.entity_uuid;
