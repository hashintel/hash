export const scalars = {
  BaseUrl: "@blockprotocol/type-system#BaseUrl",
  VersionedUrl: "@blockprotocol/type-system#VersionedUrl",

  Date: "string",

  JSONObject: "@blockprotocol/core#JsonObject",
  QueryOperationInput: "@blockprotocol/graph#QueryOperationInput",

  TextToken: "@local/hash-isomorphic-utils/types#TextToken",

  HasIndexedContentProperties:
    "@local/hash-isomorphic-utils/system-types/shared#HasIndexedContentProperties",
  HasSpatiallyPositionedContentProperties:
    "@local/hash-isomorphic-utils/system-types/canvas#HasSpatiallyPositionedContentProperties",

  DataTypeWithMetadata: "@blockprotocol/type-system#DataTypeWithMetadata",
  ConstructDataTypeParams:
    "@local/hash-graph-sdk/ontology#ConstructDataTypeParams",
  DataTypeFullConversionTargetsMap:
    "@local/hash-graph-sdk/ontology#DataTypeFullConversionTargetsMap",
  DataTypeDirectConversionsMap:
    "@local/hash-graph-sdk/ontology#DataTypeDirectConversionsMap",

  ClosedMultiEntityType: "@blockprotocol/type-system#ClosedMultiEntityType",
  ClosedMultiEntityTypesRootMap:
    "@local/hash-graph-sdk/ontology#ClosedMultiEntityTypesRootMap",
  ClosedMultiEntityTypesDefinitions:
    "@local/hash-graph-sdk/ontology#ClosedMultiEntityTypesDefinitions",
  EntityTypeWithMetadata: "@blockprotocol/type-system#EntityTypeWithMetadata",
  ConstructEntityTypeParams:
    "@local/hash-graph-sdk/ontology#ConstructEntityTypeParams",

  PropertyTypeWithMetadata:
    "@blockprotocol/type-system#PropertyTypeWithMetadata",
  ConstructPropertyTypeParams:
    "@local/hash-graph-sdk/ontology#ConstructPropertyTypeParams",

  SerializedEntity: "@local/hash-graph-sdk/entity#SerializedEntity",
  EntityRecordId: "@blockprotocol/type-system#EntityRecordId",
  EntityMetadata: "@blockprotocol/type-system#EntityMetadata",
  EntityRelationAndSubject:
    "@local/hash-graph-sdk/authorization#EntityRelationAndSubjectBranded",
  EntityValidationReport:
    "@local/hash-graph-sdk/validation#EntityValidationReport",
  CountEntitiesParams: "@local/hash-graph-client#CountEntitiesParams",
  GetEntitySubgraphRequest:
    "@local/hash-graph-sdk/entity#GetEntitySubgraphRequest",
  EntityTemporalMetadata: "@blockprotocol/type-system#EntityTemporalMetadata",
  PropertyObject: "@blockprotocol/type-system#PropertyObject",
  PropertyArray: "@blockprotocol/type-system#PropertyArray",
  PropertyValue: "@blockprotocol/type-system#PropertyValue",
  PropertyObjectWithMetadata:
    "@blockprotocol/type-system#PropertyObjectWithMetadata",
  PropertyPatchOperation: "@blockprotocol/type-system#PropertyPatchOperation",
  DiffEntityInput: "@local/hash-graph-sdk/entity#DiffEntityInput",
  DiffEntityResult: "@local/hash-graph-client#DiffEntityResult",
  ValidateEntityParamsComponents:
    "@local/hash-graph-client#ValidateEntityParamsComponents",
  EntityQueryCursor: "@local/hash-graph-client#EntityQueryCursor",
  CreatedByIdsMap: "@local/hash-graph-sdk/entity#CreatedByIdsMap",
  TypeIdsMap: "@local/hash-graph-sdk/entity#TypeIdsMap",
  TypeTitlesMap: "@local/hash-graph-sdk/entity#TypeTitlesMap",
  WebIdsMap: "@local/hash-graph-sdk/entity#WebIdsMap",

  Filter: "@local/hash-graph-client#Filter",

  AggregatedUsageRecord:
    "@local/hash-isomorphic-utils/service-usage#AggregatedUsageRecord",

  UserPermissionsOnEntities:
    "@local/hash-graph-sdk/authorization#UserPermissionsOnEntities",
  UserPermissions: "@local/hash-graph-sdk/authorization#UserPermissions",
  UserPermissionsOnEntityType:
    "@local/hash-graph-sdk/authorization#UserPermissionsOnEntityType",
  UserPermissionsOnDataType:
    "@local/hash-graph-sdk/authorization#UserPermissionsOnDataType",
  ProspectiveUserProperties:
    "@local/hash-isomorphic-utils/system-types/prospectiveuser#ProspectiveUserProperties",

  GraphElementVertexId: "@blockprotocol/graph#GraphElementVertexId",
  Edges: "@blockprotocol/graph#Edges",
  SerializedVertices: "@local/hash-graph-sdk/entity#SerializedVertices",
  LinkData: "@blockprotocol/type-system#LinkData",
  SubgraphTemporalAxes: "@blockprotocol/graph#SubgraphTemporalAxes",

  WebId: "@blockprotocol/type-system#WebId",
  EditionCreatedById: "@blockprotocol/type-system#EditionCreatedById",
  ActorId: "@blockprotocol/type-system#ActorId",
  ActorGroupId: "@blockprotocol/type-system#ActorGroupId",
  AuthorizationSubjectId:
    "@local/hash-graph-sdk/authorization#AuthorizationSubjectId",
  EntityId: "@blockprotocol/type-system#EntityId",

  EntityUuid: "@blockprotocol/type-system#EntityUuid",
  Uuid: "@local/hash-graph-sdk/authorization#Uuid",

  OntologyTemporalMetadata: "@local/hash-graph-client#OntologyTemporalMetadata",

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

  RoleAssignmentStatus: "@local/hash-graph-client#RoleAssignmentStatus",
  RoleUnassignmentStatus: "@local/hash-graph-client#RoleUnassignmentStatus",
};

export const _localRelativeScalars = Object.fromEntries(
  Object.entries(scalars).map(([key, value]) => [
    key,
    value.replace(/@local\/hash-isomorphic-utils\/([^#]+)(#.*)/g, "../$1.js$2"),
  ]),
);
