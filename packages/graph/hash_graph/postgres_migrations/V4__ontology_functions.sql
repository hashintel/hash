CREATE
OR REPLACE FUNCTION create_ontology_id (
  "base_uri" TEXT,
  "version" BIGINT,
  "owned_by_id" UUID,
  "updated_by_id" UUID
) RETURNS TABLE (version_id UUID) AS $create_ontology_id$
BEGIN
  RETURN QUERY
  INSERT INTO type_ids (
    "version_id",
    "base_uri",
    "version",
    "owned_by_id",
    "updated_by_id",
    "transaction_time"
  ) VALUES (
    gen_random_uuid(),
    create_ontology_id.base_uri,
    create_ontology_id.version,
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
  "_version_id" UUID;
BEGIN
  SET CONSTRAINTS type_ids_overlapping DEFERRED;

  _version_id := gen_random_uuid();

  RETURN QUERY
  UPDATE type_ids
  SET
    "version_id" = _version_id,
    "version" = update_ontology_id.version,
    "updated_by_id" = update_ontology_id.updated_by_id,
    "transaction_time" = tstzrange(now(), NULL, '[)')
  WHERE type_ids.base_uri = update_ontology_id.base_uri
    AND type_ids.transaction_time @> now()
  RETURNING _version_id, type_ids.owned_by_id;

  SET CONSTRAINTS type_ids_overlapping IMMEDIATE;
END $update_ontology_id$ VOLATILE LANGUAGE plpgsql;

CREATE
OR REPLACE FUNCTION "update_type_ids_trigger" () RETURNS TRIGGER AS $update_type_ids_trigger$
BEGIN
  IF (OLD.version != NEW.version - 1) THEN
    RAISE EXCEPTION 'Not updating the latest id: % -> %', OLD.version, NEW.version
    USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO type_ids (
    "version_id",
    "base_uri",
    "version",
    "owned_by_id",
    "updated_by_id",
    "transaction_time"
  ) VALUES (
    NEW.version_id,
    NEW.base_uri,
    NEW.version,
    NEW.owned_by_id,
    NEW.updated_by_id,
    NEW.transaction_time
  );

  OLD.transaction_time = tstzrange(lower(OLD.transaction_time), lower(NEW.transaction_time), '[)');

  RETURN OLD;
END $update_type_ids_trigger$ VOLATILE LANGUAGE plpgsql;

CREATE
OR REPLACE TRIGGER "update_type_ids_trigger" BEFORE
UPDATE
  ON "type_ids" FOR EACH ROW
EXECUTE
  PROCEDURE "update_type_ids_trigger" ();
