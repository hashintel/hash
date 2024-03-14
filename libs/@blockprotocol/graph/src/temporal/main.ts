/**
 * Defines the main entrypoint to the Block Protocol Graph Module package, with support for temporal versioning.
 * This defines the main types and type-guards used when working with the Graph module.
 */

import type { BaseUrl } from "@blockprotocol/type-system/slim";

import type {
  BoundedTimeInterval as BoundedTimeIntervalGeneral,
  ConstrainsLinkDestinationsOnEdge as ConstrainsLinkDestinationsOnEdgeGeneral,
  ConstrainsLinksOnEdge as ConstrainsLinksOnEdgeGeneral,
  ConstrainsPropertiesOnEdge as ConstrainsPropertiesOnEdgeGeneral,
  ConstrainsValuesOnEdge as ConstrainsValuesOnEdgeGeneral,
  CreateEntityData as CreateEntityDataGeneral,
  CreateEntityTypeData as CreateEntityTypeDataGeneral,
  CreatePropertyTypeData as CreatePropertyTypeDataGeneral,
  CreateResourceError as CreateResourceErrorGeneral,
  DataTypeRootType as DataTypeRootTypeGeneral,
  DataTypeVertex as DataTypeVertexGeneral,
  DataTypeWithMetadata as DataTypeWithMetadataGeneral,
  DeleteEntityData as DeleteEntityDataGeneral,
  EdgeResolveDepths as EdgeResolveDepthsGeneral,
  Edges as EdgesGeneral,
  Entity as EntityGeneral,
  EntityId as EntityIdGeneral,
  EntityIdWithInterval as EntityIdWithIntervalGeneral,
  EntityIdWithTimestamp as EntityIdWithTimestampGeneral,
  EntityMetadata as EntityMetadataGeneral,
  EntityPropertiesObject as EntityPropertiesObjectGeneral,
  EntityPropertyValue as EntityPropertyValueGeneral,
  EntityRecordId as EntityRecordIdGeneral,
  EntityRevisionId as EntityRevisionIdGeneral,
  EntityRootType as EntityRootTypeGeneral,
  EntityTemporalVersioningMetadata as EntityTemporalVersioningMetadataGeneral,
  EntityTypeRootType as EntityTypeRootTypeGeneral,
  EntityTypeVertex as EntityTypeVertexGeneral,
  EntityTypeWithMetadata as EntityTypeWithMetadataGeneral,
  EntityVertex as EntityVertexGeneral,
  EntityVertexId as EntityVertexIdGeneral,
  ExclusiveLimitedTemporalBound as ExclusiveLimitedTemporalBoundGeneral,
  FileAtUrlData as FileAtUrlDataGeneral,
  FileData as FileDataGeneral,
  FilterOperatorRequiringValue as FilterOperatorRequiringValueGeneral,
  FilterOperatorType as FilterOperatorTypeGeneral,
  FilterOperatorWithoutValue as FilterOperatorWithoutValueGeneral,
  GetDataTypeData as GetDataTypeDataGeneral,
  GetEntityData as GetEntityDataGeneral,
  GetEntityTypeData as GetEntityTypeDataGeneral,
  GetPropertyTypeData as GetPropertyTypeDataGeneral,
  GraphBlockMessageCallbacks as GraphBlockMessageCallbacksGeneral,
  GraphBlockMessages as GraphBlockMessagesGeneral,
  GraphElementForIdentifier as GraphElementForIdentifierGeneral,
  GraphElementIdentifiers as GraphElementIdentifiersGeneral,
  GraphElementVertexId as GraphElementVertexIdGeneral,
  GraphEmbedderMessageCallbacks as GraphEmbedderMessageCallbacksGeneral,
  GraphEmbedderMessages as GraphEmbedderMessagesGeneral,
  GraphResolveDepths as GraphResolveDepthsGeneral,
  HasLeftEntityEdge as HasLeftEntityEdgeGeneral,
  HasRightEntityEdge as HasRightEntityEdgeGeneral,
  IdentifierForGraphElement as IdentifierForGraphElementGeneral,
  InclusiveLimitedTemporalBound as InclusiveLimitedTemporalBoundGeneral,
  IncomingLinkEdge as IncomingLinkEdgeGeneral,
  InheritsFromEdge as InheritsFromEdgeGeneral,
  IsInheritedByEdge as IsInheritedByEdgeGeneral,
  IsOfTypeEdge as IsOfTypeEdgeGeneral,
  IsTypeOfEdge as IsTypeOfEdgeGeneral,
  JsonObject as JsonObjectGeneral,
  JsonValue as JsonValueGeneral,
  KnowledgeGraphEdgeKind as KnowledgeGraphEdgeKindGeneral,
  KnowledgeGraphOutwardEdge as KnowledgeGraphOutwardEdgeGeneral,
  KnowledgeGraphRootedEdges as KnowledgeGraphRootedEdgesGeneral,
  KnowledgeGraphVertex as KnowledgeGraphVertexGeneral,
  KnowledgeGraphVertices as KnowledgeGraphVerticesGeneral,
  LimitedTemporalBound as LimitedTemporalBoundGeneral,
  LinkData as LinkDataGeneral,
  LinkDestinationsConstrainedByEdge as LinkDestinationsConstrainedByEdgeGeneral,
  LinkEntityAndRightEntity as LinkEntityAndRightEntityGeneral,
  LinksConstrainedByEdge as LinksConstrainedByEdgeGeneral,
  MultiFilter as MultiFilterGeneral,
  MultiFilterOperatorType as MultiFilterOperatorTypeGeneral,
  MultiSort as MultiSortGeneral,
  OntologyEdgeKind as OntologyEdgeKindGeneral,
  OntologyElementMetadata as OntologyElementMetadataGeneral,
  OntologyOutwardEdge as OntologyOutwardEdgeGeneral,
  OntologyRootedEdges as OntologyRootedEdgesGeneral,
  OntologyTypeRecordId as OntologyTypeRecordIdGeneral,
  OntologyTypeRevisionId as OntologyTypeRevisionIdGeneral,
  OntologyTypeVertexId as OntologyTypeVertexIdGeneral,
  OntologyVertex as OntologyVertexGeneral,
  OntologyVertices as OntologyVerticesGeneral,
  OutgoingEdgeResolveDepth as OutgoingEdgeResolveDepthGeneral,
  OutgoingLinkEdge as OutgoingLinkEdgeGeneral,
  OutwardEdge as OutwardEdgeGeneral,
  PinnedTemporalAxis as PinnedTemporalAxisGeneral,
  PinnedTemporalAxisUnresolved as PinnedTemporalAxisUnresolvedGeneral,
  PropertiesConstrainedByEdge as PropertiesConstrainedByEdgeGeneral,
  PropertyTypeRootType as PropertyTypeRootTypeGeneral,
  PropertyTypeVertex as PropertyTypeVertexGeneral,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataGeneral,
  QueryDataTypesData as QueryDataTypesDataGeneral,
  QueryDataTypesResult as QueryDataTypesResultGeneral,
  QueryEntitiesData as QueryEntitiesDataGeneral,
  QueryEntitiesResult as QueryEntitiesResultGeneral,
  QueryEntityTypesData as QueryEntityTypesDataGeneral,
  QueryEntityTypesResult as QueryEntityTypesResultGeneral,
  QueryOperationInput as QueryOperationInputGeneral,
  QueryPropertyTypesData as QueryPropertyTypesDataGeneral,
  QueryPropertyTypesResult as QueryPropertyTypesResultGeneral,
  QueryTemporalAxes as QueryTemporalAxesGeneral,
  QueryTemporalAxesUnresolved as QueryTemporalAxesUnresolvedGeneral,
  ReadOrModifyResourceError as ReadOrModifyResourceErrorGeneral,
  RemoteFileEntity as RemoteFileEntityGeneral,
  RemoteFileEntityProperties as RemoteFileEntityPropertiesGeneral,
  SharedEdgeKind as SharedEdgeKindGeneral,
  SimpleProperties as SimplePropertiesGeneral,
  Sort as SortGeneral,
  Subgraph as SubgraphGeneral,
  SubgraphRootType as SubgraphRootTypeGeneral,
  SubgraphTemporalAxes as SubgraphTemporalAxesGeneral,
  TemporalAxis as TemporalAxisGeneral,
  TemporalBound as TemporalBoundGeneral,
  TimeInterval as TimeIntervalGeneral,
  TimeIntervalUnresolved as TimeIntervalUnresolvedGeneral,
  Timestamp as TimestampGeneral,
  Unbounded as UnboundedGeneral,
  UpdateEntityData as UpdateEntityDataGeneral,
  UpdateEntityTypeData as UpdateEntityTypeDataGeneral,
  UpdatePropertyTypeData as UpdatePropertyTypeDataGeneral,
  UploadFileData as UploadFileDataGeneral,
  UploadFileReturn as UploadFileReturnGeneral,
  ValuesConstrainedByEdge as ValuesConstrainedByEdgeGeneral,
  VariableTemporalAxis as VariableTemporalAxisGeneral,
  VariableTemporalAxisUnresolved as VariableTemporalAxisUnresolvedGeneral,
  Vertex as VertexGeneral,
  VertexId as VertexIdGeneral,
  Vertices as VerticesGeneral,
} from "../shared/types.js";
import {
  isConstrainsLinkDestinationsOnEdge as isConstrainsLinkDestinationsOnEdgeGeneral,
  isConstrainsLinksOnEdge as isConstrainsLinksOnEdgeGeneral,
  isConstrainsPropertiesOnEdge as isConstrainsPropertiesOnEdgeGeneral,
  isConstrainsValuesOnEdge as isConstrainsValuesOnEdgeGeneral,
  isDataTypeVertex as isDataTypeVertexGeneral,
  isEntityRecordId as isEntityRecordIdGeneral,
  isEntityTypeVertex as isEntityTypeVertexGeneral,
  isEntityVertex as isEntityVertexGeneral,
  isEntityVertexId as isEntityVertexIdGeneral,
  isFileAtUrlData as isFileAtUrlDataGeneral,
  isFileData as isFileDataGeneral,
  isHasLeftEntityEdge as isHasLeftEntityEdgeGeneral,
  isHasRightEntityEdge as isHasRightEntityEdgeGeneral,
  isIncomingLinkEdge as isIncomingLinkEdgeGeneral,
  isInheritsFromEdge as isInheritsFromEdgeGeneral,
  isIsInheritedByEdge as isIsInheritedByEdgeGeneral,
  isIsOfTypeEdge as isIsOfTypeEdgeGeneral,
  isIsTypeOfEdge as isIsTypeOfEdgeGeneral,
  isKnowledgeGraphEdgeKind as isKnowledgeGraphEdgeKindGeneral,
  isKnowledgeGraphOutwardEdge as isKnowledgeGraphOutwardEdgeGeneral,
  isLinkDestinationsConstrainedByEdge as isLinkDestinationsConstrainedByEdgeGeneral,
  isLinksConstrainedByEdge as isLinksConstrainedByEdgeGeneral,
  isOntologyEdgeKind as isOntologyEdgeKindGeneral,
  isOntologyOutwardEdge as isOntologyOutwardEdgeGeneral,
  isOntologyTypeRecordId as isOntologyTypeRecordIdGeneral,
  isOntologyTypeVertexId as isOntologyTypeVertexIdGeneral,
  isOutgoingLinkEdge as isOutgoingLinkEdgeGeneral,
  isPropertiesConstrainedByEdge as isPropertiesConstrainedByEdgeGeneral,
  isPropertyTypeVertex as isPropertyTypeVertexGeneral,
  isSharedEdgeKind as isSharedEdgeKindGeneral,
  isValuesConstrainedByEdge as isValuesConstrainedByEdgeGeneral,
} from "../shared/types.js";

