CREATE
OR REPLACE FUNCTION create_owned_ontology_id (
  "base_uri" TEXT,
  "version" BIGINT,
  "owned_by_id" UUID,
  "updated_by_id" UUID
) RETURNS TABLE (version_id UUID) AS $create_owned_ontology_id$
DECLARE
  "_version_id" UUID;
BEGIN
  _version_id := gen_random_uuid();

  PERFORM create_type_id(
    "version_id" := _version_id,
    "base_uri" := create_owned_ontology_id.base_uri,
    "version" := create_owned_ontology_id.version
  );
  
  RETURN QUERY
  INSERT INTO owned_ontology_metadata (
    "version_id",
    "owned_by_id",
    "updated_by_id"    
  ) VALUES (
    _version_id,
    create_owned_ontology_id.owned_by_id,
    create_owned_ontology_id.updated_by_id
  ) RETURNING _version_id;
END $create_owned_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION update_owned_ontology_id (
  "base_uri" TEXT,
  "version" BIGINT,
  "updated_by_id" UUID
) RETURNS TABLE (version_id UUID, owned_by_id UUID) AS $update_owned_ontology_id$
DECLARE
  "_version_id" UUID;
BEGIN
  SET CONSTRAINTS owned_ontology_metadata_pk DEFERRED;
  SET CONSTRAINTS owned_ontology_metadata_fk DEFERRED;
  SET CONSTRAINTS type_ids_overlapping DEFERRED;

  _version_id := gen_random_uuid();

  RETURN QUERY
  UPDATE owned_ontology_metadata as metadata
  SET
    "version_id" = _version_id,
    "updated_by_id" = update_owned_ontology_id.updated_by_id
  FROM type_ids
  WHERE type_ids.version_id = metadata.version_id
    AND type_ids.base_uri = update_owned_ontology_id.base_uri
    AND type_ids.transaction_time @> now()
  RETURNING _version_id, metadata.owned_by_id;

  PERFORM update_type_id(
    _version_id,
    update_owned_ontology_id.base_uri,
    update_owned_ontology_id.version
  );

  SET CONSTRAINTS owned_ontology_metadata_pk IMMEDIATE;
  SET CONSTRAINTS owned_ontology_metadata_fk IMMEDIATE;
  SET CONSTRAINTS type_ids_overlapping IMMEDIATE;
END $update_owned_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE FUNCTION "update_owned_ontology_metadata_trigger" () RETURNS TRIGGER AS $update_owned_ontology_metadata_trigger$
BEGIN
  INSERT INTO owned_ontology_metadata (
    "version_id", 
    "owned_by_id", 
    "updated_by_id"
  ) VALUES (
    NEW.version_id,
    NEW.owned_by_id,
    NEW.updated_by_id
  );
  
  RETURN OLD;
END $update_owned_ontology_metadata_trigger$ LANGUAGE plpgsql VOLATILE;

CREATE
OR REPLACE TRIGGER "update_owned_ontology_metadata_trigger" BEFORE
UPDATE
  ON "owned_ontology_metadata" FOR EACH ROW
EXECUTE
  PROCEDURE "update_owned_ontology_metadata_trigger" ();
