CREATE TABLE IF NOT EXISTS
  "type_ids" (
    "version_id" UUID PRIMARY KEY,
    "base_uri" TEXT NOT NULL,
    "version" BIGINT NOT NULL,
    "transaction_time" tstzrange NOT NULL,
    UNIQUE ("base_uri", "version"),
    CONSTRAINT type_ids_overlapping EXCLUDE USING gist (
      base_uri
      WITH
        =,
        transaction_time
      WITH
        &&
    ) DEFERRABLE INITIALLY IMMEDIATE
  );

COMMENT
  ON TABLE "type_ids" IS $pga$ This table is a boundary to define the actual identification scheme for our kinds of types. Assume that we use the UUIDs on the types to look up more specific ID details. $pga$;

CREATE TABLE IF NOT EXISTS
  "owned_ontology_metadata" (
    "version_id" UUID NOT NULL,
    "owned_by_id" UUID NOT NULL REFERENCES "accounts",
    "updated_by_id" UUID NOT NULL REFERENCES "accounts",
    CONSTRAINT owned_ontology_metadata_pk PRIMARY KEY ("version_id") DEFERRABLE INITIALLY IMMEDIATE,
    CONSTRAINT owned_ontology_metadata_fk FOREIGN KEY ("version_id") REFERENCES "type_ids" DEFERRABLE INITIALLY IMMEDIATE
  );

CREATE TABLE IF NOT EXISTS
  "data_types" (
    "version_id" UUID PRIMARY KEY REFERENCES "type_ids",
    "schema" JSONB NOT NULL
  );

CREATE TABLE IF NOT EXISTS
  "property_types" (
    "version_id" UUID PRIMARY KEY REFERENCES "type_ids",
    "schema" JSONB NOT NULL
  );

CREATE TABLE IF NOT EXISTS
  "entity_types" (
    "version_id" UUID PRIMARY KEY REFERENCES "type_ids",
    "schema" JSONB NOT NULL
  );

CREATE TABLE IF NOT EXISTS
  "property_type_property_type_references" (
    "source_property_type_version_id" UUID NOT NULL REFERENCES "property_types",
    "target_property_type_version_id" UUID NOT NULL REFERENCES "property_types"
  );

CREATE TABLE IF NOT EXISTS
  "property_type_data_type_references" (
    "source_property_type_version_id" UUID NOT NULL REFERENCES "property_types",
    "target_data_type_version_id" UUID NOT NULL REFERENCES "data_types"
  );

CREATE TABLE IF NOT EXISTS
  "entity_type_property_type_references" (
    "source_entity_type_version_id" UUID NOT NULL REFERENCES "entity_types",
    "target_property_type_version_id" UUID NOT NULL REFERENCES "property_types"
  );

CREATE TABLE IF NOT EXISTS
  "entity_type_entity_type_references" (
    "source_entity_type_version_id" UUID NOT NULL REFERENCES "entity_types",
    "target_entity_type_version_id" UUID NOT NULL REFERENCES "entity_types"
  );