export {
  type AllOf,
  type Array,
  type BaseUrl,
  DATA_TYPE_META_SCHEMA,
  type DataType,
  type DataTypeReference,
  ENTITY_TYPE_META_SCHEMA,
  type EntityType,
  type EntityTypeReference,
  extractBaseUrl,
  extractVersion,
  getReferencedIdsFromEntityType,
  getReferencedIdsFromPropertyType,
  isPropertyValuesArray,
  type Links,
  type MaybeOneOfEntityTypeReference,
  type MaybeOrderedArray,
  type Object,
  type OneOf,
  type ParseBaseUrlError,
  type ParseVersionedUrlError,
  PROPERTY_TYPE_META_SCHEMA,
  type PropertyType,
  type PropertyTypeReference,
  type PropertyValues,
  type Result,
  validateBaseUrl,
  validateVersionedUrl,
  type ValueOrArray,
  type VersionedUrl,
} from "@blockprotocol/type-system/slim";

// import {
//   BlockGraphProperties as BlockGraphPropertiesGeneral,
// } from "../shared/types.js"

export { GraphBlockHandler } from "./graph-block-handler.js";
export { GraphEmbedderHandler } from "./graph-embedder-handler.js";

/*
 @todo - For some reason, exporting this alias breaks inference of generics when passed into things
 */
