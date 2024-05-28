export const scalars = {
  BaseUrl: "@local/hash-graph-types/ontology#BaseUrl",
  VersionedUrl: "@blockprotocol/type-system#VersionedUrl",

  Date: "string",

  JSONObject: "@blockprotocol/core#JsonObject",
  QueryOperationInput: "@blockprotocol/graph#QueryOperationInput",

  TextToken: "@local/hash-isomorphic-utils/types#TextToken",

  HasIndexedContentProperties:
    "@local/hash-isomorphic-utils/system-types/shared#HasIndexedContentProperties",
  HasSpatiallyPositionedContentProperties:
    "@local/hash-isomorphic-utils/system-types/canvas#HasSpatiallyPositionedContentProperties",

  DataTypeWithMetadata: "@local/hash-graph-types/ontology#DataTypeWithMetadata",
  ConstructDataTypeParams:
    "@local/hash-isomorphic-utils/data-types#ConstructDataTypeParams",

  EntityTypeWithMetadata:
    "@local/hash-graph-types/ontology#EntityTypeWithMetadata",
  ConstructEntityTypeParams:
    "@local/hash-isomorphic-utils/types#ConstructEntityTypeParams",

  PropertyTypeWithMetadata:
    "@local/hash-graph-types/ontology#PropertyTypeWithMetadata",
  ConstructPropertyTypeParams:
    "@local/hash-isomorphic-utils/types#ConstructPropertyTypeParams",

  Entity: "@local/hash-graph-types/entity#Entity",
  EntityRecordId: "@local/hash-graph-types/entity#EntityRecordId",
  EntityMetadata: "@local/hash-graph-types/entity#EntityMetadata",
  EntityRelationAndSubject: "@local/hash-subgraph#EntityRelationAndSubject",
  GetEntitySubgraphRequest: "@local/hash-graph-client#GetEntitySubgraphRequest",
  EntityTemporalVersioningMetadata:
    "@local/hash-graph-types/entity#EntityTemporalVersioningMetadata",
  EntityPropertiesObject:
    "@local/hash-graph-types/entity#EntityPropertiesObject",

  Filter: "@local/hash-graph-client#Filter",

  AggregatedUsageRecord:
    "@local/hash-isomorphic-utils/service-usage#AggregatedUsageRecord",

  UserPermissionsOnEntities:
    "@local/hash-isomorphic-utils/types#UserPermissionsOnEntities",
  UserPermissions: "@local/hash-isomorphic-utils/types#UserPermissions",
  UserPermissionsOnEntityType:
    "@local/hash-isomorphic-utils/types#UserPermissionsOnEntityType",
  ProspectiveUserProperties:
    "@local/hash-isomorphic-utils/system-types/prospectiveuser#ProspectiveUserProperties",

  GraphElementVertexId: "@local/hash-subgraph#GraphElementVertexId",
  Edges: "@local/hash-subgraph#Edges",
  Vertices: "@local/hash-subgraph#Vertices",
  LinkData: "@local/hash-graph-types/entity#LinkData",
  SubgraphTemporalAxes: "@local/hash-subgraph#SubgraphTemporalAxes",

  OwnedById: "@local/hash-graph-types/web#OwnedById",
  EditionCreatedById: "@local/hash-subgraph#EditionCreatedById",
  AccountId: "@local/hash-graph-types/account#AccountId",
  AccountGroupId: "@local/hash-graph-types/account#AccountGroupId",
  AuthorizationSubjectId:
    "@local/hash-graph-types/authorization#AuthorizationSubjectId",
  EntityId: "@local/hash-graph-types/entity#EntityId",

  EntityUuid: "@local/hash-graph-types/entity#EntityUuid",
  Uuid: "@local/hash-graph-types/branded#Uuid",

  OntologyTemporalMetadata: "@local/hash-graph-client#OntologyTemporalMetadata",

  FlowTrigger: "@local/hash-isomorphic-utils/flows/types#FlowTrigger",
  FlowDefinition: "@local/hash-isomorphic-utils/flows/types#FlowDefinition",
  FlowInputs: "@local/hash-isomorphic-utils/flows/types#FlowInputs",
  ExternalInputRequest:
    "@local/hash-isomorphic-utils/flows/types#ExternalInputRequest",
  ExternalInputResponseWithoutUser:
    "@local/hash-isomorphic-utils/flows/types#ExternalInputResponseWithoutUser",
  StepInput: "@local/hash-isomorphic-utils/flows/types#StepInput",
  StepRunOutput: "@local/hash-isomorphic-utils/flows/types#StepRunOutput",
  StepProgressLog: "@local/hash-isomorphic-utils/flows/types#StepProgressLog",
};
