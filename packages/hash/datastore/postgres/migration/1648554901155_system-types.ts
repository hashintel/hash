/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";
import { SYSTEM_TYPES } from "@hashintel/hash-api/src/types/entityTypes";

import generatedIds from "../scripts/data/generatedIds.json";
import { entityTypeJson } from "../scripts/data/systemTypeSchemas";

const now = "2021-08-19T11:00:14.588Z";

const { types } = generatedIds;
const systemAccount = generatedIds.orgs.__system__;

// This generates the system types we rely on being in the system in various queries/mutations
// _EXCEPT_ the "Org" type, which is created as part of the 'system account' setup

const sqlStatements = [];

for (const typeName of SYSTEM_TYPES.filter((name: string) => name !== "Org")) {
  const type = types[typeName];

  sqlStatements.push(`insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by_account_id, created_at, metadata_updated_at
) values (
  '${type.fixedId}', '${systemAccount.fixedId}', '${typeName}', true,
  '${systemAccount.fixedId}', '${now}', '${now}'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, updated_by_account_id, updated_at
) values (
  '${type.fixedId}', '${type.firstVersionId}', '${systemAccount.fixedId}',
  '${entityTypeJson(typeName)}',
  '${systemAccount.fixedId}', '${now}'
) on conflict do nothing;
`);
}

const sqlString = sqlStatements.join("");

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(sqlString);
}

export const down = false;
