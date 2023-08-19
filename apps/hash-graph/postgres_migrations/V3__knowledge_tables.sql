CREATE TABLE IF NOT EXISTS
  "entity_ids" (
    "owned_by_id" UUID NOT NULL REFERENCES "accounts",
    "entity_uuid" UUID NOT NULL,
    PRIMARY KEY ("owned_by_id", "entity_uuid")
  );

CREATE TABLE IF NOT EXISTS
  "entity_has_left_entity" (
    "owned_by_id" UUID NOT NULL,
    "entity_uuid" UUID NOT NULL,
    "left_owned_by_id" UUID NOT NULL,
    "left_entity_uuid" UUID NOT NULL,
    FOREIGN KEY ("owned_by_id", "entity_uuid") REFERENCES "entity_ids",
    FOREIGN KEY ("left_owned_by_id", "left_entity_uuid") REFERENCES "entity_ids"
  );

CREATE TABLE IF NOT EXISTS
  "entity_has_right_entity" (
    "owned_by_id" UUID NOT NULL,
    "entity_uuid" UUID NOT NULL,
    "right_owned_by_id" UUID NOT NULL,
    "right_entity_uuid" UUID NOT NULL,
    FOREIGN KEY ("owned_by_id", "entity_uuid") REFERENCES "entity_ids",
    FOREIGN KEY ("right_owned_by_id", "right_entity_uuid") REFERENCES "entity_ids"
  );

CREATE TABLE IF NOT EXISTS
  "entity_editions" (
    "entity_edition_id" UUID NOT NULL PRIMARY KEY,
    "properties" JSONB NOT NULL,
    "left_to_right_order" INTEGER,
    "right_to_left_order" INTEGER,
    "record_created_by_id" UUID NOT NULL REFERENCES "accounts",
    "archived" BOOLEAN NOT NULL
  );

CREATE TABLE IF NOT EXISTS
  "entity_is_of_type" (
    "entity_edition_id" UUID NOT NULL REFERENCES "entity_editions",
    "entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types"
  );

CREATE TABLE IF NOT EXISTS
  "entity_temporal_metadata" (
    "owned_by_id" UUID NOT NULL,
    "entity_uuid" UUID NOT NULL,
    "entity_edition_id" UUID NOT NULL REFERENCES "entity_editions",
    "decision_time" tstzrange NOT NULL,
    "transaction_time" tstzrange NOT NULL,
    FOREIGN KEY ("owned_by_id", "entity_uuid") REFERENCES "entity_ids",
    CONSTRAINT entity_temporal_metadata_overlapping EXCLUDE USING gist (
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
