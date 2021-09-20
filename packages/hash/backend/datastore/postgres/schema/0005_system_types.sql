insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '3c3d4aed-6b48-483f-a48b-10c0d327ef41', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', 'Block', true,
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '3c3d4aed-6b48-483f-a48b-10c0d327ef41', 'dca9bb26-2bbc-41c7-af42-005ed803a1e4', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e/types/3c3d4aed-6b48-483f-a48b-10c0d327ef41","title":"Block","type":"object"}',
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '122165bb-6843-4417-a070-ee8027d2612c', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', 'EntityType', true,
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '122165bb-6843-4417-a070-ee8027d2612c', '3fa77d97-851a-4c49-a0f5-f0b2c1b81689', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e/types/122165bb-6843-4417-a070-ee8027d2612c","title":"EntityType","type":"object"}',
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '5d8c70c2-58cd-425a-8625-9fd6d2005883', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', 'Page', true,
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '5d8c70c2-58cd-425a-8625-9fd6d2005883', 'ad67c2cd-7457-4807-8b69-91b52bf9be4e', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e/types/5d8c70c2-58cd-425a-8625-9fd6d2005883","title":"Page","type":"object"}',
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '3a9c2ea5-4d21-4c12-8619-08c20fb3bf94', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', 'Text', true,
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '3a9c2ea5-4d21-4c12-8619-08c20fb3bf94', 'f39082ba-7c30-4890-a3f2-2658145808fe', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e/types/3a9c2ea5-4d21-4c12-8619-08c20fb3bf94","title":"Text","type":"object"}',
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '54001e67-eef5-4719-ad48-648d638d73c4', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', 'User', true,
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '54001e67-eef5-4719-ad48-648d638d73c4', 'ed449fe2-abc4-48f0-bf43-921e7e8dfb5a', '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e',
  '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://hash.ai/543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e/types/54001e67-eef5-4719-ad48-648d638d73c4","title":"User","type":"object","description":"A user with an account in a HASH.dev instance.","properties":{"emails":{"type":"array","description":"The email address(es) associated with a user","items":{"type":"object","description":"Information on a email address.","properties":{"email":{"description":"The email address itself","type":"string"},"primary":{"description":"Whether this email address is the primary one for the user","type":"boolean"},"verified":{"description":"Whether this email address has been verified","type":"boolean"}}}},"memberOf":{"$ref":"http://hash.ai/543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e/types/6163639e-5a47-4f05-b595-7ebe086d616d"},"shortname":{"minLength":4,"maxLength":24,"type":"string","description":"A unique slug for the user."},"preferredName":{"description":"The name which the user prefers to go by","type":"string"}},"required":["emails"]}',
  '543ba1a2-ed99-447e-a4d8-d2c73d5b0c6e', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