// export type BlockGraphProperties<RootEntity extends Entity = Entity> =
//   BlockGraphPropertiesGeneral<true, RootEntity>
export type BlockGraphProperties<RootEntity extends Entity = Entity> = {
  /**
   * The 'graph' object contains messages sent under the graph module from the app to the block.
   * They are sent on initialization and again when the application has new values to send.
   * One such message is 'graph.blockEntity', which is a data entity fitting the block's schema (its type).
   * @see https://blockprotocol.org/spec/graph#message-definitions for a full list
   */
  graph: {
    blockEntitySubgraph: Subgraph<{
      vertexId: EntityVertexId;
      element: RootEntity;
    }>;
    readonly?: boolean;
  };
};
export type GraphBlockMessageCallbacks =
  GraphBlockMessageCallbacksGeneral<true>;
export type GraphEmbedderMessages<
  Key extends
    keyof GraphBlockMessageCallbacks = keyof GraphBlockMessageCallbacks,
> = GraphEmbedderMessagesGeneral<true, Key>;
export type CreateResourceError = CreateResourceErrorGeneral;
export type ReadOrModifyResourceError = ReadOrModifyResourceErrorGeneral;
export type GraphEmbedderMessageCallbacks =
  GraphEmbedderMessageCallbacksGeneral<true>;
