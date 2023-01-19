CREATE
OR REPLACE FUNCTION create_ontology_id (
  "base_uri" TEXT,
  "version" BIGINT,
  "owned_by_id" UUID,
  "updated_by_id" UUID
) RETURNS TABLE (version_id UUID) AS $create_ontology_id$
DECLARE
  _version_id UUID;
BEGIN
  INSERT INTO "base_uris" (
    base_uri
  ) VALUES (
    create_ontology_id.base_uri
  );

  INSERT INTO version_ids (
    version_id
  ) VALUES (
    gen_random_uuid()
  ) RETURNING version_ids.version_id INTO _version_id;

  RETURN QUERY
  INSERT INTO type_ids (
    "base_uri",
    "version",
    "version_id",
    "owned_by_id",
    "updated_by_id",
    "transaction_time"
  ) VALUES (
    create_ontology_id.base_uri,
    create_ontology_id.version,
    _version_id,
    create_ontology_id.owned_by_id,
    create_ontology_id.updated_by_id,
    tstzrange(now(), NULL, '[)')
  ) RETURNING type_ids.version_id;
END $create_ontology_id$ VOLATILE LANGUAGE plpgsql;

CREATE
OR REPLACE FUNCTION update_ontology_id (
  "base_uri" TEXT,
  "version" BIGINT,
  "updated_by_id" UUID
) RETURNS TABLE (version_id UUID, owned_by_id UUID) AS $update_ontology_id$
DECLARE
  _version_id UUID;
BEGIN
  INSERT INTO version_ids (
    version_id
  ) VALUES (
    gen_random_uuid()
  ) RETURNING version_ids.version_id INTO _version_id;

  SET CONSTRAINTS type_ids_pkey DEFERRED;
  SET CONSTRAINTS type_id_unique DEFERRED;
  SET CONSTRAINTS type_ids_overlapping DEFERRED;

  RETURN QUERY
  UPDATE type_ids
  SET
    "transaction_time" = tstzrange(now(), NULL, '[)'),
    "version" = update_ontology_id.version,
    "version_id" = _version_id,
    "updated_by_id" = update_ontology_id.updated_by_id
  WHERE type_ids.base_uri = update_ontology_id.base_uri
    AND type_ids.transaction_time @> now()
  RETURNING type_ids.version_id, type_ids.owned_by_id;

  SET CONSTRAINTS type_ids_pkey IMMEDIATE;
  SET CONSTRAINTS type_id_unique IMMEDIATE;
  SET CONSTRAINTS type_ids_overlapping IMMEDIATE;
END $update_ontology_id$ VOLATILE LANGUAGE plpgsql;

CREATE
OR REPLACE FUNCTION "update_type_ids_trigger" () RETURNS TRIGGER AS $pga$
    BEGIN
      IF (OLD.version != NEW.version - 1) THEN
        RAISE EXCEPTION 'Not updating the latest id: % -> %', OLD.version, NEW.version
        USING ERRCODE = 'invalid_parameter_value';
      END IF;

      INSERT INTO type_ids (
        "base_uri",
        "version",
        "version_id",
        "owned_by_id",
        "updated_by_id",
        "transaction_time"
      ) VALUES (
        OLD.base_uri,
        OLD.version,
        OLD.version_id,
        OLD.owned_by_id,
        OLD.updated_by_id,
        tstzrange(lower(OLD.transaction_time), lower(NEW.transaction_time), '[)')
      );

      RETURN NEW;
    END$pga$ VOLATILE LANGUAGE plpgsql;

CREATE
OR REPLACE TRIGGER "update_type_ids_trigger" BEFORE
UPDATE
  ON "type_ids" FOR EACH ROW
EXECUTE
  PROCEDURE "update_type_ids_trigger" ();
