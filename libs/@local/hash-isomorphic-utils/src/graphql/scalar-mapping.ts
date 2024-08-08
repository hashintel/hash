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

  SerializedEntity: "@local/hash-graph-sdk/entity#SerializedEntity",
  EntityRecordId: "@local/hash-graph-types/entity#EntityRecordId",
  EntityMetadata: "@local/hash-graph-types/entity#EntityMetadata",
  EntityRelationAndSubject: "@local/hash-subgraph#EntityRelationAndSubject",
  GetEntitySubgraphRequest: "@local/hash-graph-client#GetEntitySubgraphRequest",
  EntityTemporalVersioningMetadata:
    "@local/hash-graph-types/entity#EntityTemporalVersioningMetadata",
  PropertyObject: "@local/hash-graph-types/entity#PropertyObject",
  PropertyObjectWithMetadata:
    "@local/hash-graph-types/entity#PropertyObjectWithMetadata",
  PropertyPatchOperation:
    "@local/hash-graph-types/entity#PropertyPatchOperation",
  DiffEntityInput: "@local/hash-subgraph#DiffEntityInput",
  DiffEntityResult: "@local/hash-graph-client#DiffEntityResult",

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
  SerializedVertices: "@local/hash-subgraph#SerializedVertices",
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

  FlowCheckpoint: "@local/hash-isomorphic-utils/flows/types#FlowCheckpoint",
  FlowTrigger: "@local/hash-isomorphic-utils/flows/types#FlowTrigger",
  FlowDataSources: "@local/hash-isomorphic-utils/flows/types#FlowDataSources",
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

export const _localRelativeScalars = Object.fromEntries(
  Object.entries(scalars).map(([key, value]) => [
    key,
    value.replace(/@local\/hash-isomorphic-utils\/([^#]+)(#.*)/g, "../$1.js$2"),
  ]),
);
