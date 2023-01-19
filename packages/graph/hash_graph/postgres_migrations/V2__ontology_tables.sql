CREATE TABLE IF NOT EXISTS
  "base_uris" ("base_uri" TEXT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS
  "version_ids" ("version_id" UUID PRIMARY KEY);

CREATE TABLE IF NOT EXISTS
  "type_ids" (
    "base_uri" TEXT NOT NULL REFERENCES "base_uris",
    "version" BIGINT NOT NULL,
    "version_id" UUID REFERENCES "version_ids",
    "owned_by_id" UUID NOT NULL REFERENCES "accounts",
    "updated_by_id" UUID NOT NULL REFERENCES "accounts",
    "transaction_time" tstzrange NOT NULL,
    CONSTRAINT type_ids_pkey PRIMARY KEY ("base_uri", "version") DEFERRABLE INITIALLY IMMEDIATE,
    CONSTRAINT type_id_unique UNIQUE ("version_id") DEFERRABLE INITIALLY IMMEDIATE,
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
  "data_types" (
    "version_id" UUID PRIMARY KEY REFERENCES "version_ids",
    "schema" JSONB NOT NULL
  );

CREATE TABLE IF NOT EXISTS
  "property_types" (
    "version_id" UUID PRIMARY KEY REFERENCES "version_ids",
    "schema" JSONB NOT NULL
  );

CREATE TABLE IF NOT EXISTS
  "entity_types" (
    "version_id" UUID PRIMARY KEY REFERENCES "version_ids",
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