export type GraphBlockMessages<
  Key extends
    keyof GraphEmbedderMessageCallbacks = keyof GraphEmbedderMessageCallbacks,
> = GraphBlockMessagesGeneral<true, Key>;
export type JsonObject = JsonObjectGeneral;
export type JsonValue = JsonValueGeneral;
export type EntityId = EntityIdGeneral;
export type EntityRevisionId = EntityRevisionIdGeneral;
export type EntityRecordId = EntityRecordIdGeneral;
export const isEntityRecordId = isEntityRecordIdGeneral;
export type EntityPropertyValue = EntityPropertyValueGeneral;
export type EntityPropertiesObject = EntityPropertiesObjectGeneral;
export type EntityTemporalVersioningMetadata =
  EntityTemporalVersioningMetadataGeneral;
export type EntityMetadata = EntityMetadataGeneral<true>;
export type LinkData = LinkDataGeneral;
export type Entity<
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> = EntityGeneral<true, Properties>;
export type LinkEntityAndRightEntity = LinkEntityAndRightEntityGeneral<true>;
export type CreateEntityData = CreateEntityDataGeneral;
export type GetEntityData = GetEntityDataGeneral<true>;
export type UpdateEntityData = UpdateEntityDataGeneral;
export type DeleteEntityData = DeleteEntityDataGeneral;
export type FilterOperatorType = FilterOperatorTypeGeneral;
export type FilterOperatorWithoutValue = FilterOperatorWithoutValueGeneral;
export type FilterOperatorRequiringValue = FilterOperatorRequiringValueGeneral;
export type MultiFilterOperatorType = MultiFilterOperatorTypeGeneral;
export type MultiFilter = MultiFilterGeneral;
export type Sort = SortGeneral;
export type MultiSort = MultiSortGeneral;
export type QueryOperationInput = QueryOperationInputGeneral;
export type QueryEntitiesData = QueryEntitiesDataGeneral<true>;
export type QueryEntitiesResult<T extends Subgraph<EntityRootType>> =
  QueryEntitiesResultGeneral<true, T>;
