CREATE
OR REPLACE FUNCTION create_ontology_id (
  "base_uri" TEXT,
  "version" BIGINT,
  "owned_by_id" UUID,
  "updated_by_id" UUID
) RETURNS TABLE (version_id UUID) AS $create_ontology_id$
DECLARE
  "_version_id" UUID;
BEGIN
  _version_id := gen_random_uuid();

  INSERT INTO type_ids (
    "version_id",
    "base_uri",
    "version",
    "transaction_time"
  ) VALUES (
    _version_id,
    create_ontology_id.base_uri,
    create_ontology_id.version,
    tstzrange(now(), NULL, '[)')
  );
  
  INSERT INTO owned_ontology_metadata (
    "version_id",
    "owned_by_id",
    "updated_by_id"    
  ) VALUES (
    _version_id,
    create_ontology_id.owned_by_id,
    create_ontology_id.updated_by_id
  );

  version_id := _version_id;
  RETURN NEXT;
  RETURN;
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

  UPDATE owned_ontology_metadata as metadata
  SET
    "updated_by_id" = update_ontology_id.updated_by_id
  FROM type_ids
  WHERE type_ids.version_id = metadata.version_id
    AND type_ids.base_uri = update_ontology_id.base_uri
    AND type_ids.transaction_time @> now();

  RETURN QUERY
  UPDATE type_ids
  SET
    "version_id" = _version_id,
    "version" = update_ontology_id.version,
    "transaction_time" = tstzrange(now(), NULL, '[)')
  FROM owned_ontology_metadata as metadata
  WHERE type_ids.version_id = metadata.version_id
    AND type_ids.base_uri = update_ontology_id.base_uri
    AND type_ids.transaction_time @> now()
  RETURNING _version_id, metadata.owned_by_id;

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
    "transaction_time"
  ) VALUES (
    NEW.version_id,
    NEW.base_uri,
    NEW.version,
    NEW.transaction_time
  );

  INSERT INTO
    owned_ontology_metadata ("version_id", "owned_by_id", "updated_by_id")
  SELECT
    NEW.version_id,
    metadata.owned_by_id,
    metadata.updated_by_id
  FROM
    owned_ontology_metadata AS metadata
  WHERE
    metadata.version_id = OLD.version_id;


  OLD.transaction_time = tstzrange(lower(OLD.transaction_time), lower(NEW.transaction_time), '[)');

  RETURN OLD;
END $update_type_ids_trigger$ VOLATILE LANGUAGE plpgsql;

CREATE
OR REPLACE TRIGGER "update_type_ids_trigger" BEFORE
UPDATE
  ON "type_ids" FOR EACH ROW
EXECUTE
  PROCEDURE "update_type_ids_trigger" ();
