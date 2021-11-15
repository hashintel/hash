
insert into accounts (account_id) values('46c75ba1-bef2-4d6d-b974-bacc0abac3c4') on conflict do nothing;

-- create org entity type
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '37790a78-9262-4e88-930e-f4685cf362cc', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', 'Org', true,
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;

insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '37790a78-9262-4e88-930e-f4685cf362cc', 'ba214c8a-965d-4154-bcba-8fa81f92e3dd', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://localhost:3000/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/37790a78-9262-4e88-930e-f4685cf362cc","title":"Org","type":"object","description":"An organization account in a HASH.dev instance.","properties":{"shortname":{"minLength":4,"maxLength":24,"type":"string","description":"A unique slug for the organization."},"name":{"type":"string","description":"A display name for the organization."},"memberships":{"description":"The membership(s) of the organization.","type":"array","items":{"$ref":"http://localhost:3000/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/75aa1211-96b9-40b7-84e6-0118790ed520"}}},"required":["shortname","memberships"]}',
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;

-- create system account
insert into entities (
  account_id, entity_id, versioned, created_at, metadata_updated_at
) values (
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', false,
  '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;

insert into entity_versions (
  account_id, entity_version_id, entity_type_version_id,
  properties, entity_id,
  created_by, created_at, updated_at
) values (
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '52310924-40e9-4314-9e1f-79fee9ee895b', 'ba214c8a-965d-4154-bcba-8fa81f92e3dd',
  '{"shortname":"hash","name":"HASH","memberships":[]}', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4',
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;

insert into entity_account (
  entity_id, entity_version_id, account_id
) values (
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '52310924-40e9-4314-9e1f-79fee9ee895b', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4'
) on conflict do nothing;

