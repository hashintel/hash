const fs = require("fs");
const path = require("path");

const generatedIds = require("./data/generatedIds.json");
const { SYSTEM_ACCOUNT_NAME } = require("../../../src/lib/config");

const now = new Date().toISOString();

const { Org } = generatedIds.types;
const systemAccount = generatedIds.orgs[SYSTEM_ACCOUNT_NAME];

const entityTypeJson = (name) => JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `https://hash.ai/${systemAccount.fixedId}/${name.toLowerCase()}.schema.json`,
  title: name,
  type: "object",
});
module.exports = { entityTypeJson };

const systemAccountProperties = JSON.stringify({
  shortname: SYSTEM_ACCOUNT_NAME,
});

const sqlString = `insert into accounts (account_id) values('${systemAccount.fixedId}') on conflict do nothing;

-- create org entity type
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, updated_at
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
  account_id, entity_id, versioned
) values (
  '${systemAccount.fixedId}', '${systemAccount.fixedId}', false
) on conflict do nothing;

insert into entity_versions (
  account_id, entity_version_id, entity_type_version_id,
  properties, entity_id,
  created_by, created_at, updated_at
) values (
  '${systemAccount.fixedId}', '${systemAccount.firstVersionId}', '${Org.firstVersionId}',
  '${systemAccountProperties}', '${systemAccount.fixedId}',
  '${systemAccount.fixedId}', '${now}', '${now}'
) on conflict do nothing;`;

const outputPath = path.join(__dirname, "../schema/0001_system_account.sql");
fs.writeFileSync(outputPath, sqlString);