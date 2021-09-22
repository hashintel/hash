insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '766ab052-f6b0-4264-9827-8999e637466c', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', 'Block', true,
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '766ab052-f6b0-4264-9827-8999e637466c', '821c8aa3-b5cb-4276-a550-342decc9a563', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/bc2e14d1-36a2-47fc-aa97-99c6ab28d562/types/766ab052-f6b0-4264-9827-8999e637466c","title":"Block","type":"object"}',
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  'b9e57867-943a-4e84-88c5-5d5f7022d99a', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', 'EntityType', true,
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  'b9e57867-943a-4e84-88c5-5d5f7022d99a', '10d08f4f-7215-4a52-ad44-a3bb2407a6ad', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/bc2e14d1-36a2-47fc-aa97-99c6ab28d562/types/b9e57867-943a-4e84-88c5-5d5f7022d99a","title":"EntityType","type":"object"}',
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  'dc1fac23-7b73-4076-a0f2-db766a763fce', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', 'Page', true,
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  'dc1fac23-7b73-4076-a0f2-db766a763fce', '4fcaf862-f896-43c9-94f3-40af2ac3efaf', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/bc2e14d1-36a2-47fc-aa97-99c6ab28d562/types/dc1fac23-7b73-4076-a0f2-db766a763fce","title":"Page","type":"object"}',
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  'fb82f307-ea4c-46fc-b447-c3441308e980', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', 'Text', true,
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  'fb82f307-ea4c-46fc-b447-c3441308e980', '106de286-9890-443e-808e-0564167b65b5', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/bc2e14d1-36a2-47fc-aa97-99c6ab28d562/types/fb82f307-ea4c-46fc-b447-c3441308e980","title":"Text","type":"object"}',
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '947a1b54-5ec9-49f6-aae8-1c71ba722461', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', 'User', true,
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '947a1b54-5ec9-49f6-aae8-1c71ba722461', '0452c7fc-2743-4e6e-8135-a9dcc094696b', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/bc2e14d1-36a2-47fc-aa97-99c6ab28d562/types/947a1b54-5ec9-49f6-aae8-1c71ba722461","title":"User","type":"object","description":"A user with an account in a HASH.dev instance.","properties":{"emails":{"type":"array","description":"The email address(es) associated with a user","items":{"type":"object","description":"Information on a email address.","properties":{"email":{"description":"The email address itself","type":"string"},"primary":{"description":"Whether this email address is the primary one for the user","type":"boolean"},"verified":{"description":"Whether this email address has been verified","type":"boolean"}}}},"memberOf":{"$ref":"http://hash.ai/bc2e14d1-36a2-47fc-aa97-99c6ab28d562/types/2684ab5a-c927-4c91-a49e-838bb75719b3"},"shortname":{"minLength":4,"maxLength":24,"type":"string","description":"A unique slug for the user."},"preferredName":{"description":"The name which the user prefers to go by","type":"string"}},"required":["emails"]}',
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '05f144cf-01f0-4bd6-a54d-d9ddc3db5d43', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', 'OrgInvitation', true,
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '05f144cf-01f0-4bd6-a54d-d9ddc3db5d43', 'b5b39548-ef9e-4c93-ac16-03c811edd488', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/bc2e14d1-36a2-47fc-aa97-99c6ab28d562/types/05f144cf-01f0-4bd6-a54d-d9ddc3db5d43","title":"OrgInvitation","type":"object"}',
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '394eb1aa-bb99-44d6-b3ca-a46524605d50', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', 'OrgEmailInvitation', true,
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '394eb1aa-bb99-44d6-b3ca-a46524605d50', '98802676-271a-43af-ba17-acc9298bf7d3', 'bc2e14d1-36a2-47fc-aa97-99c6ab28d562',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/bc2e14d1-36a2-47fc-aa97-99c6ab28d562/types/394eb1aa-bb99-44d6-b3ca-a46524605d50","title":"OrgEmailInvitation","type":"object"}',
  'bc2e14d1-36a2-47fc-aa97-99c6ab28d562', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
