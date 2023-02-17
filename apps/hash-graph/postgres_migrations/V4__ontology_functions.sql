CREATE
OR REPLACE FUNCTION create_ontology_id (
  "ontology_id" UUID,
  "base_uri" TEXT,
  "version" BIGINT,
  "record_created_by_id" UUID
) RETURNS TABLE (_ontology_id UUID) AS $create_ontology_id$
BEGIN
  RETURN QUERY
  INSERT INTO ontology_ids (
    "ontology_id",
    "base_uri",
    "version",
    "record_created_by_id",
    "transaction_time"
  ) VALUES (
    create_ontology_id.ontology_id,
    create_ontology_id.base_uri,
    create_ontology_id.version,
    create_ontology_id.record_created_by_id,
    tstzrange(now(), NULL, '[)')
  ) RETURNING ontology_ids.ontology_id;
  
END $create_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION update_ontology_id (
  "ontology_id" UUID,
  "base_uri" TEXT,
  "version" BIGINT,
  "version_to_update" BIGINT,
  "record_created_by_id" UUID
) RETURNS TABLE (_ontology_id UUID) AS $update_ontology_id$
BEGIN
  RETURN QUERY
  UPDATE ontology_ids
  SET
    "ontology_id" = update_ontology_id.ontology_id,
    "version" = update_ontology_id.version,
    "record_created_by_id" = update_ontology_id.record_created_by_id
  WHERE ontology_ids.base_uri = update_ontology_id.base_uri
    AND ontology_ids.version = update_ontology_id.version_to_update
  RETURNING update_ontology_id.ontology_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tried to update ontology type with base_uri `%` from version `%` to version `%` but it does not exist',
      update_ontology_id.base_uri,
      update_ontology_id.version_to_update,
      update_ontology_id.version
    USING ERRCODE = 'invalid_parameter_value';
  END IF;
  
END $update_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION "update_ontology_ids_trigger" () RETURNS TRIGGER AS $update_ontology_ids_trigger$
BEGIN
  INSERT INTO ontology_ids (
    "ontology_id",
    "base_uri",
    "version",
    "record_created_by_id",
    "transaction_time"
  ) VALUES (
    NEW.ontology_id,
    NEW.base_uri,
    NEW.version,
    NEW.record_created_by_id,
    NEW.transaction_time
  );

  RETURN OLD;
END $update_ontology_ids_trigger$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE TRIGGER "update_ontology_ids_trigger" BEFORE
UPDATE
  ON "ontology_ids" FOR EACH ROW
EXECUTE
  PROCEDURE "update_ontology_ids_trigger" ();
