/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";
import {
  SYSTEM_ACCOUNT_NAME,
  SYSTEM_ACCOUNT_SHORTNAME,
} from "@hashintel/hash-backend-utils/system";
import generatedIds from "../scripts/data/generatedIds.json";
import { entityTypeJson } from "../scripts/data/systemTypeSchemas";

export const shorthands: ColumnDefinitions | undefined = undefined;

const now = "2021-08-19T11:00:14.587Z";

const { Org } = generatedIds.types;
const systemAccount = generatedIds.orgs.__system__;

const systemAccountPropertiesStringified = JSON.stringify({
  shortname: SYSTEM_ACCOUNT_SHORTNAME,
  name: SYSTEM_ACCOUNT_NAME,
  memberships: [],
});

const sqlString = `
insert into accounts (account_id) values('${
  systemAccount.fixedId
}') on conflict do nothing;

-- create org entity type
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by_account_id, created_at, metadata_updated_at
) values (
  '${Org.fixedId}', '${systemAccount.fixedId}', 'Org', true,
  '${systemAccount.fixedId}', '${now}', '${now}'
) on conflict do nothing;

insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, updated_by_account_id, updated_at
) values (
  '${Org.fixedId}', '${Org.firstVersionId}', '${systemAccount.fixedId}',
  '${entityTypeJson("Org")}',
  '${systemAccount.fixedId}', '${now}'
) on conflict do nothing;

-- create system account
insert into entities (
  account_id, entity_id, versioned, created_at, created_by_account_id, metadata_updated_at
) values (
  '${systemAccount.fixedId}', '${systemAccount.fixedId}', false,
  '${now}', '${systemAccount.fixedId}', '${now}'
) on conflict do nothing;

insert into entity_versions (
  account_id, entity_version_id, entity_type_version_id,
  properties, entity_id,
  updated_by_account_id, updated_at
) values (
  '${systemAccount.fixedId}', '${systemAccount.firstVersionId}', '${
  Org.firstVersionId
}',
  '${systemAccountPropertiesStringified}', '${systemAccount.fixedId}',
  '${systemAccount.fixedId}', '${now}'
) on conflict do nothing;

insert into entity_account (
  entity_id, entity_version_id, account_id
) values (
  '${systemAccount.fixedId}', '${systemAccount.firstVersionId}', '${
  systemAccount.fixedId
}'
) on conflict do nothing;

`;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(sqlString);
}

export const down = false;
