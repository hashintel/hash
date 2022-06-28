/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
  -- Accounts are undecided and just here for satisfying the future schema
  CREATE TABLE accounts (
      account_id UUID PRIMARY KEY
  );

  -- -- This table is a boundary to define the actual identification scheme for our kinds of types.
  -- -- Assume that we use the UUIDs on the types to look up more specific ID details.
  -- CREATE TABLE ids (
  --    version_id UUID PRIMARY KEY,
  --    id text NOT NULL UNIQUE
  -- );

  CREATE TABLE data_types (
    version_id UUID PRIMARY KEY,
    "schema" JSONB NOT NULL,
    created_by UUID NOT NULL,
    FOREIGN KEY (created_by) REFERENCES accounts (account_id)
);

  CREATE TABLE property_types (
      version_id UUID PRIMARY KEY,
      "schema" JSONB NOT NULL,
      created_by UUID NOT NULL,
      FOREIGN KEY (created_by) REFERENCES accounts (account_id)
  );

  CREATE TABLE property_type_property_type_references (
      source_property_type_version_id UUID NOT NULL,
      target_property_type_version_id UUID NOT NULL,
      FOREIGN KEY (source_property_type_version_id) REFERENCES property_types (version_id),
      FOREIGN KEY (target_property_type_version_id) REFERENCES property_types (version_id)
  );

  CREATE TABLE property_type_data_type_references (
      source_property_type_version_id UUID NOT NULL,
      target_data_type_version_id UUID NOT NULL,
      FOREIGN KEY (source_property_type_version_id) REFERENCES property_types (version_id),
      FOREIGN KEY (target_data_type_version_id) REFERENCES data_types (version_id)
  );

  CREATE TABLE entity_types (
      version_id UUID PRIMARY KEY,
      "schema" JSONB NOT NULL,
      created_by UUID NOT NULL,
      FOREIGN KEY (created_by) REFERENCES accounts (account_id)
  );

  CREATE TABLE entity_type_property_types (
      source_entity_type_version_id UUID NOT NULL,
      target_property_type_version_id UUID NOT NULL,
      FOREIGN KEY (source_entity_type_version_id) REFERENCES entity_types (version_id),
      FOREIGN KEY (target_property_type_version_id) REFERENCES property_types (version_id)
  );

  CREATE TABLE entities (
      entity_id UUID PRIMARY KEY,
      source_entity_type_version_id UUID NOT NULL,
      properties JSONB NOT NULL,
      created_by UUID NOT NULL,
      FOREIGN KEY (source_entity_type_version_id) REFERENCES entity_types (version_id),
      FOREIGN KEY (created_by) REFERENCES accounts (account_id)
  );
  `);
}

// A down migration would cause data loss.
export const down = false;

/* Drop all tables:
DROP TABLE IF EXISTS data_types CASCADE;
DROP TABLE IF EXISTS property_types CASCADE;
DROP TABLE IF EXISTS property_type_property_type_references CASCADE;
DROP TABLE IF EXISTS property_type_data_type_references CASCADE;
DROP TABLE IF EXISTS entity_types CASCADE;
DROP TABLE IF EXISTS entity_type_property_types CASCADE;
DROP TABLE IF EXISTS entities CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS ids CASCADE;
*/
