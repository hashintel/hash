import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";
import { stripNewLines } from "../util";

export const shorthands: ColumnDefinitions | undefined = undefined;

export const up = (pgm: MigrationBuilder): void => {
  pgm.createExtension("btree_gist", { ifNotExists: true });

  pgm.createTable(
    "accounts",
    {
      account_id: {
        type: "UUID",
        primaryKey: true,
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "base_uris",
    {
      base_uri: {
        type: "TEXT",
        primaryKey: true,
      },
    },
    {
      ifNotExists: true,
    },
  );

  /**
   * @todo - rename this to type_internal_version_ids or something to distinguish it from versioned URIs and from
   *   entity ids - https://app.asana.com/0/1202805690238892/1203214689883089/f
   */
  pgm.createTable(
    "version_ids",
    {
      version_id: {
        type: "UUID",
        primaryKey: true,
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "type_ids",
    {
      base_uri: {
        type: "TEXT",
        notNull: true,
        references: "base_uris",
      },
      version: {
        type: "BIGINT",
        notNull: true,
      },
      version_id: {
        type: "UUID",
        references: "version_ids",
      },
    },
    {
      ifNotExists: true,
      comment: stripNewLines(`
        This table is a boundary to define the actual identification scheme for our kinds of types.
        Assume that we use the UUIDs on the types to look up more specific ID details.
        `),
    },
  );
  pgm.addConstraint("type_ids", "type_ids_primary_key", {
    primaryKey: ["base_uri", "version"],
  });

  pgm.createTable(
    "data_types",
    {
      version_id: {
        type: "UUID",
        primaryKey: true,
        references: "version_ids",
      },
      schema: {
        type: "JSONB",
        notNull: true,
      },
      owned_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      updated_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "property_types",
    {
      version_id: {
        type: "UUID",
        primaryKey: true,
        references: "version_ids",
      },
      schema: {
        type: "JSONB",
        notNull: true,
      },
      owned_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      updated_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "entity_types",
    {
      version_id: {
        type: "UUID",
        primaryKey: true,
        references: "version_ids",
      },
      schema: {
        type: "JSONB",
        notNull: true,
      },
      owned_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      updated_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "property_type_property_type_references",
    {
      source_property_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "property_types",
      },
      target_property_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "property_types",
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "property_type_data_type_references",
    {
      source_property_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "property_types",
      },
      target_data_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "data_types",
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "entity_type_property_type_references",
    {
      source_entity_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "entity_types",
      },
      target_property_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "property_types",
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "entity_type_entity_type_references",
    {
      source_entity_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "entity_types",
      },
      target_entity_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "entity_types",
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "entity_ids",
    {
      owned_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      entity_uuid: {
        type: "UUID",
        notNull: true,
      },
      left_owned_by_id: {
        type: "UUID",
        notNull: false,
      },
      left_entity_uuid: {
        type: "UUID",
        notNull: false,
      },
      right_owned_by_id: {
        type: "UUID",
        notNull: false,
      },
      right_entity_uuid: {
        type: "UUID",
        notNull: false,
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.addConstraint("entity_ids", "entity_ids_primary_key", {
    primaryKey: ["owned_by_id", "entity_uuid"],
  });
  pgm.addConstraint("entity_ids", "entity_ids_left_reference", {
    foreignKeys: {
      references: "entity_ids",
      columns: ["left_owned_by_id", "left_entity_uuid"],
    },
  });
  pgm.addConstraint("entity_ids", "entity_ids_right_reference", {
    foreignKeys: {
      references: "entity_ids",
      columns: ["right_owned_by_id", "right_entity_uuid"],
    },
  });
  pgm.addConstraint("entity_ids", "entity_ids_relation_constraint", {
    check: `
      left_entity_uuid IS NULL AND right_entity_uuid IS NULL AND left_owned_by_id IS NULL AND right_owned_by_id IS NULL
    OR 
      left_entity_uuid IS NOT NULL AND right_entity_uuid IS NOT NULL AND left_owned_by_id IS NOT NULL AND right_owned_by_id IS NOT NULL
    `,
  });

  pgm.createTable(
    "entity_editions",
    {
      // TODO: Consider changing this to XIDs
      //   see https://app.asana.com/0/1202805690238892/1203505325130365/f
      entity_record_id: {
        type: "BIGINT",
        primaryKey: true,
        notNull: true,
        sequenceGenerated: {
          precedence: "ALWAYS",
        },
      },
      entity_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "entity_types",
      },
      properties: {
        type: "JSONB",
        notNull: true,
      },
      left_to_right_order: {
        // TODO: this is where we could do fractional indexing
        //  https://app.asana.com/0/1200211978612931/1202085856561975/f
        type: "integer",
        notNull: false,
      },
      right_to_left_order: {
        // TODO: this is where we could do fractional indexing
        //  https://app.asana.com/0/1200211978612931/1202085856561975/f
        type: "integer",
        notNull: false,
      },
      updated_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      archived: {
        type: "BOOLEAN",
        notNull: true,
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "entity_versions",
    {
      owned_by_id: {
        type: "UUID",
        notNull: true,
      },
      entity_uuid: {
        type: "UUID",
        notNull: true,
      },
      entity_record_id: {
        type: "BIGINT",
        notNull: true,
        references: "entity_editions",
      },
      decision_time: {
        type: "tstzrange",
        notNull: true,
      },
      transaction_time: {
        type: "tstzrange",
        notNull: true,
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.addConstraint("entity_versions", "entity_versions_reference", {
    foreignKeys: {
      references: "entity_ids",
      columns: ["owned_by_id", "entity_uuid"],
    },
  });

  pgm.addConstraint("entity_versions", "entity_versions_overlapping", {
    exclude:
      "USING gist (owned_by_id WITH =, entity_uuid WITH =, decision_time WITH &&, transaction_time WITH &&)",
    deferrable: true,
  });

  pgm.addConstraint(
    "entity_versions",
    "entity_versions_decision_time_validation",
    {
      check: `lower(decision_time) <= lower(transaction_time)`,
    },
  );

  pgm.createView(
    "entities",
    {},
    `
    SELECT
      entity_versions.entity_record_id,
      entity_versions.owned_by_id,
      entity_versions.entity_uuid,
      entity_versions.decision_time,
      entity_versions.transaction_time,
      entity_editions.entity_type_version_id,
      entity_editions.updated_by_id,
      entity_editions.properties,
      entity_editions.archived,
      entity_ids.left_owned_by_id,
      entity_ids.left_entity_uuid,
      entity_editions.left_to_right_order,
      entity_ids.right_owned_by_id,
      entity_ids.right_entity_uuid,
      entity_editions.right_to_left_order
    FROM entity_versions
    JOIN entity_editions ON entity_versions.entity_record_id = entity_editions.entity_record_id
    JOIN entity_ids ON entity_versions.owned_by_id = entity_ids.owned_by_id AND entity_versions.entity_uuid = entity_ids.entity_uuid
    `,
  );

  pgm.createFunction(
    "create_entity",
    [
      {
        name: "_owned_by_id",
        type: "UUID",
      },
      {
        name: "_entity_uuid",
        type: "UUID",
      },
      {
        name: "_decision_time",
        type: "TIMESTAMP WITH TIME ZONE",
      },
      {
        name: "_updated_by_id",
        type: "UUID",
      },
      {
        name: "_archived",
        type: "BOOLEAN",
      },
      {
        name: "_entity_type_version_id",
        type: "UUID",
      },
      {
        name: "_properties",
        type: "JSONB",
      },
      {
        name: "_left_owned_by_id",
        type: "UUID",
      },
      {
        name: "_left_entity_uuid",
        type: "UUID",
      },
      {
        name: "_right_owned_by_id",
        type: "UUID",
      },
      {
        name: "_right_entity_uuid",
        type: "UUID",
      },
      {
        name: "_left_to_right_order",
        type: "INTEGER",
      },
      {
        name: "_right_to_left_order",
        type: "INTEGER",
      },
    ],
    {
      returns:
        "TABLE (entity_record_id BIGINT, decision_time tstzrange, transaction_time tstzrange)",
      language: "plpgsql",
      replace: true,
    },
    `
    DECLARE
      _entity_record_id BIGINT;
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
      INSERT INTO entity_editions (
        updated_by_id,
        archived,
        entity_type_version_id,
        properties,
        left_to_right_order,
        right_to_left_order
      ) VALUES (
        _updated_by_id,
        _archived,
        _entity_type_version_id,
        _properties,
        _left_to_right_order,
        _right_to_left_order
      ) RETURNING entity_editions.entity_record_id INTO _entity_record_id;

      RETURN QUERY
      INSERT INTO entity_versions (
        owned_by_id,
        entity_uuid,
        entity_record_id,
        decision_time,
        transaction_time
      ) VALUES (
        _owned_by_id,
        _entity_uuid,
        _entity_record_id,
        tstzrange(_decision_time, NULL, '[)'),
        tstzrange(now(), NULL, '[)')
      ) RETURNING entity_versions.entity_record_id, entity_versions.decision_time, entity_versions.transaction_time;
    END
    `,
  );

  pgm.createFunction(
    "update_entity",
    [
      {
        name: "_owned_by_id",
        type: "UUID",
      },
      {
        name: "_entity_uuid",
        type: "UUID",
      },
      {
        name: "_decision_time",
        type: "TIMESTAMP WITH TIME ZONE",
      },
      {
        name: "_updated_by_id",
        type: "UUID",
      },
      {
        name: "_archived",
        type: "BOOLEAN",
      },
      {
        name: "_entity_type_version_id",
        type: "UUID",
      },
      {
        name: "_properties",
        type: "JSONB",
      },
      {
        name: "_left_to_right_order",
        type: "INTEGER",
      },
      {
        name: "_right_to_left_order",
        type: "INTEGER",
      },
    ],
    {
      returns:
        "TABLE (entity_record_id BIGINT, decision_time tstzrange, transaction_time tstzrange)",
      language: "plpgsql",
      replace: true,
    },
    `
    DECLARE
      _new_entity_record_id BIGINT;
    BEGIN
      IF _decision_time IS NULL THEN _decision_time := now(); END IF;

      INSERT INTO entity_editions (
        updated_by_id,
        archived,
        entity_type_version_id,
        properties,
        left_to_right_order,
        right_to_left_order
      ) VALUES (
        _updated_by_id,
        _archived,
        _entity_type_version_id,
        _properties,
        _left_to_right_order,
        _right_to_left_order
      )
      RETURNING entity_editions.entity_record_id INTO _new_entity_record_id;
  
      RETURN QUERY
      UPDATE entity_versions
      SET decision_time = tstzrange(_decision_time, upper(entity_versions.decision_time), '[)'),
          transaction_time = tstzrange(now(), NULL, '[)'),
          entity_record_id = _new_entity_record_id
      WHERE entity_versions.owned_by_id = _owned_by_id
        AND entity_versions.entity_uuid = _entity_uuid
        AND entity_versions.decision_time @> _decision_time
        AND entity_versions.transaction_time @> now()
      RETURNING entity_versions.entity_record_id, entity_versions.decision_time, entity_versions.transaction_time;
    END
    `,
  );

  pgm.createFunction(
    "update_entity_version_trigger",
    [],
    {
      returns: "TRIGGER",
      language: "plpgsql",
    },
    `
    BEGIN
      SET CONSTRAINTS entity_versions_overlapping DEFERRED;

      -- Insert a new version with the old decision time and the system time up until now
      INSERT INTO entity_versions (
        owned_by_id,
        entity_uuid,
        entity_record_id,
        decision_time,
        transaction_time
      ) VALUES (
        OLD.owned_by_id,
        OLD.entity_uuid,
        OLD.entity_record_id,
        OLD.decision_time,
        tstzrange(lower(OLD.transaction_time),lower(NEW.transaction_time), '[)')
      );

      -- Insert a new version with the previous decision time until the new decision time
      INSERT INTO entity_versions (
        owned_by_id,
        entity_uuid,
        entity_record_id,
        decision_time,
        transaction_time
      ) VALUES (
        OLD.owned_by_id,
        OLD.entity_uuid,
        OLD.entity_record_id,
        tstzrange(lower(OLD.decision_time), lower(NEW.decision_time), '[)'),
        NEW.transaction_time
      );

      RETURN NEW;
    END`,
  );

  pgm.createTrigger("entity_versions", "update_entity_version_trigger", {
    when: "BEFORE",
    operation: "UPDATE",
    level: "ROW",
    function: "update_entity_version_trigger",
  });
};

// A down migration would cause data loss.
export const down = false;

/* Drop all tables:
DROP TABLE IF EXISTS data_types CASCADE;
DROP TABLE IF EXISTS property_types CASCADE;
DROP TABLE IF EXISTS property_type_property_type_references CASCADE;
DROP TABLE IF EXISTS property_type_data_type_references CASCADE;
DROP TABLE IF EXISTS entity_types CASCADE;
DROP TABLE IF EXISTS entity_type_property_type_references CASCADE;
DROP TABLE IF EXISTS entity_type_entity_type_references CASCADE;
DROP TABLE IF EXISTS entity_ids CASCADE;
DROP TABLE IF EXISTS entity_editions CASCADE;
DROP TABLE IF EXISTS entity_versions CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS base_uris CASCADE;
DROP TABLE IF EXISTS type_ids CASCADE;
DROP TABLE IF EXISTS version_ids CASCADE;
*/

/* Drop all functions:
DROP FUNCTION IF EXISTS update_entity_version_trigger;
DROP FUNCTION IF EXISTS update_entity;
DROP FUNCTION IF EXISTS create_entity;
 */
