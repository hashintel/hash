
insert into accounts (account_id) values('bc2e14d1-36a2-47fc-aa97-99c6ab28d562') on conflict do nothing;

-- create org entity type
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '2684ab5a-c927-4c91-a49e-838bb75719b3', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', 'Org', true,
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;

insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '2684ab5a-c927-4c91-a49e-838bb75719b3', '993600be-de8e-46f1-aef7-d3ea9ded65a2', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://localhost:3000/bc2e14d1-36a2-47fc-aa97-99c6ab28d562/types/2684ab5a-c927-4c91-a49e-838bb75719b3","title":"Org","type":"object","description":"An organization account in a HASH.dev instance.","properties":{"shortname":{"minLength":4,"maxLength":24,"type":"string","description":"A unique slug for the organization."},"name":{"type":"string","description":"A display name for the organization."}},"required":["shortname"]}',
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;

-- create system account
insert into entities (
  account_id, entity_id, versioned, created_at, metadata_updated_at
) values (
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', false,
  '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;

insert into entity_versions (
  account_id, entity_version_id, entity_type_version_id,
  properties, entity_id,
  created_by, created_at, updated_at
) values (
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', 'fdc7586e-e014-40b6-bea7-5d382b773954', '993600be-de8e-46f1-aef7-d3ea9ded65a2',
  '{"shortname":"hash","name":"HASH"}', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562',
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;

insert into entity_account (
  entity_id, entity_version_id, account_id
) values (
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', 'fdc7586e-e014-40b6-bea7-5d382b773954', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562'
) on conflict do nothing;

