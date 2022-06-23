/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    "entity_types",
    {
      entity_type_uri: {
        type: "text",
        notNull: true,
        primaryKey: true,
      },
      description: {
        type: "text",
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "property_types",
    {
      property_type_uri: {
        type: "text",
        notNull: true,
        references: "property_types",
        primaryKey: true,
      },
      schema: {
        type: "jsonb",
        notNull: true,
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "data_types",
    {
      data_type_uri: {
        type: "text",
        notNull: true,
        primaryKey: true,
      },
      schema: {
        type: "jsonb",
        notNull: true,
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "entity_type_property_types",
    {
      source_entity_type_uri: {
        type: "text",
        notNull: true,
        references: "entity_types",
      },
      // name: {
      //   type: "text",
      //   notNull: true,
      // },
      property_type_uri: {
        type: "text",
        notNull: true,
        references: "property_types",
      },
      required: {
        type: "boolean",
        notNull: true,
      },
      array: {
        type: "boolean",
        notNull: true,
      },
      min_items: {
        type: "integer",
        notNull: false,
      },
      max_items: {
        type: "integer",
        notNull: false,
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable("property_type_property_type_references", {
    property_type_uri: {
      type: "text",
      notNull: true,
      references: "property_types",
    },
    referenced_property_type_uri: {
      type: "text",
      notNull: true,
      references: "property_types",
    },
  });

  pgm.createTable(
    "property_type_data_type_references",
    {
      property_type_uri: {
        type: "text",
        notNull: true,
        references: "property_types",
      },
      referenced_data_type_uri: {
        type: "text",
        notNull: true,
        references: "data_types",
      },
    },
    {
      ifNotExists: true,
    },
  );

  pgm.createTable(
    "data_type_data_type_references",
    {
      data_type_uri: {
        type: "text",
        notNull: true,
        references: "data_types",
      },
      referenced_data_type_uri: {
        type: "text",
        notNull: true,
        references: "data_types",
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
        type: "uuid",
        notNull: true,
        comment: "The fixed ID across all versions of an entity",
        primaryKey: true,
      },
      entity_type_uri: {
        type: "text",
        notNull: true,
        references: "entity_types",
      },
      properties: {
        type: "jsonb",
        notNull: true,
      },
    },
    {
      ifNotExists: true,
    },
  );
}

export async function down(_pgm: MigrationBuilder): Promise<void> {}
