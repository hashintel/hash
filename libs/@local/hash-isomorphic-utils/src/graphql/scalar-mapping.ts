export const scalars = {
  BaseUrl: "@blockprotocol/type-system#BaseUrl",

  Date: "string",

  JSONObject: "@blockprotocol/core#JsonObject",
  QueryOperationInput: "@blockprotocol/graph#QueryOperationInput",
  VersionedUrl: "@blockprotocol/type-system#VersionedUrl",

  UnknownEntityProperties:
    "@local/hash-isomorphic-utils/types#UnknownEntityProperties",
  TextToken: "@local/hash-isomorphic-utils/types#TextToken",

  HasIndexedContentProperties:
    "@local/hash-isomorphic-utils/system-types/shared#HasIndexedContentProperties",
  HasSpatiallyPositionedContentProperties:
    "@local/hash-isomorphic-utils/system-types/canvas#HasSpatiallyPositionedContentProperties",

  DataTypeWithMetadata: "@local/hash-subgraph#DataTypeWithMetadata",
  ConstructDataTypeParams:
    "@local/hash-isomorphic-utils/types#ConstructDataTypeParams",

  EntityTypeWithMetadata: "@local/hash-subgraph#EntityTypeWithMetadata",
  ConstructEntityTypeParams:
    "@local/hash-isomorphic-utils/types#ConstructEntityTypeParams",

  PropertyTypeWithMetadata: "@local/hash-subgraph#PropertyTypeWithMetadata",
  ConstructPropertyTypeParams:
    "@local/hash-isomorphic-utils/types#ConstructPropertyTypeParams",

  Entity: "@local/hash-subgraph#Entity",
  EntityRecordId: "@local/hash-subgraph#EntityRecordId",
  EntityMetadata: "@local/hash-subgraph#EntityMetadata",
  EntityStructuralQuery: "@local/hash-graph-client#EntityStructuralQuery",
  EntityTemporalVersioningMetadata:
    "@local/hash-subgraph#EntityTemporalVersioningMetadata",
  EntityPropertiesObject: "@local/hash-subgraph#EntityPropertiesObject",

  UserPermissionsOnEntities:
    "@local/hash-isomorphic-utils/types#UserPermissionsOnEntities",
  UserPermissions: "@local/hash-isomorphic-utils/types#UserPermissions",

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