export type SimpleProperties<Properties extends EntityPropertiesObject> =
  SimplePropertiesGeneral<Properties>;
export type FileAtUrlData = FileAtUrlDataGeneral;
export type FileData = FileDataGeneral;
export type UploadFileData = UploadFileDataGeneral;
export const isFileAtUrlData = isFileAtUrlDataGeneral;
export const isFileData = isFileDataGeneral;
export type RemoteFileEntityProperties = RemoteFileEntityPropertiesGeneral;
export type RemoteFileEntity = RemoteFileEntityGeneral<true>;
export type UploadFileReturn = UploadFileReturnGeneral<true>;
export type DataTypeWithMetadata = DataTypeWithMetadataGeneral;
export type EntityTypeWithMetadata = EntityTypeWithMetadataGeneral;
export type QueryEntityTypesData = QueryEntityTypesDataGeneral;
export type QueryEntityTypesResult<T extends Subgraph<EntityTypeRootType>> =
  QueryEntityTypesResultGeneral<T>;
export type GetEntityTypeData = GetEntityTypeDataGeneral;
export type CreateEntityTypeData = CreateEntityTypeDataGeneral;
export type UpdateEntityTypeData = UpdateEntityTypeDataGeneral;
export type OntologyElementMetadata = OntologyElementMetadataGeneral;
export type PropertyTypeWithMetadata = PropertyTypeWithMetadataGeneral;
export type QueryPropertyTypesData = QueryPropertyTypesDataGeneral;
export type QueryPropertyTypesResult<T extends Subgraph<PropertyTypeRootType>> =
  QueryPropertyTypesResultGeneral<T>;
export type GetPropertyTypeData = GetPropertyTypeDataGeneral;
export type CreatePropertyTypeData = CreatePropertyTypeDataGeneral;
export type UpdatePropertyTypeData = UpdatePropertyTypeDataGeneral;
export type QueryDataTypesData = QueryDataTypesDataGeneral;
export type QueryDataTypesResult<T extends Subgraph<DataTypeRootType>> =
  QueryDataTypesResultGeneral<T>;
