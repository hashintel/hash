
insert into accounts (account_id) values('543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e') on conflict do nothing;

-- create org entity type
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '6163639e-5a47-4f05-b595-7ebe086d616d', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', 'Org', true,
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;

insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '6163639e-5a47-4f05-b595-7ebe086d616d', 'ca0e4f70-407c-486d-95e2-7f2b3a6c21bd', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://hash.ai/543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e/types/6163639e-5a47-4f05-b595-7ebe086d616d","title":"Org","type":"object","description":"An organization account in a HASH.dev instance.","properties":{"shortname":{"minLength":4,"maxLength":24,"type":"string","description":"A unique slug for the organization."},"name":{"type":"string","description":"A display name for the organization."}},"required":["shortname"]}',
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;

-- create system account
insert into entities (
  account_id, entity_id, versioned, created_at, metadata_updated_at
) values (
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', false,
  '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;

insert into entity_versions (
  account_id, entity_version_id, entity_type_version_id,
  properties, entity_id,
  created_by, created_at, updated_at
) values (
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '809a81f4-9c72-4d8b-bc2f-54ce884443e1', 'ca0e4f70-407c-486d-95e2-7f2b3a6c21bd',
  '{"shortname":"hash"}', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e',
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.587Z', '2021-08-19T11:00:14.587Z'
) on conflict do nothing;