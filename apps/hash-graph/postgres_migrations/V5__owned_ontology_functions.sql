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
    "version" := create_owned_ontology_id.version
  );
  
  RETURN QUERY
  INSERT INTO ontology_owned_metadata (
    "ontology_id",
    "owned_by_id",
    "record_created_by_id"    
  ) VALUES (
    _ontology_id,
    create_owned_ontology_id.owned_by_id,
    create_owned_ontology_id.record_created_by_id
  ) RETURNING _ontology_id;
END $create_owned_ontology_id$ LANGUAGE plpgsql VOLATILE;

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
    "ontology_id" = _ontology_id,
    "record_created_by_id" = update_owned_ontology_id.record_created_by_id
  FROM ontology_ids
  WHERE ontology_ids.ontology_id = metadata.ontology_id
    AND ontology_ids.base_uri = update_owned_ontology_id.base_uri
    AND ontology_ids.transaction_time @> now()
  RETURNING _ontology_id, metadata.owned_by_id;

  PERFORM update_ontology_id(
    _ontology_id,
    update_owned_ontology_id.base_uri,
    update_owned_ontology_id.version
  );

  SET CONSTRAINTS ontology_owned_metadata_pk IMMEDIATE;
  SET CONSTRAINTS ontology_owned_metadata_fk IMMEDIATE;
  SET CONSTRAINTS ontology_ids_overlapping IMMEDIATE;
END $update_owned_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION "update_ontology_owned_metadata_trigger" () RETURNS TRIGGER AS $update_ontology_owned_metadata_trigger$
BEGIN
  INSERT INTO ontology_owned_metadata (
    "ontology_id", 
    "owned_by_id", 
    "record_created_by_id"
  ) VALUES (
    NEW.ontology_id,
    NEW.owned_by_id,
    NEW.record_created_by_id
  );
  
  RETURN OLD;
END $update_ontology_owned_metadata_trigger$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE TRIGGER "update_ontology_owned_metadata_trigger" BEFORE
UPDATE
  ON "ontology_owned_metadata" FOR EACH ROW
EXECUTE
  PROCEDURE "update_ontology_owned_metadata_trigger" ();
