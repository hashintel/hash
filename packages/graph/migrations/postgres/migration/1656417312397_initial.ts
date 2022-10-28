import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";
import { stripNewLines } from "../util";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
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
      created_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      updated_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      /**
       * @todo: remove this column if we introduce a delete table similar to links
       * @see https://app.asana.com/0/1201095311341924/1202697596928142/f
       */
      removed_by_id: {
        type: "UUID",
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
      created_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      updated_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      /**
       * @todo: remove this column if we introduce a delete table similar to links
       * @see https://app.asana.com/0/1201095311341924/1202697596928142/f
       */
      removed_by_id: {
        type: "UUID",
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
      created_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      updated_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      /**
       * @todo: remove this column if we introduce a delete table similar to links
       * @see https://app.asana.com/0/1201095311341924/1202697596928142/f
       */
      removed_by_id: {
        type: "UUID",
        references: "accounts",
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "link_types",
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
      created_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      updated_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      /**
       * @todo: remove this column if we introduce a delete table similar to links
       * @see https://app.asana.com/0/1201095311341924/1202697596928142/f
       */
      removed_by_id: {
        type: "UUID",
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
    "entity_ids",
    {
      entity_id: {
        type: "UUID",
        primaryKey: true,
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "entities",
    {
      entity_id: {
        type: "UUID",
        references: "entity_ids",
        notNull: true,
      },
      version: {
        type: "TIMESTAMP WITH TIME ZONE",
        notNull: true,
        default: pgm.func("clock_timestamp()"),
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
      left_order: {
        // TODO: this is where we could do fractional indexing
        //  https://app.asana.com/0/1200211978612931/1202085856561975/f
        type: "integer",
        notNull: false,
      },
      right_order: {
        // TODO: this is where we could do fractional indexing
        //  https://app.asana.com/0/1200211978612931/1202085856561975/f
        type: "integer",
        notNull: false,
      },
      owned_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      created_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      updated_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      /**
       * @todo: remove this column if we introduce a delete table similar to links
       * @see https://app.asana.com/0/1201095311341924/1202697596928142/f
       */
      removed_by_id: {
        type: "UUID",
        references: "accounts",
      },
    },
    {
      ifNotExists: true,
    },
  );
  pgm.addConstraint("entities", "entities_primary_key", {
    primaryKey: ["entity_id", "version"],
  });

  pgm.createTable(
    "entity_relations",
    {
      source_entity_id: {
        type: "UUID",
        notNull: true,
        references: "entity_ids",
      },
      relationship_entity_id: {
        type: "UUID",
        notNull: true,
        references: "entity_ids",
      },
      target_entity_id: {
        type: "UUID",
        notNull: true,
        references: "entity_ids",
      },
      created_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      created_at: {
        type: "TIMESTAMP WITH TIME ZONE",
        notNull: true,
        default: pgm.func("clock_timestamp()"),
      },
    },
    {
      ifNotExists: true,
    },
  );
  // Currently entity relations are between unversioned entities.
  pgm.addConstraint("entity_relations", "entity_relations_pkey", {
    primaryKey: [
      "source_entity_id",
      "relationship_entity_id",
      "target_entity_id",
    ],
  });

  pgm.createTable(
    "entity_relation_histories",
    {
      // We should consider whether these should reference entity_ids or not.
      // If we allow GDPR removal of entities, this constraint has to fail/cascade depending on desired output.
      source_entity_id: {
        type: "UUID",
        notNull: true,
        references: "entity_ids",
      },
      relationship_entity_id: {
        type: "UUID",
        notNull: true,
        references: "entity_ids",
      },
      target_entity_id: {
        type: "UUID",
        notNull: true,
        references: "entity_ids",
      },
      created_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      created_at: {
        type: "TIMESTAMP WITH TIME ZONE",
        notNull: true,
      },
      removed_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      removed_at: {
        type: "TIMESTAMP WITH TIME ZONE",
        notNull: true,
        default: pgm.func("clock_timestamp()"),
      },
    },
    {
      ifNotExists: true,
    },
  );
  // entity_relation_histories has no unique index!
}

// A down migration would cause data loss.
export const down = false;

/* Drop all tables:
DROP TABLE IF EXISTS data_types CASCADE;
DROP TABLE IF EXISTS property_types CASCADE;
DROP TABLE IF EXISTS property_type_property_type_references CASCADE;
DROP TABLE IF EXISTS property_type_data_type_references CASCADE;
DROP TABLE IF EXISTS entity_types CASCADE;
DROP TABLE IF EXISTS entity_type_property_type_references CASCADE;
DROP TABLE IF EXISTS link_types CASCADE;
DROP TABLE IF EXISTS entity_ids CASCADE;
DROP TABLE IF EXISTS entities CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS ids CASCADE;
*/
