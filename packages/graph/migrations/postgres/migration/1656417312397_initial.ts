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
    "latest_entities",
    {
      entity_id: {
        type: "UUID",
        references: "entity_ids",
        notNull: true,
      },
      owned_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
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
      left_entity_id: {
        type: "UUID",
        notNull: false,
        references: "entity_ids",
      },
      left_owned_by_id: {
        type: "UUID",
        notNull: false,
        references: "accounts",
      },
      right_entity_id: {
        type: "UUID",
        notNull: false,
        references: "entity_ids",
      },
      right_owned_by_id: {
        type: "UUID",
        notNull: false,
        references: "accounts",
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
    },
    {
      ifNotExists: true,
    },
  );
  // Only allow a single version of an entity in this table.
  pgm.addConstraint("latest_entities", "latest_entities_primary_key", {
    primaryKey: ["entity_id"],
  });

  pgm.addConstraint("latest_entities", "latest_entities_relation_constraint", {
    check: `(
      left_entity_id IS NULL AND left_owned_by_id IS NULL
        AND right_entity_id IS NULL AND right_owned_by_id IS NULL
    ) 
    OR (
      left_entity_id IS NOT NULL AND left_owned_by_id IS NOT NULL
       AND right_entity_id IS NOT NULL AND right_owned_by_id IS NOT NULL
    )`,
  });

  pgm.addConstraint(
    "latest_entities",
    "latest_entities_relation_order_constraint",
    {
      // Because of the "entities_relation_constraint", we can check any one of the required link columns
      check: `(left_entity_id IS NOT NULL)
            OR (left_order IS NULL AND right_order IS NULL)`,
    },
  );

  pgm.createTable(
    "entity_histories",
    {
      entity_id: {
        type: "UUID",
        references: "entity_ids",
        notNull: true,
      },
      owned_by_id: {
        type: "UUID",
        notNull: true,
        references: "accounts",
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
      left_entity_id: {
        type: "UUID",
        notNull: false,
        references: "entity_ids",
      },
      left_owned_by_id: {
        type: "UUID",
        notNull: false,
        references: "accounts",
      },
      right_entity_id: {
        type: "UUID",
        notNull: false,
        references: "entity_ids",
      },
      right_owned_by_id: {
        type: "UUID",
        notNull: false,
        references: "accounts",
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
      archived: {
        // We may be able to reclaim some space here by using nullability.
        type: "boolean",
        notNull: true,
        default: "FALSE",
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
    },
    {
      ifNotExists: true,
    },
  );
  pgm.addConstraint("entity_histories", "entity_histories_primary_key", {
    primaryKey: ["entity_id", "version"],
  });

  pgm.addConstraint(
    "entity_histories",
    "entity_histories_relation_constraint",
    {
      check: `(
      left_entity_id IS NULL AND left_owned_by_id IS NULL
        AND right_entity_id IS NULL AND right_owned_by_id IS NULL
    ) 
    OR (
      left_entity_id IS NOT NULL AND left_owned_by_id IS NOT NULL
       AND right_entity_id IS NOT NULL AND right_owned_by_id IS NOT NULL
    )`,
    },
  );

  pgm.addConstraint(
    "entity_histories",
    "entities_histories_relation_order_constraint",
    {
      // Because of the "entities_histories_relation_constraint", we can check any one of the required link columns
      check: `(left_entity_id IS NOT NULL)
            OR (left_order IS NULL AND right_order IS NULL)`,
    },
  );

  // This view contains the union of both latest and historic table.
  // The latest entities come first when querying the view.
  pgm.createView(
    "entities",
    {
      columns: [
        "entity_id",
        "owned_by_id",
        "version",
        "latest_version",
        "entity_type_version_id",
        "properties",
        "left_entity_id",
        "left_owned_by_id",
        "right_entity_id",
        "right_owned_by_id",
        "left_order",
        "right_order",
        "archived",
        "created_by_id",
        "updated_by_id",
      ],
    },
    `
    SELECT entity_id, owned_by_id, version, TRUE as latest_version, entity_type_version_id, properties, left_entity_id, left_owned_by_id, right_entity_id, right_owned_by_id, left_order, right_order, FALSE AS archived, created_by_id, updated_by_id FROM latest_entities
    UNION ALL
    SELECT entity_id, owned_by_id, version, FALSE as latest_version,  entity_type_version_id, properties, left_entity_id, left_owned_by_id, right_entity_id, right_owned_by_id, left_order, right_order, archived, created_by_id, updated_by_id FROM entity_histories`,
  );
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
DROP TABLE IF EXISTS entity_type_entity_type_references CASCADE;
DROP TABLE IF EXISTS entity_ids CASCADE;
DROP TABLE IF EXISTS entities CASCADE;
DROP TABLE IF EXISTS entity_histories CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS ids CASCADE;
*/
