insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '9d3c6d04-a2b9-444d-aef8-dfeab4e3db28', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', 'Block', true,
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '9d3c6d04-a2b9-444d-aef8-dfeab4e3db28', '2e4891da-ea52-4546-aecb-bb88531b72af', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4',
  '{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"http://localhost:3000/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/9d3c6d04-a2b9-444d-aef8-dfeab4e3db28","title":"Block","type":"object","description":"A block of content, for displaying or editing a data structure.","properties":{"componentId":{"type":"string","description":"The identifier (e.g. a URI) for the component that will render the data."},"entity":{"type":"object","description":"The data entity to display or edit"}},"required":["componentId","entity"]}',
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '34def702-444f-43fd-b0dd-2ee16069ebdf', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', 'EntityType', true,
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '34def702-444f-43fd-b0dd-2ee16069ebdf', 'ebb07067-f300-4504-be3f-b251c36ca06d', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4',
  '{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"http://localhost:3000/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/34def702-444f-43fd-b0dd-2ee16069ebdf","title":"EntityType","type":"object"}',
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  'a1cbaead-637f-41ea-8ae4-073e4b0122bb', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', 'Page', true,
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  'a1cbaead-637f-41ea-8ae4-073e4b0122bb', '4a858a90-b1fd-4412-9643-be470305a9eb', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4',
  '{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"http://localhost:3000/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/a1cbaead-637f-41ea-8ae4-073e4b0122bb","title":"Page","type":"object","description":"A page of content.","properties":{"archived":{"type":"boolean","description":"Whether or not the page has been archived"},"contents":{"type":"array","description":"An ordered list of the blocks making up the contents of this page","items":{"$ref":"/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/9d3c6d04-a2b9-444d-aef8-dfeab4e3db28"}},"summary":{"type":"string","description":"An abstract or summary of the page"},"title":{"type":"string","description":"The title of the page"}},"required":["title","contents"]}',
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  'd363a66a-f108-4b5c-86b5-b3233c32f12a', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', 'Text', true,
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  'd363a66a-f108-4b5c-86b5-b3233c32f12a', 'c959cafa-3ff6-45f4-b4ae-a936971d9081', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4',
  '{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"http://localhost:3000/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/d363a66a-f108-4b5c-86b5-b3233c32f12a","title":"Text","type":"object"}',
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '1f9e6df2-a4f2-407a-af07-ae5a9a4857fc', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', 'User', true,
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '1f9e6df2-a4f2-407a-af07-ae5a9a4857fc', 'd796e0e4-1504-46a3-923e-da3252e9f566', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4',
  '{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"http://localhost:3000/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/1f9e6df2-a4f2-407a-af07-ae5a9a4857fc","title":"User","type":"object","description":"A user with an account in a HASH.dev instance.","properties":{"emails":{"type":"array","description":"The email address(es) associated with a user","items":{"$ref":"#/$defs/Emails"}},"memberOf":{"description":"The organization membership(s) of the user.","type":"array","items":{"$ref":"/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/75aa1211-96b9-40b7-84e6-0118790ed520"}},"shortname":{"minLength":4,"maxLength":24,"type":"string","description":"A unique slug for the user."},"preferredName":{"description":"The name which the user prefers to go by","type":"string"}},"required":["emails","memberOf"],"$defs":{"Emails":{"title":"Email","type":"object","description":"Information on a email address.","properties":{"address":{"description":"The email address itself","type":"string"},"primary":{"description":"Whether this email address is the primary one for the user","type":"boolean"},"verified":{"description":"Whether this email address has been verified","type":"boolean"}},"required":["address","primary","verified"]}}}',
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '75aa1211-96b9-40b7-84e6-0118790ed520', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', 'OrgMembership', true,
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '75aa1211-96b9-40b7-84e6-0118790ed520', '7a68b6b3-cab2-4f6e-abb7-2fe4abb070b2', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4',
  '{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"http://localhost:3000/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/75aa1211-96b9-40b7-84e6-0118790ed520","title":"OrgMembership","type":"object","description":"The membership of a user at an organization.","properties":{"user":{"description":"A reference to the user associated with the membership.","$ref":"/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/1f9e6df2-a4f2-407a-af07-ae5a9a4857fc"},"org":{"description":"A reference to the organization associated with the membership.","$ref":"/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/37790a78-9262-4e88-930e-f4685cf362cc"},"responsibility":{"description":"The responsibility of the user in the organization","type":"string"}},"required":["org","user","responsibility"]}',
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '7d7dda68-3096-4698-96ea-2f80fe669157', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', 'File', true,
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '7d7dda68-3096-4698-96ea-2f80fe669157', '2642c824-1d1f-4071-8233-b5c2bf96a853', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4',
  '{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"http://localhost:3000/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/7d7dda68-3096-4698-96ea-2f80fe669157","title":"File","type":"object"}',
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  'b230213b-7620-493a-b7ae-8cf1dc7287ea', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', 'OrgInvitationLink', true,
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  'b230213b-7620-493a-b7ae-8cf1dc7287ea', 'a5bfe6e4-e871-455d-beb9-a0fa1162d457', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4',
  '{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"http://localhost:3000/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/b230213b-7620-493a-b7ae-8cf1dc7287ea","title":"OrgInvitationLink","type":"object"}',
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_types (
  entity_type_id, account_id, name, versioned,
  created_by, created_at, metadata_updated_at
) values (
  '15b65dfb-b4eb-45f6-9258-c443a5d56953', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', 'OrgEmailInvitation', true,
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
insert into entity_type_versions (
  entity_type_id, entity_type_version_id, account_id,
  properties, created_by, created_at, updated_at
) values (
  '15b65dfb-b4eb-45f6-9258-c443a5d56953', '22ce0f7a-88b8-4cfa-8bed-6d2310fcb971', '46c75ba1-bef2-4d6d-b974-bacc0abac3c4',
  '{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"http://localhost:3000/46c75ba1-bef2-4d6d-b974-bacc0abac3c4/types/15b65dfb-b4eb-45f6-9258-c443a5d56953","title":"OrgEmailInvitation","type":"object"}',
  '46c75ba1-bef2-4d6d-b974-bacc0abac3c4', '2021-08-19T11:00:14.588Z', '2021-08-19T11:00:14.588Z'
) on conflict do nothing;
