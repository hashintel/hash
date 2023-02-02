CREATE
OR REPLACE FUNCTION create_ontology_id (
  "ontology_id" UUID,
  "base_uri" TEXT,
  "version" BIGINT
) RETURNS TABLE (_ontology_id UUID) AS $create_ontology_id$
BEGIN
  RETURN QUERY
  INSERT INTO ontology_ids (
    "ontology_id",
    "base_uri",
    "version",
    "transaction_time"
  ) VALUES (
    create_ontology_id.ontology_id,
    create_ontology_id.base_uri,
    create_ontology_id.version,
    tstzrange(now(), NULL, '[)')
  ) RETURNING ontology_ids.ontology_id;
  
END $create_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION update_ontology_id (
  "ontology_id" UUID,
  "base_uri" TEXT,
  "version" BIGINT
) RETURNS TABLE (_ontology_id UUID) AS $update_ontology_id$
BEGIN
  RETURN QUERY
  UPDATE ontology_ids
  SET
    "ontology_id" = update_ontology_id.ontology_id,
    "version" = update_ontology_id.version,
    "transaction_time" = tstzrange(now(), NULL, '[)')
  WHERE ontology_ids.base_uri = update_ontology_id.base_uri
    AND ontology_ids.transaction_time @> now()
  RETURNING update_ontology_id.ontology_id;
  
END $update_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION "update_ontology_ids_trigger" () RETURNS TRIGGER AS $update_ontology_ids_trigger$
BEGIN
  IF (OLD.version != NEW.version - 1) THEN
    RAISE EXCEPTION 'Not updating the latest id: % -> %', OLD.version, NEW.version
    USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO ontology_ids (
    "ontology_id",
    "base_uri",
    "version",
    "transaction_time"
  ) VALUES (
    NEW.ontology_id,
    NEW.base_uri,
    NEW.version,
    NEW.transaction_time
  );

  OLD.transaction_time = tstzrange(lower(OLD.transaction_time), lower(NEW.transaction_time), '[)');

  RETURN OLD;
END $update_ontology_ids_trigger$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE TRIGGER "update_ontology_ids_trigger" BEFORE
UPDATE
  ON "ontology_ids" FOR EACH ROW
EXECUTE
  PROCEDURE "update_ontology_ids_trigger" ();
