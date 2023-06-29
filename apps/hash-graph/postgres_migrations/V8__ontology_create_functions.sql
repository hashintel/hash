DROP FUNCTION
  create_ontology_id (
    "ontology_id" UUID,
    "base_url" TEXT,
    "version" BIGINT,
    "record_created_by_id" UUID
  );

DROP FUNCTION
  create_owned_ontology_id (
    "base_url" TEXT,
    "version" BIGINT,
    "record_created_by_id" UUID,
    "owned_by_id" UUID
  );

DROP FUNCTION
  create_external_ontology_id (
    "base_url" TEXT,
    "version" BIGINT,
    "record_created_by_id" UUID,
    "fetched_at" TIMESTAMP WITH TIME ZONE
  );

CREATE FUNCTION
  create_ontology_id (
    "base_url" TEXT,
    "version" BIGINT,
    "record_created_by_id" UUID,
    "resume_on_conflict" BOOLEAN,
    "is_external" BOOLEAN
  ) RETURNS TABLE (ontology_id UUID) AS $create_owned_ontology_id$
BEGIN
  BEGIN
    INSERT INTO base_urls (
      "base_url"
    ) VALUES (
      create_ontology_id.base_url
    );
  EXCEPTION WHEN unique_violation THEN
    IF is_external THEN
      -- External ontology types are allowed to have the same base_url as long as the existing base_url is external as
      -- well.
      IF NOT EXISTS (SELECT FROM ontology_ids NATURAL JOIN ontology_external_metadata WHERE ontology_ids.base_url = create_ontology_id.base_url) THEN
        RAISE EXCEPTION 'Owned ontology with base_url `%` already exists',
          create_ontology_id.base_url
        USING ERRCODE = 'invalid_parameter_value';
      END IF;
    ELSIF resume_on_conflict THEN
      -- If resume_on_conflict is TRUE, we allow the same base_url to be used for multiple ontologies as long as the
      -- existing base_url is owned as well.
      IF NOT EXISTS (SELECT FROM ontology_ids NATURAL JOIN ontology_owned_metadata WHERE ontology_ids.base_url = create_ontology_id.base_url) THEN
        RAISE EXCEPTION 'External ontology with base_url `%` already exists',
          create_ontology_id.base_url
        USING ERRCODE = 'invalid_parameter_value';
      END IF;
    ELSE
      RAISE EXCEPTION 'Base URL `%` already exists',
        create_ontology_id.base_url
      USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END;

  BEGIN
    RETURN QUERY
    INSERT INTO ontology_ids (
      "ontology_id",
      "base_url",
      "version",
      "record_created_by_id",
      "transaction_time"
    ) VALUES (
      gen_random_uuid(),
      create_ontology_id.base_url,
      create_ontology_id.version,
      create_ontology_id.record_created_by_id,
      tstzrange(now(), NULL, '[)')
    ) RETURNING ontology_ids.ontology_id;
  EXCEPTION WHEN unique_violation THEN
    IF resume_on_conflict THEN
      RETURN QUERY
      SELECT ontology_ids.ontology_id
      FROM ontology_ids
      WHERE ontology_ids.base_url = create_ontology_id.base_url
        AND ontology_ids.version = create_ontology_id.version;
    ELSE
      RAISE EXCEPTION 'Versioned URL `%v/%` already exists',
        create_ontology_id.base_url,
        create_ontology_id.version
      USING ERRCODE = 'unique_violation';
    END IF;
  END;
END $create_owned_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE FUNCTION
  create_owned_ontology_id (
    "base_url" TEXT,
    "version" BIGINT,
    "record_created_by_id" UUID,
    "owned_by_id" UUID,
    "resume_on_conflict" BOOLEAN
  ) RETURNS TABLE (ontology_id UUID) AS $create_owned_ontology_id$
DECLARE
  "_ontology_id" UUID;
BEGIN
  SELECT create_ontology_id.ontology_id
  FROM create_ontology_id(
    "base_url" := create_owned_ontology_id.base_url,
    "version" := create_owned_ontology_id.version,
    "record_created_by_id" := create_owned_ontology_id.record_created_by_id,
    "resume_on_conflict" := create_owned_ontology_id.resume_on_conflict,
    "is_external" := FALSE
  ) INTO _ontology_id;

  INSERT INTO ontology_owned_metadata (
    "ontology_id",
    "owned_by_id"
  ) VALUES (
    _ontology_id,
    create_owned_ontology_id.owned_by_id
  )
  ON CONFLICT DO NOTHING;

  RETURN QUERY
  SELECT _ontology_id AS ontology_id;
END $create_owned_ontology_id$ LANGUAGE plpgsql VOLATILE;

CREATE FUNCTION
  create_external_ontology_id (
    "base_url" TEXT,
    "version" BIGINT,
    "record_created_by_id" UUID,
    "fetched_at" TIMESTAMP WITH TIME ZONE,
    "resume_on_conflict" BOOLEAN
  ) RETURNS TABLE (ontology_id UUID) AS $create_owned_ontology_id$
DECLARE
  "_ontology_id" UUID;
BEGIN
  SELECT create_ontology_id.ontology_id
  FROM create_ontology_id(
    "base_url" := create_external_ontology_id.base_url,
    "version" := create_external_ontology_id.version,
    "record_created_by_id" := create_external_ontology_id.record_created_by_id,
    "resume_on_conflict" := create_external_ontology_id.resume_on_conflict,
    "is_external" := TRUE
  ) INTO _ontology_id;

  INSERT INTO ontology_external_metadata (
    "ontology_id",
    "fetched_at"
  ) VALUES (
    _ontology_id,
    create_external_ontology_id.fetched_at
  )
  ON CONFLICT DO NOTHING;

  RETURN QUERY
  SELECT _ontology_id AS ontology_id;
END $create_owned_ontology_id$ LANGUAGE plpgsql VOLATILE;
