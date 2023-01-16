CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TABLE IF NOT EXISTS "accounts" (
  "account_id" UUID PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS "base_uris" (
  "base_uri" TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS "version_ids" (
  "version_id" UUID PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS "type_ids" (
  "base_uri" TEXT NOT NULL REFERENCES "base_uris",
  "version" BIGINT NOT NULL,
  "version_id" UUID REFERENCES "version_ids"
);

COMMENT ON TABLE "type_ids" IS $pga$ This table is a boundary to define the actual identification scheme for our kinds of types. Assume that we use the UUIDs on the types to look up more specific ID details. $pga$;

ALTER TABLE "type_ids"
  ADD CONSTRAINT "type_ids_primary_key" PRIMARY KEY ("base_uri", "version");

CREATE TABLE IF NOT EXISTS "data_types" (
  "version_id" UUID PRIMARY KEY REFERENCES "version_ids",
  "schema" JSONB NOT NULL,
  "owned_by_id" UUID NOT NULL REFERENCES "accounts",
  "updated_by_id" UUID NOT NULL REFERENCES "accounts"
);

CREATE TABLE IF NOT EXISTS "property_types" (
  "version_id" UUID PRIMARY KEY REFERENCES "version_ids",
  "schema" JSONB NOT NULL,
  "owned_by_id" UUID NOT NULL REFERENCES "accounts",
  "updated_by_id" UUID NOT NULL REFERENCES "accounts"
);

CREATE TABLE IF NOT EXISTS "entity_types" (
  "version_id" UUID PRIMARY KEY REFERENCES "version_ids",
  "schema" JSONB NOT NULL,
  "owned_by_id" UUID NOT NULL REFERENCES "accounts",
  "updated_by_id" UUID NOT NULL REFERENCES "accounts"
);

CREATE TABLE IF NOT EXISTS "property_type_property_type_references" (
  "source_property_type_version_id" UUID NOT NULL REFERENCES "property_types",
  "target_property_type_version_id" UUID NOT NULL REFERENCES "property_types"
);

CREATE TABLE IF NOT EXISTS "property_type_data_type_references" (
  "source_property_type_version_id" UUID NOT NULL REFERENCES "property_types",
  "target_data_type_version_id" UUID NOT NULL REFERENCES "data_types"
);

CREATE TABLE IF NOT EXISTS "entity_type_property_type_references" (
  "source_entity_type_version_id" UUID NOT NULL REFERENCES "entity_types",
  "target_property_type_version_id" UUID NOT NULL REFERENCES "property_types"
);

CREATE TABLE IF NOT EXISTS "entity_type_entity_type_references" (
  "source_entity_type_version_id" UUID NOT NULL REFERENCES "entity_types",
  "target_entity_type_version_id" UUID NOT NULL REFERENCES "entity_types"
);

CREATE TABLE IF NOT EXISTS "entity_ids" (
  "owned_by_id" UUID NOT NULL REFERENCES "accounts",
  "entity_uuid" UUID NOT NULL,
  "left_owned_by_id" UUID,
  "left_entity_uuid" UUID,
  "right_owned_by_id" UUID,
  "right_entity_uuid" UUID
);

ALTER TABLE "entity_ids"
  ADD CONSTRAINT "entity_ids_primary_key" PRIMARY KEY ("owned_by_id", "entity_uuid"),
  ADD CONSTRAINT "entity_ids_left_reference" FOREIGN KEY ("left_owned_by_id", "left_entity_uuid") REFERENCES "entity_ids",
  ADD CONSTRAINT "entity_ids_right_reference" FOREIGN KEY ("right_owned_by_id", "right_entity_uuid") REFERENCES "entity_ids",
  ADD CONSTRAINT "entity_ids_relation_constraint" CHECK (left_entity_uuid IS NULL AND right_entity_uuid IS NULL AND left_owned_by_id IS NULL AND right_owned_by_id IS NULL OR
                                                         left_entity_uuid IS NOT NULL AND right_entity_uuid IS NOT NULL AND left_owned_by_id IS NOT NULL AND right_owned_by_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS "entity_editions" (
  "entity_record_id" BIGINT PRIMARY KEY NOT NULL GENERATED ALWAYS AS IDENTITY,
  "entity_type_version_id" UUID NOT NULL REFERENCES "entity_types",
  "properties" JSONB NOT NULL,
  "left_to_right_order" integer,
  "right_to_left_order" integer,
  "updated_by_id" UUID NOT NULL REFERENCES "accounts",
  "archived" BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS "entity_versions" (
  "owned_by_id" UUID NOT NULL,
  "entity_uuid" UUID NOT NULL,
  "entity_record_id" BIGINT NOT NULL REFERENCES "entity_editions",
  "decision_time" tstzrange NOT NULL,
  "transaction_time" tstzrange NOT NULL
);

ALTER TABLE "entity_versions"
  ADD CONSTRAINT "entity_versions_reference" FOREIGN KEY ("owned_by_id", "entity_uuid") REFERENCES "entity_ids",
  ADD CONSTRAINT "entity_versions_overlapping" EXCLUDE USING gist (owned_by_id WITH =, entity_uuid WITH =, decision_time WITH &&, transaction_time WITH &&) DEFERRABLE INITIALLY IMMEDIATE,
  ADD CONSTRAINT "entity_versions_decision_time_validation" CHECK (lower(decision_time) <= lower(transaction_time));

CREATE VIEW "entities" AS
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
    FROM entity_versions
    JOIN entity_editions ON entity_versions.entity_record_id = entity_editions.entity_record_id
    JOIN entity_ids ON entity_versions.owned_by_id = entity_ids.owned_by_id AND entity_versions.entity_uuid = entity_ids.entity_uuid;

CREATE OR REPLACE FUNCTION "create_entity" (
  "_owned_by_id" UUID,
  "_entity_uuid" UUID,
  "_decision_time" TIMESTAMP WITH TIME ZONE,
  "_updated_by_id" UUID,
  "_archived" BOOLEAN,
  "_entity_type_version_id" UUID,
  "_properties" JSONB,
  "_left_owned_by_id" UUID,
  "_left_entity_uuid" UUID,
  "_right_owned_by_id" UUID,
  "_right_entity_uuid" UUID,
  "_left_to_right_order" INTEGER,
  "_right_to_left_order" INTEGER)
  RETURNS TABLE (entity_record_id BIGINT, decision_time tstzrange, transaction_time tstzrange)
  AS $pga$
    DECLARE
      _entity_record_id BIGINT;
    BEGIN
      IF _decision_time IS NULL THEN _decision_time := now(); END IF;

      INSERT INTO entity_ids (
        owned_by_id,
        entity_uuid,
        left_owned_by_id,
        left_entity_uuid,
        right_owned_by_id,
        right_entity_uuid
      ) VALUES (
        _owned_by_id,
        _entity_uuid,
        _left_owned_by_id,
        _left_entity_uuid,
        _right_owned_by_id,
        _right_entity_uuid
      );

      -- insert the data of the entity
      INSERT INTO entity_editions (
        updated_by_id,
        archived,
        entity_type_version_id,
        properties,
        left_to_right_order,
        right_to_left_order
      ) VALUES (
        _updated_by_id,
        _archived,
        _entity_type_version_id,
        _properties,
        _left_to_right_order,
        _right_to_left_order
      ) RETURNING entity_editions.entity_record_id INTO _entity_record_id;

      RETURN QUERY
      INSERT INTO entity_versions (
        owned_by_id,
        entity_uuid,
        entity_record_id,
        decision_time,
        transaction_time
      ) VALUES (
        _owned_by_id,
        _entity_uuid,
        _entity_record_id,
        tstzrange(_decision_time, NULL, '[)'),
        tstzrange(now(), NULL, '[)')
      ) RETURNING entity_versions.entity_record_id, entity_versions.decision_time, entity_versions.transaction_time;
    END
    $pga$
  VOLATILE
  LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "update_entity" (
  "_owned_by_id" UUID, 
  "_entity_uuid" UUID, 
  "_decision_time" TIMESTAMP WITH TIME ZONE, 
  "_updated_by_id" UUID, 
  "_archived" BOOLEAN, 
  "_entity_type_version_id" UUID, 
  "_properties" JSONB, 
  "_left_to_right_order" INTEGER, 
  "_right_to_left_order" INTEGER)
  RETURNS TABLE (entity_record_id BIGINT, decision_time tstzrange, transaction_time tstzrange)
  AS $pga$
    DECLARE
      _new_entity_record_id BIGINT;
    BEGIN
      IF _decision_time IS NULL THEN _decision_time := now(); END IF;

      INSERT INTO entity_editions (
        updated_by_id,
        archived,
        entity_type_version_id,
        properties,
        left_to_right_order,
        right_to_left_order
      ) VALUES (
        _updated_by_id,
        _archived,
        _entity_type_version_id,
        _properties,
        _left_to_right_order,
        _right_to_left_order
      )
      RETURNING entity_editions.entity_record_id INTO _new_entity_record_id;

      RETURN QUERY
      UPDATE entity_versions
      SET decision_time = tstzrange(_decision_time, upper(entity_versions.decision_time), '[)'),
          transaction_time = tstzrange(now(), NULL, '[)'),
          entity_record_id = _new_entity_record_id
      WHERE entity_versions.owned_by_id = _owned_by_id
        AND entity_versions.entity_uuid = _entity_uuid
        AND entity_versions.decision_time @> _decision_time
        AND entity_versions.transaction_time @> now()
      RETURNING entity_versions.entity_record_id, entity_versions.decision_time, entity_versions.transaction_time;
    END
    $pga$
  VOLATILE
  LANGUAGE plpgsql;

CREATE FUNCTION "update_entity_version_trigger" ()
  RETURNS TRIGGER
  AS $pga$
    BEGIN
      SET CONSTRAINTS entity_versions_overlapping DEFERRED;

      -- Insert a new version with the old decision time and the system time up until now
      INSERT INTO entity_versions (
        owned_by_id,
        entity_uuid,
        entity_record_id,
        decision_time,
        transaction_time
      ) VALUES (
        OLD.owned_by_id,
        OLD.entity_uuid,
        OLD.entity_record_id,
        OLD.decision_time,
        tstzrange(lower(OLD.transaction_time),lower(NEW.transaction_time), '[)')
      );

      -- Insert a new version with the previous decision time until the new decision time
      INSERT INTO entity_versions (
        owned_by_id,
        entity_uuid,
        entity_record_id,
        decision_time,
        transaction_time
      ) VALUES (
        OLD.owned_by_id,
        OLD.entity_uuid,
        OLD.entity_record_id,
        tstzrange(lower(OLD.decision_time), lower(NEW.decision_time), '[)'),
        NEW.transaction_time
      );

      RETURN NEW;
    END$pga$
  VOLATILE
  LANGUAGE plpgsql;

CREATE TRIGGER "update_entity_version_trigger"
  BEFORE UPDATE ON "entity_versions"
  FOR EACH ROW
  EXECUTE PROCEDURE "update_entity_version_trigger"();
