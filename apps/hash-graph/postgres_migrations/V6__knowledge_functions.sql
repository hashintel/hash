CREATE
OR REPLACE FUNCTION "create_entity" (
  "_owned_by_id" UUID,
  "_entity_uuid" UUID,
  "_decision_time" TIMESTAMP WITH TIME ZONE,
  "_updated_by_id" UUID,
  "_archived" BOOLEAN,
  "_entity_type_ontology_id" UUID,
  "_properties" JSONB,
  "_left_owned_by_id" UUID,
  "_left_entity_uuid" UUID,
  "_right_owned_by_id" UUID,
  "_right_entity_uuid" UUID,
  "_left_to_right_order" INTEGER,
  "_right_to_left_order" INTEGER
) RETURNS TABLE (
  entity_revision_id BIGINT,
  decision_time tstzrange,
  transaction_time tstzrange
) AS $pga$
    DECLARE
      _entity_revision_id BIGINT;
    BEGIN
      IF _decision_time IS NULL THEN _decision_time := now(); END IF;

      INSERT INTO entity_ids (
        owned_by_id,
        entity_uuid,
        left_owned_by_id,
        left_entity_uuid,
        right_owned_by_id,
        right_entity_uuid
      ) VALUES (
        _owned_by_id,
        _entity_uuid,
        _left_owned_by_id,
        _left_entity_uuid,
        _right_owned_by_id,
        _right_entity_uuid
      );

      -- insert the data of the entity
      INSERT INTO entity_revisions (
        updated_by_id,
        archived,
        entity_type_ontology_id,
        properties,
        left_to_right_order,
        right_to_left_order
      ) VALUES (
        _updated_by_id,
        _archived,
        _entity_type_ontology_id,
        _properties,
        _left_to_right_order,
        _right_to_left_order
      ) RETURNING entity_revisions.entity_revision_id INTO _entity_revision_id;

      RETURN QUERY
      INSERT INTO entity_versions (
        owned_by_id,
        entity_uuid,
        entity_revision_id,
        decision_time,
        transaction_time
      ) VALUES (
        _owned_by_id,
        _entity_uuid,
        _entity_revision_id,
        tstzrange(_decision_time, NULL, '[)'),
        tstzrange(now(), NULL, '[)')
      ) RETURNING entity_versions.entity_revision_id, entity_versions.decision_time, entity_versions.transaction_time;
    END
    $pga$ VOLATILE LANGUAGE plpgsql;

CREATE
OR REPLACE FUNCTION "update_entity" (
  "_owned_by_id" UUID,
  "_entity_uuid" UUID,
  "_decision_time" TIMESTAMP WITH TIME ZONE,
  "_updated_by_id" UUID,
  "_archived" BOOLEAN,
  "_entity_type_ontology_id" UUID,
  "_properties" JSONB,
  "_left_to_right_order" INTEGER,
  "_right_to_left_order" INTEGER
) RETURNS TABLE (
  entity_revision_id BIGINT,
  decision_time tstzrange,
  transaction_time tstzrange
) AS $pga$
    DECLARE
      _new_entity_revision_id BIGINT;
    BEGIN
      IF _decision_time IS NULL THEN _decision_time := now(); END IF;

      INSERT INTO entity_revisions (
        updated_by_id,
        archived,
        entity_type_ontology_id,
        properties,
        left_to_right_order,
        right_to_left_order
      ) VALUES (
        _updated_by_id,
        _archived,
        _entity_type_ontology_id,
        _properties,
        _left_to_right_order,
        _right_to_left_order
      )
      RETURNING entity_revisions.entity_revision_id INTO _new_entity_revision_id;

      RETURN QUERY
      UPDATE entity_versions
      SET decision_time = tstzrange(_decision_time, upper(entity_versions.decision_time), '[)'),
          transaction_time = tstzrange(now(), NULL, '[)'),
          entity_revision_id = _new_entity_revision_id
      WHERE entity_versions.owned_by_id = _owned_by_id
        AND entity_versions.entity_uuid = _entity_uuid
        AND entity_versions.decision_time @> _decision_time
        AND entity_versions.transaction_time @> now()
      RETURNING entity_versions.entity_revision_id, entity_versions.decision_time, entity_versions.transaction_time;
    END
    $pga$ VOLATILE LANGUAGE plpgsql;

CREATE
OR REPLACE FUNCTION "update_entity_version_trigger" () RETURNS TRIGGER AS $pga$
    BEGIN
      SET CONSTRAINTS entity_versions_overlapping DEFERRED;

      -- Insert a new version with the old decision time and the system time up until now
      INSERT INTO entity_versions (
        owned_by_id,
        entity_uuid,
        entity_revision_id,
        decision_time,
        transaction_time
      ) VALUES (
        OLD.owned_by_id,
        OLD.entity_uuid,
        OLD.entity_revision_id,
        OLD.decision_time,
        tstzrange(lower(OLD.transaction_time),lower(NEW.transaction_time), '[)')
      );

      -- Insert a new version with the previous decision time until the new decision time
      INSERT INTO entity_versions (
        owned_by_id,
        entity_uuid,
        entity_revision_id,
        decision_time,
        transaction_time
      ) VALUES (
        OLD.owned_by_id,
        OLD.entity_uuid,
        OLD.entity_revision_id,
        tstzrange(lower(OLD.decision_time), lower(NEW.decision_time), '[)'),
        NEW.transaction_time
      );

      RETURN NEW;
    END$pga$ VOLATILE LANGUAGE plpgsql;

CREATE
OR REPLACE TRIGGER "update_entity_version_trigger" BEFORE
UPDATE
  ON "entity_versions" FOR EACH ROW
EXECUTE
  PROCEDURE "update_entity_version_trigger" ();
