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
        comment:
          "Accounts are undecided and just here for satisfying the future schema",
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

  // TODO: rename ids to type_ids
  pgm.createTable(
    "ids",
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
  pgm.addConstraint("ids", "ids_primary_key", {
    primaryKey: ["base_uri", "version"],
  });

  // TODO: consider changing `created_by` to `author` or something in all tables : https://app.asana.com/0/1201095311341924/1202769355319303/f
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
      created_by: {
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
      created_by: {
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
      created_by: {
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
      created_by: {
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
    "entity_type_link_type_references",
    {
      source_entity_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "entity_types",
      },
      target_link_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "link_types",
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "entity_type_entity_type_links",
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
      created_by: {
        type: "UUID",
        notNull: true,
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
    "links",
    {
      source_entity_id: {
        type: "UUID",
        notNull: true,
        references: "entity_ids",
      },
      target_entity_id: {
        type: "UUID",
        notNull: true,
        references: "entity_ids",
      },
      link_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "link_types",
      },
      multi: {
        type: "boolean",
        notNull: true,
        default: "false",
      },
      link_order: {
        // TODO: this is where we could do fractional indexing
        //  https://app.asana.com/0/1200211978612931/1202085856561975/f
        type: "integer",
        notNull: false,
      },
      created_by: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      created_at: {
        type: "TIMESTAMP WITH TIME ZONE",
        notNull: true,
        // This default would give the UTC time "wall clock" even within a transaction/
        default: pgm.func("clock_timestamp()"),
      },
    },
    {
      ifNotExists: true,
    },
  );
  // Currently links are between unversioned entities.
  // Ideally we'd have links between versioned entities -> unversioned entities.
  pgm.addConstraint("links", "links_pkey", {
    primaryKey: [
      "source_entity_id",
      "target_entity_id",
      "link_type_version_id",
    ],
  });

  pgm.createTable(
    "link_histories",
    {
      // We should consider whether these should reference entity_ids or not.
      // If we allow GDPR removal of entities, this constraint has to fail/cascade depending on desired output.
      source_entity_id: {
        type: "UUID",
        notNull: true,
        references: "entity_ids",
      },
      target_entity_id: {
        type: "UUID",
        notNull: true,
        references: "entity_ids",
      },
      link_type_version_id: {
        type: "UUID",
        notNull: true,
        references: "link_types",
      },
      link_order: {
        // TODO: this is where we could do fractional indexing
        //  https://app.asana.com/0/1200211978612931/1202085856561975/f
        type: "integer",
        notNull: false,
      },
      created_by: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      created_at: {
        type: "TIMESTAMP WITH TIME ZONE",
        notNull: true,
      },
      removed_by: {
        type: "UUID",
        notNull: true,
        references: "accounts",
      },
      removed_at: {
        type: "TIMESTAMP WITH TIME ZONE",
        notNull: true,
        // This default would give the UTC time "wall clock" even within a transaction/
        default: pgm.func("clock_timestamp()"),
      },
      // TODO: Consider using timestamps for link duration like we've done for the HASH backend,
      //   see https://app.asana.com/0/1201095311341924/1201836485518642/f
      active: {
        type: "boolean",
        notNull: true,
        default: true,
      },
    },
    {
      ifNotExists: true,
    },
  );
  // link_histories has no unique index!
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
DROP TABLE IF EXISTS entity_type_link_type_references CASCADE;
DROP TABLE IF EXISTS entity_type_entity_type_links CASCADE;
DROP TABLE IF EXISTS link_types CASCADE;
DROP TABLE IF EXISTS entity_ids CASCADE;
DROP TABLE IF EXISTS entities CASCADE;
DROP TABLE IF EXISTS links CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS ids CASCADE;
*/
