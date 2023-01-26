CREATE
OR REPLACE FUNCTION create_type_id (
  "version_id" UUID,
  "base_uri" TEXT,
  "version" BIGINT
) RETURNS TABLE (_version_id UUID) AS $create_type_id$
BEGIN

  RETURN QUERY
  INSERT INTO type_ids (
    "version_id",
    "base_uri",
    "version",
    "transaction_time"
  ) VALUES (
    create_type_id.version_id,
    create_type_id.base_uri,
    create_type_id.version,
    tstzrange(now(), NULL, '[)')
  ) RETURNING type_ids.version_id;
  
END $create_type_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION update_type_id (
  "version_id" UUID,
  "base_uri" TEXT,
  "version" BIGINT
) RETURNS TABLE (_version_id UUID) AS $update_type_id$
BEGIN

  RETURN QUERY
  UPDATE type_ids
  SET
    "version_id" = update_type_id.version_id,
    "version" = update_type_id.version,
    "transaction_time" = tstzrange(now(), NULL, '[)')
  WHERE type_ids.base_uri = update_type_id.base_uri
    AND type_ids.transaction_time @> now()
  RETURNING update_type_id.version_id;
  
END $update_type_id$ LANGUAGE plpgsql VOLATILE;

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

  OLD.transaction_time = tstzrange(lower(OLD.transaction_time), lower(NEW.transaction_time), '[)');

  RETURN OLD;
END $update_type_ids_trigger$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE TRIGGER "update_type_ids_trigger" BEFORE
UPDATE
  ON "type_ids" FOR EACH ROW
EXECUTE
  PROCEDURE "update_type_ids_trigger" ();
