CREATE TABLE IF NOT EXISTS
  base_uris ("base_uri" TEXT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS
  ontology_ids (
    "ontology_id" UUID PRIMARY KEY,
    "base_uri" TEXT NOT NULL REFERENCES "base_uris",
    "version" BIGINT NOT NULL,
    "transaction_time" tstzrange NOT NULL,
    "record_created_by_id" UUID NOT NULL REFERENCES "accounts",
    UNIQUE ("base_uri", "version"),
    EXCLUDE USING gist (
      "base_uri"
      WITH
        =,
        "version"
      WITH
        =,
        "transaction_time"
      WITH
        &&
    )
  );

COMMENT
  ON TABLE ontology_ids IS $pga$ This table is a boundary to define the actual identification scheme for our kinds of types. Assume that we use the UUIDs on the types to look up more specific ID details. $pga$;

CREATE TABLE IF NOT EXISTS
  "ontology_owned_metadata" (
    "ontology_id" UUID PRIMARY KEY REFERENCES "ontology_ids",
    "owned_by_id" UUID NOT NULL REFERENCES "accounts"
  );

CREATE TABLE IF NOT EXISTS
  "ontology_external_metadata" (
    "ontology_id" UUID PRIMARY KEY REFERENCES "ontology_ids",
    "fetched_at" TIMESTAMP WITH TIME ZONE NOT NULL
  );

CREATE VIEW
  "ontology_id_with_metadata" AS
SELECT
  "ontology_id",
  "base_uri",
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
UNION ALL
SELECT
  "ontology_id",
  "base_uri",
  "version",
  "record_created_by_id",
  "transaction_time",
  JSONB_BUILD_OBJECT(
    'fetched_at',
    ontology_external_metadata.fetched_at
  ) AS "additional_metadata"
FROM
  ontology_ids
  NATURAL JOIN ontology_external_metadata;

CREATE TABLE IF NOT EXISTS
  "data_types" (
    "ontology_id" UUID PRIMARY KEY REFERENCES ontology_ids,
    "schema" JSONB NOT NULL
  );

CREATE TABLE IF NOT EXISTS
  "property_types" (
    "ontology_id" UUID PRIMARY KEY REFERENCES ontology_ids,
    "schema" JSONB NOT NULL
  );

CREATE TABLE IF NOT EXISTS
  "entity_types" (
    "ontology_id" UUID PRIMARY KEY REFERENCES ontology_ids,
    "schema" JSONB NOT NULL
  );

CREATE TABLE IF NOT EXISTS
  "property_type_property_type_references" (
    "source_property_type_ontology_id" UUID NOT NULL REFERENCES "property_types",
    "target_property_type_ontology_id" UUID NOT NULL REFERENCES "property_types"
  );

CREATE TABLE IF NOT EXISTS
  "property_type_data_type_references" (
    "source_property_type_ontology_id" UUID NOT NULL REFERENCES "property_types",
    "target_data_type_ontology_id" UUID NOT NULL REFERENCES "data_types"
  );

CREATE TABLE IF NOT EXISTS
  "entity_type_property_type_references" (
    "source_entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types",
    "target_property_type_ontology_id" UUID NOT NULL REFERENCES "property_types"
  );

CREATE TABLE IF NOT EXISTS
  "entity_type_entity_type_references" (
    "source_entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types",
    "target_entity_type_ontology_id" UUID NOT NULL REFERENCES "entity_types"
  );
