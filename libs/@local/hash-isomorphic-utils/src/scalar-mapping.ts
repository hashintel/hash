export const scalars = {
  BaseUrl: "@blockprotocol/type-system#BaseUrl",

  Date: "string",

  JSONObject: "@blockprotocol/core#JsonObject",
  QueryOperationInput: "@blockprotocol/graph#QueryOperationInput",
  VersionedUrl: "@blockprotocol/type-system#VersionedUrl",

  UnknownEntityProperties: "@blockprotocol/core#JsonObject",
  TextToken: "@blockprotocol/core#JsonObject",

  HasIndexedContentProperties: "@blockprotocol/core#JsonObject",
  HasSpatiallyPositionedContentProperties: "@blockprotocol/core#JsonObject",

  DataTypeWithMetadata: "@local/hash-subgraph#DataTypeWithMetadata",
  ConstructDataTypeParams: "@blockprotocol/core#JsonObject",

  EntityTypeWithMetadata: "@local/hash-subgraph#EntityTypeWithMetadata",
  ConstructEntityTypeParams: "@blockprotocol/core#JsonObject",

  PropertyTypeWithMetadata: "@local/hash-subgraph#PropertyTypeWithMetadata",
  ConstructPropertyTypeParams: "@blockprotocol/core#JsonObject",

  Entity: "@local/hash-subgraph#Entity",
  EntityRecordId: "@local/hash-subgraph#EntityRecordId",
  EntityMetadata: "@local/hash-subgraph#EntityMetadata",
  EntityStructuralQuery: "@local/hash-graph-client#EntityStructuralQuery",
  EntityTemporalVersioningMetadata:
    "@local/hash-subgraph#EntityTemporalVersioningMetadata",
  EntityPropertiesObject: "@local/hash-subgraph#EntityPropertiesObject",

  UserPermissionsOnEntities: "@blockprotocol/core#JsonObject",
  UserPermissions: "@blockprotocol/core#JsonObject",

  GraphElementVertexId: "@local/hash-subgraph#GraphElementVertexId",
  Edges: "@local/hash-subgraph#Edges",
  Vertices: "@local/hash-subgraph#Vertices",
  LinkData: "@local/hash-subgraph#LinkData",
  SubgraphTemporalAxes: "@local/hash-subgraph#SubgraphTemporalAxes",

  OwnedById: "@local/hash-subgraph#OwnedById",
  RecordCreatedById: "@local/hash-subgraph#RecordCreatedById",
  AccountId: "@local/hash-subgraph#AccountId",
  AccountGroupId: "@local/hash-subgraph#AccountGroupId",
  AuthorizationSubjectId: "@local/hash-subgraph#AuthorizationSubjectId",
  EntityId: "@local/hash-subgraph#EntityId",

  EntityUuid: "@local/hash-subgraph#EntityUuid",
  Uuid: "@local/hash-subgraph#Uuid",

  OntologyTemporalMetadata: "@local/hash-graph-client#OntologyTemporalMetadata",
};
