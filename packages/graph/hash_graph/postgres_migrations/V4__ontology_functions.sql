CREATE
OR REPLACE FUNCTION create_ontology_id (
  "base_uri" TEXT,
  "version" BIGINT,
  "owned_by_id" UUID,
  "updated_by_id" UUID
) RETURNS UUID AS $create_ontology_id$
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

  INSERT INTO type_ids (
    "base_uri",
    "version",
    "version_id",
    "owned_by_id",
    "updated_by_id"
  ) VALUES (
    create_ontology_id.base_uri,
    create_ontology_id.version,
    _version_id,
    create_ontology_id.owned_by_id,
    create_ontology_id.updated_by_id
  );

  RETURN _version_id;
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

  RETURN QUERY
  UPDATE type_ids
  SET
    "version" = update_ontology_id.version,
    "version_id" = _version_id,
    "updated_by_id" = update_ontology_id.updated_by_id
  WHERE type_ids.base_uri = update_ontology_id.base_uri
    AND type_ids.version = update_ontology_id.version - 1
  RETURNING type_ids.version_id, type_ids.owned_by_id;

  SET CONSTRAINTS type_ids_pkey IMMEDIATE;
  SET CONSTRAINTS type_id_unique IMMEDIATE;
END $update_ontology_id$ VOLATILE LANGUAGE plpgsql;

CREATE
OR REPLACE FUNCTION "update_type_ids_trigger" () RETURNS TRIGGER AS $pga$
    BEGIN
      INSERT INTO type_ids (
        "base_uri",
        "version",
        "version_id",
        "owned_by_id",
        "updated_by_id"
      ) VALUES (
        OLD.base_uri,
        OLD.version,
        OLD.version_id,
        OLD.owned_by_id,
        OLD.updated_by_id
      );

      RETURN NEW;
    END$pga$ VOLATILE LANGUAGE plpgsql;

CREATE
OR REPLACE TRIGGER "update_type_ids_trigger" BEFORE
UPDATE
  ON "type_ids" FOR EACH ROW
EXECUTE
  PROCEDURE "update_type_ids_trigger" ();
