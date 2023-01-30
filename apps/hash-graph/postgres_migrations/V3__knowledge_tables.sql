CREATE TABLE IF NOT EXISTS
  "entity_ids" (
    "owned_by_id" UUID NOT NULL REFERENCES "accounts",
    "entity_uuid" UUID NOT NULL,
    "left_owned_by_id" UUID,
    "left_entity_uuid" UUID,
    "right_owned_by_id" UUID,
    "right_entity_uuid" UUID,
    PRIMARY KEY ("owned_by_id", "entity_uuid"),
    FOREIGN KEY ("left_owned_by_id", "left_entity_uuid") REFERENCES "entity_ids",
    FOREIGN KEY ("right_owned_by_id", "right_entity_uuid") REFERENCES "entity_ids",
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
  "entity_records" (
    "entity_edition_id" BIGINT PRIMARY KEY NOT NULL GENERATED ALWAYS AS IDENTITY,
    "entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types",
    "properties" JSONB NOT NULL,
    "left_to_right_order" INTEGER,
    "right_to_left_order" INTEGER,
    "updated_by_id" UUID NOT NULL REFERENCES "accounts",
    "archived" BOOLEAN NOT NULL
  );

CREATE TABLE IF NOT EXISTS
  "entity_revisions" (
    "owned_by_id" UUID NOT NULL,
    "entity_uuid" UUID NOT NULL,
    "entity_edition_id" BIGINT NOT NULL REFERENCES "entity_records",
    "decision_time" tstzrange NOT NULL,
    "transaction_time" tstzrange NOT NULL,
    FOREIGN KEY ("owned_by_id", "entity_uuid") REFERENCES "entity_ids",
    CONSTRAINT entity_revisions_overlapping EXCLUDE USING gist (
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
  entity_revisions.entity_edition_id,
  entity_revisions.owned_by_id,
  entity_revisions.entity_uuid,
  entity_revisions.decision_time,
  entity_revisions.transaction_time,
  entity_records.entity_type_ontology_id,
  entity_records.updated_by_id,
  entity_records.properties,
  entity_records.archived,
  entity_ids.left_owned_by_id,
  entity_ids.left_entity_uuid,
  entity_records.left_to_right_order,
  entity_ids.right_owned_by_id,
  entity_ids.right_entity_uuid,
  entity_records.right_to_left_order
FROM
  entity_revisions
  JOIN entity_records ON entity_revisions.entity_edition_id = entity_records.entity_edition_id
  JOIN entity_ids ON entity_revisions.owned_by_id = entity_ids.owned_by_id
  AND entity_revisions.entity_uuid = entity_ids.entity_uuid;
