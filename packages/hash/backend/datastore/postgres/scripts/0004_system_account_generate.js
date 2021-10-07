const fs = require("fs");
const path = require("path");

const generatedIds = require("./data/generatedIds.json");
const { entityTypeJson } = require("./data/systemTypeSchemas");
const {
  SYSTEM_ACCOUNT_SHORTNAME,
  SYSTEM_ACCOUNT_NAME
} = require("../../../src/lib/jsConfig");

const now = '2021-08-19T11:00:14.587Z';

const { Org } = generatedIds.types;
const systemAccount = generatedIds.orgs[SYSTEM_ACCOUNT_SHORTNAME];

const systemAccountPropertiesStringified = JSON.stringify({
  shortname: SYSTEM_ACCOUNT_SHORTNAME,
  name: SYSTEM_ACCOUNT_NAME,
});

const sqlString = `
insert into accounts (account_id) values('${systemAccount.fixedId}') on conflict do nothing;

-- create org entity type
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '${Org.fixedId}', '${systemAccount.fixedId}', 'Org', true,
  '${systemAccount.fixedId}', '${now}', '${now}'
) on conflict do nothing;

insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '${Org.fixedId}', '${Org.firstVersionId}', '${systemAccount.fixedId}',
  '${entityTypeJson("Org")}',
  '${systemAccount.fixedId}', '${now}', '${now}'
) on conflict do nothing;

-- create system account
insert into entities (
  account_id, entity_id, versioned, created_at, metadata_updated_at
) values (
  '${systemAccount.fixedId}', '${systemAccount.fixedId}', false,
  '${now}', '${now}'
) on conflict do nothing;

insert into entity_versions (
  account_id, entity_version_id, entity_type_version_id,
  properties, entity_id,
  created_by, created_at, updated_at
) values (
  '${systemAccount.fixedId}', '${systemAccount.firstVersionId}', '${Org.firstVersionId}',
  '${systemAccountPropertiesStringified}', '${systemAccount.fixedId}',
  '${systemAccount.fixedId}', '${now}', '${now}'
) on conflict do nothing;

insert into entity_account (
  entity_id, entity_version_id, account_id
) values (
  '${systemAccount.fixedId}', '${systemAccount.firstVersionId}', '${systemAccount.fixedId}'
) on conflict do nothing;

`;

const outputPath = path.join(__dirname, "../schema/0004_system_account.sql");
fs.writeFileSync(outputPath, sqlString);