export type GetDataTypeData = GetDataTypeDataGeneral;
export type OntologyTypeRecordId = OntologyTypeRecordIdGeneral;
export const isOntologyTypeRecordId = isOntologyTypeRecordIdGeneral;
export type OntologyTypeRevisionId = OntologyTypeRevisionIdGeneral;
export type OntologyEdgeKind = OntologyEdgeKindGeneral;
export type KnowledgeGraphEdgeKind = KnowledgeGraphEdgeKindGeneral;
export type SharedEdgeKind = SharedEdgeKindGeneral;
export const isOntologyEdgeKind = isOntologyEdgeKindGeneral;
export const isKnowledgeGraphEdgeKind = isKnowledgeGraphEdgeKindGeneral;
export const isSharedEdgeKind = isSharedEdgeKindGeneral;
export type EntityIdWithTimestamp = EntityIdWithTimestampGeneral;
export type EntityIdWithInterval = EntityIdWithIntervalGeneral;
export type OutwardEdge = OutwardEdgeGeneral<true>;
export const isOntologyOutwardEdge = isOntologyOutwardEdgeGeneral;
export const isKnowledgeGraphOutwardEdge = isKnowledgeGraphOutwardEdgeGeneral;
export type OutgoingLinkEdge = OutgoingLinkEdgeGeneral<true>;
export const isOutgoingLinkEdge = isOutgoingLinkEdgeGeneral;
export type HasLeftEntityEdge = HasLeftEntityEdgeGeneral<true>;
export const isHasLeftEntityEdge = isHasLeftEntityEdgeGeneral;
export type HasRightEntityEdge = HasRightEntityEdgeGeneral<true>;
export const isHasRightEntityEdge = isHasRightEntityEdgeGeneral;
export type IncomingLinkEdge = IncomingLinkEdgeGeneral<true>;
export const isIncomingLinkEdge = isIncomingLinkEdgeGeneral;
export type IsOfTypeEdge = IsOfTypeEdgeGeneral;
export const isIsOfTypeEdge = isIsOfTypeEdgeGeneral;
export type KnowledgeGraphOutwardEdge = KnowledgeGraphOutwardEdgeGeneral<true>;
export type InheritsFromEdge = InheritsFromEdgeGeneral;
export const isInheritsFromEdge = isInheritsFromEdgeGeneral;
export type IsInheritedByEdge = IsInheritedByEdgeGeneral;
export const isIsInheritedByEdge = isIsInheritedByEdgeGeneral;
export type ConstrainsValuesOnEdge = ConstrainsValuesOnEdgeGeneral;
export const isConstrainsValuesOnEdge = isConstrainsValuesOnEdgeGeneral;
export type ValuesConstrainedByEdge = ValuesConstrainedByEdgeGeneral;
export const isValuesConstrainedByEdge = isValuesConstrainedByEdgeGeneral;
export type ConstrainsPropertiesOnEdge = ConstrainsPropertiesOnEdgeGeneral;
export const isConstrainsPropertiesOnEdge = isConstrainsPropertiesOnEdgeGeneral;
export type PropertiesConstrainedByEdge = PropertiesConstrainedByEdgeGeneral;
export const isPropertiesConstrainedByEdge =
  isPropertiesConstrainedByEdgeGeneral;
export type ConstrainsLinksOnEdge = ConstrainsLinksOnEdgeGeneral;
export const isConstrainsLinksOnEdge = isConstrainsLinksOnEdgeGeneral;
export type LinksConstrainedByEdge = LinksConstrainedByEdgeGeneral;
export const isLinksConstrainedByEdge = isLinksConstrainedByEdgeGeneral;
export type ConstrainsLinkDestinationsOnEdge =
  ConstrainsLinkDestinationsOnEdgeGeneral;
export const isConstrainsLinkDestinationsOnEdge =
  isConstrainsLinkDestinationsOnEdgeGeneral;
export type LinkDestinationsConstrainedByEdge =
  LinkDestinationsConstrainedByEdgeGeneral;
export const isLinkDestinationsConstrainedByEdge =
  isLinkDestinationsConstrainedByEdgeGeneral;
export type IsTypeOfEdge = IsTypeOfEdgeGeneral<true>;
export const isIsTypeOfEdge = isIsTypeOfEdgeGeneral;
export type OntologyOutwardEdge = OntologyOutwardEdgeGeneral<true>;
export type OntologyRootedEdges = OntologyRootedEdgesGeneral<true>;
export type KnowledgeGraphRootedEdges = KnowledgeGraphRootedEdgesGeneral<true>;
export type Edges = EdgesGeneral<true>;
export type GraphElementIdentifiers = GraphElementIdentifiersGeneral<true>;
export type IdentifierForGraphElement<
  Element extends GraphElementIdentifiers["element"],
> = IdentifierForGraphElementGeneral<true, Element>;
export type GraphElementForIdentifier<
  Identifier extends GraphElementIdentifiers["identifier"],
