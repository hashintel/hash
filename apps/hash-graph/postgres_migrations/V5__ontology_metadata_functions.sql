CREATE
OR REPLACE FUNCTION create_owned_ontology_id (
  "base_uri" TEXT,
  "version" BIGINT,
  "owned_by_id" UUID,
  "record_created_by_id" UUID
) RETURNS TABLE (ontology_id UUID) AS $create_owned_ontology_id$
DECLARE
  "_ontology_id" UUID;
BEGIN
  _ontology_id := gen_random_uuid();

  PERFORM create_ontology_id(
    "ontology_id" := _ontology_id,
    "base_uri" := create_owned_ontology_id.base_uri,
    "version" := create_owned_ontology_id.version,
    "record_created_by_id" := create_owned_ontology_id.record_created_by_id
  );
  
  RETURN QUERY
  INSERT INTO ontology_owned_metadata (
    "ontology_id",
    "owned_by_id"
  ) VALUES (
    _ontology_id,
    create_owned_ontology_id.owned_by_id
  ) RETURNING _ontology_id;
END $create_owned_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION create_external_ontology_id (
  "base_uri" TEXT,
  "version" BIGINT,
  "record_created_by_id" UUID,
  "fetched_at" TIMESTAMP WITH TIME ZONE
) RETURNS TABLE (ontology_id UUID) AS $create_external_ontology_id$
DECLARE
  "_ontology_id" UUID;
BEGIN
  _ontology_id := gen_random_uuid();

  PERFORM create_ontology_id(
    "ontology_id" := _ontology_id,
    "base_uri" := create_external_ontology_id.base_uri,
    "version" := create_external_ontology_id.version,
    "record_created_by_id" := create_external_ontology_id.record_created_by_id
  );

  RETURN QUERY
  INSERT INTO ontology_external_metadata (
    "ontology_id",
    "fetched_at"
  ) VALUES (
    _ontology_id,
    create_external_ontology_id.fetched_at
  ) RETURNING _ontology_id;
END $create_external_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION update_owned_ontology_id (
  "base_uri" TEXT,
  "version" BIGINT,
  "record_created_by_id" UUID
) RETURNS TABLE (ontology_id UUID, owned_by_id UUID) AS $update_owned_ontology_id$
DECLARE
  "_ontology_id" UUID;
BEGIN
  SET CONSTRAINTS ontology_owned_metadata_pk DEFERRED;
  SET CONSTRAINTS ontology_owned_metadata_fk DEFERRED;
  SET CONSTRAINTS ontology_ids_overlapping DEFERRED;

  _ontology_id := gen_random_uuid();

  RETURN QUERY
  UPDATE ontology_owned_metadata as metadata
  SET
    "ontology_id" = _ontology_id
  FROM ontology_ids
  WHERE ontology_ids.ontology_id = metadata.ontology_id
    AND ontology_ids.base_uri = update_owned_ontology_id.base_uri
    AND ontology_ids.transaction_time @> now()
  RETURNING _ontology_id, metadata.owned_by_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No owned ontology type with base_uri % does not exist', update_owned_ontology_id.base_uri
    USING ERRCODE = 'restrict_violation';
  END IF;

  PERFORM update_ontology_id(
    _ontology_id,
    update_owned_ontology_id.base_uri,
    update_owned_ontology_id.version,
    update_owned_ontology_id.record_created_by_id
  );

  SET CONSTRAINTS ontology_owned_metadata_pk IMMEDIATE;
  SET CONSTRAINTS ontology_owned_metadata_fk IMMEDIATE;
  SET CONSTRAINTS ontology_ids_overlapping IMMEDIATE;
END $update_owned_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION update_external_ontology_id (
  "base_uri" TEXT,
  "version" BIGINT,
  "record_created_by_id" UUID,
  "fetched_at" TIMESTAMP WITH TIME ZONE
) RETURNS TABLE (ontology_id UUID) AS $update_external_ontology_id$
DECLARE
  "_ontology_id" UUID;
BEGIN
  SET CONSTRAINTS ontology_external_metadata_pk DEFERRED;
  SET CONSTRAINTS ontology_external_metadata_fk DEFERRED;
  SET CONSTRAINTS ontology_ids_overlapping DEFERRED;

  _ontology_id := gen_random_uuid();

  RETURN QUERY
  UPDATE ontology_external_metadata as metadata
  SET
    "ontology_id" = _ontology_id,
    "fetched_at" = update_external_ontology_id.fetched_at
  FROM ontology_ids
  WHERE ontology_ids.ontology_id = metadata.ontology_id
    AND ontology_ids.base_uri = update_external_ontology_id.base_uri
    AND ontology_ids.transaction_time @> now()
  RETURNING metadata.ontology_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No external ontology type with base_uri % does not exist', update_external_ontology_id.base_uri
    USING ERRCODE = 'restrict_violation';
  END IF;

  PERFORM update_ontology_id(
    _ontology_id,
    update_external_ontology_id.base_uri,
    update_external_ontology_id.version,
    update_external_ontology_id.record_created_by_id
  );

  SET CONSTRAINTS ontology_external_metadata_pk IMMEDIATE;
  SET CONSTRAINTS ontology_external_metadata_fk IMMEDIATE;
  SET CONSTRAINTS ontology_ids_overlapping IMMEDIATE;
END $update_external_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION "update_owned_ontology_metadata_trigger" () RETURNS TRIGGER AS $update_owned_ontology_metadata_trigger$
BEGIN
  INSERT INTO ontology_owned_metadata (
    "ontology_id", 
    "owned_by_id"
  ) VALUES (
    NEW.ontology_id,
    NEW.owned_by_id
  );
  
  RETURN OLD;
END $update_owned_ontology_metadata_trigger$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE TRIGGER "update_owned_ontology_metadata_trigger" BEFORE
UPDATE
  ON "ontology_owned_metadata" FOR EACH ROW
EXECUTE
  PROCEDURE "update_owned_ontology_metadata_trigger" ();

CREATE
OR REPLACE FUNCTION "update_external_ontology_metadata_trigger" () RETURNS TRIGGER AS $update_external_ontology_metadata_trigger$
BEGIN
  INSERT INTO ontology_external_metadata (
    "ontology_id",
    "fetched_at"
  ) VALUES (
    NEW.ontology_id,
    NEW.fetched_at
  );

  RETURN OLD;
END $update_external_ontology_metadata_trigger$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE TRIGGER "update_external_ontology_metadata_trigger" BEFORE
UPDATE
  ON "ontology_external_metadata" FOR EACH ROW
EXECUTE
  PROCEDURE "update_external_ontology_metadata_trigger" ();