> = GraphElementForIdentifierGeneral<true, Identifier>;
export type OutgoingEdgeResolveDepth = OutgoingEdgeResolveDepthGeneral;
export type EdgeResolveDepths = EdgeResolveDepthsGeneral;
export type GraphResolveDepths = GraphResolveDepthsGeneral;
export type QueryTemporalAxesUnresolved = QueryTemporalAxesUnresolvedGeneral;
export type QueryTemporalAxes = QueryTemporalAxesGeneral;
export type SubgraphTemporalAxes = SubgraphTemporalAxesGeneral;
export type DataTypeVertex = DataTypeVertexGeneral;
export type PropertyTypeVertex = PropertyTypeVertexGeneral;
export type EntityTypeVertex = EntityTypeVertexGeneral;
export type EntityVertex<
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> = EntityVertexGeneral<true, Properties>;
export type OntologyVertex = OntologyVertexGeneral;
export type KnowledgeGraphVertex<
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> = KnowledgeGraphVertexGeneral<true, Properties>;
export type Vertex<
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> = VertexGeneral<true, Properties>;
export const isDataTypeVertex = isDataTypeVertexGeneral;
export const isPropertyTypeVertex = isPropertyTypeVertexGeneral;
export const isEntityTypeVertex = isEntityTypeVertexGeneral;
export const isEntityVertex = isEntityVertexGeneral<true>;
export type VertexId<BaseId, RevisionId> = VertexIdGeneral<BaseId, RevisionId>;
export type EntityVertexId = EntityVertexIdGeneral;
export type OntologyTypeVertexId = OntologyTypeVertexIdGeneral;
export type GraphElementVertexId = GraphElementVertexIdGeneral;
export const isOntologyTypeVertexId = isOntologyTypeVertexIdGeneral;
export const isEntityVertexId = isEntityVertexIdGeneral;
export type OntologyVertices = OntologyVerticesGeneral;
export type KnowledgeGraphVertices = KnowledgeGraphVerticesGeneral<true>;
export type Vertices = VerticesGeneral<true>;
export type DataTypeRootType = DataTypeRootTypeGeneral;
export type PropertyTypeRootType = PropertyTypeRootTypeGeneral;
export type EntityTypeRootType = EntityTypeRootTypeGeneral;
export type EntityRootType = EntityRootTypeGeneral<true>;
export type SubgraphRootType = SubgraphRootTypeGeneral<true>;
export type Subgraph<RootType extends SubgraphRootType = SubgraphRootType> =
  SubgraphGeneral<true, RootType>;
export type Timestamp = TimestampGeneral;
export type TemporalAxis = TemporalAxisGeneral;
export type LimitedTemporalBound = LimitedTemporalBoundGeneral;
export type InclusiveLimitedTemporalBound =
  InclusiveLimitedTemporalBoundGeneral;
export type ExclusiveLimitedTemporalBound =
  ExclusiveLimitedTemporalBoundGeneral;
export type Unbounded = UnboundedGeneral;
export type TemporalBound = TemporalBoundGeneral;
export type TimeIntervalUnresolved<
  StartBound extends TemporalBound | null,
  EndBound extends TemporalBound | null,
> = TimeIntervalUnresolvedGeneral<StartBound, EndBound>;
export type TimeInterval<
  StartBound extends TemporalBound = TemporalBound,
  EndBound extends TemporalBound = TemporalBound,
> = TimeIntervalGeneral<StartBound, EndBound>;
export type BoundedTimeInterval = BoundedTimeIntervalGeneral;
export type VariableTemporalAxisUnresolved<
  Axis extends TemporalAxis,
  StartBound extends TemporalBound | null = TemporalBound | null,
  EndBound extends LimitedTemporalBound | null = LimitedTemporalBound | null,
> = VariableTemporalAxisUnresolvedGeneral<Axis, StartBound, EndBound>;
export type VariableTemporalAxis<
  Axis extends TemporalAxis,
  StartBound extends TemporalBound = TemporalBound,
  EndBound extends LimitedTemporalBound = LimitedTemporalBound,
> = VariableTemporalAxisGeneral<Axis, StartBound, EndBound>;
export type PinnedTemporalAxisUnresolved<
  Axis extends TemporalAxis,
  PinnedTime extends Timestamp | null = Timestamp | null,
> = PinnedTemporalAxisUnresolvedGeneral<Axis, PinnedTime>;
export type PinnedTemporalAxis<
  Axis extends TemporalAxis,
  PinnedTime extends Timestamp = Timestamp,
> = PinnedTemporalAxisGeneral<Axis, PinnedTime>;
