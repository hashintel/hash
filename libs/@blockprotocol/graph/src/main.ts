/**
 * Defines the main entrypoint to the Block Protocol Graph Module package, with support for temporal versioning.
 * This defines the main types and type-guards used when working with the Graph module.
 */

import type { Entity, EntityVertexId, Subgraph } from "./types.js";

export type {
  BoundedTimeInterval,
  ConstrainsLinkDestinationsOnEdge,
  ConstrainsLinksOnEdge,
  ConstrainsPropertiesOnEdge,
  ConstrainsValuesOnEdge,
  CreateEntityData,
  CreateEntityTypeData,
  CreatePropertyTypeData,
  CreateResourceError,
  DataTypeRootType,
  DataTypeVertex,
  DataTypeWithMetadata,
  DeleteEntityData,
  EdgeResolveDepths,
  Edges,
  Entity,
  EntityId,
  EntityIdWithInterval,
  EntityIdWithTimestamp,
  EntityMetadata,
  EntityPropertiesObject,
  EntityPropertyValue,
  EntityRecordId,
  EntityRevisionId,
  EntityRootType,
  EntityTemporalVersioningMetadata,
  EntityTypeRootType,
  EntityTypeVertex,
  EntityTypeWithMetadata,
  EntityVertex,
  EntityVertexId,
  ExclusiveLimitedTemporalBound,
  FileAtUrlData,
  FileData,
  FilterOperatorRequiringValue,
  FilterOperatorType,
  FilterOperatorWithoutValue,
  GetDataTypeData,
  GetEntityData,
  GetEntityTypeData,
  GetPropertyTypeData,
  GraphBlockMessageCallbacks,
  GraphBlockMessages,
  GraphElementForIdentifier,
  GraphElementIdentifiers,
  GraphElementVertexId,
  GraphEmbedderMessageCallbacks,
  GraphEmbedderMessages,
  GraphResolveDepths,
  HasLeftEntityEdge,
  HasRightEntityEdge,
  IdentifierForGraphElement,
  InclusiveLimitedTemporalBound,
  IncomingLinkEdge,
  InheritsFromEdge,
  IsInheritedByEdge,
  IsOfTypeEdge,
  IsTypeOfEdge,
  JsonObject,
  JsonValue,
  KnowledgeGraphEdgeKind,
  KnowledgeGraphOutwardEdge,
  KnowledgeGraphRootedEdges,
  KnowledgeGraphVertex,
  KnowledgeGraphVertices,
  LimitedTemporalBound,
  LinkData,
  LinkDestinationsConstrainedByEdge,
  LinkEntityAndRightEntity,
  LinksConstrainedByEdge,
  MultiFilter,
  MultiFilterOperatorType,
  MultiSort,
  OntologyEdgeKind,
  OntologyElementMetadata,
  OntologyOutwardEdge,
  OntologyRootedEdges,
  OntologyTypeRecordId,
  OntologyTypeRevisionId,
  OntologyTypeVertexId,
  OntologyVertex,
  OntologyVertices,
  OutgoingEdgeResolveDepth,
  OutgoingLinkEdge,
  OutwardEdge,
  PinnedTemporalAxis,
  PinnedTemporalAxisUnresolved,
  PropertiesConstrainedByEdge,
  PropertyTypeRootType,
  PropertyTypeVertex,
  PropertyTypeWithMetadata,
  QueryDataTypesData,
  QueryDataTypesResult,
  QueryEntitiesData,
  QueryEntitiesResult,
  QueryEntityTypesData,
  QueryEntityTypesResult,
  QueryOperationInput,
  QueryPropertyTypesData,
  QueryPropertyTypesResult,
  QueryTemporalAxes,
  QueryTemporalAxesUnresolved,
  ReadOrModifyResourceError,
  RemoteFileEntity,
  RemoteFileEntityProperties,
  SharedEdgeKind,
  SimpleProperties,
  Sort,
  Subgraph,
  SubgraphRootType,
  SubgraphTemporalAxes,
  TemporalAxis,
  TemporalBound,
  TimeInterval,
  TimeIntervalUnresolved,
  Timestamp,
  Unbounded,
  UpdateEntityData,
  UpdateEntityTypeData,
  UpdatePropertyTypeData,
  UploadFileData,
  UploadFileReturn,
  ValuesConstrainedByEdge,
  VariableTemporalAxis,
  VariableTemporalAxisUnresolved,
  Vertex,
  VertexId,
  Vertices,
} from "./types.js";
export {
  isConstrainsLinkDestinationsOnEdge,
  isConstrainsLinksOnEdge,
  isConstrainsPropertiesOnEdge,
  isConstrainsValuesOnEdge,
  isDataTypeVertex,
  isEntityRecordId,
  isEntityTypeVertex,
  isEntityVertex,
  isEntityVertexId,
  isFileAtUrlData,
  isFileData,
  isHasLeftEntityEdge,
  isHasRightEntityEdge,
  isIncomingLinkEdge,
  isInheritsFromEdge,
  isIsInheritedByEdge,
  isIsOfTypeEdge,
  isIsTypeOfEdge,
  isKnowledgeGraphEdgeKind,
  isKnowledgeGraphOutwardEdge,
  isLinkDestinationsConstrainedByEdge,
  isLinksConstrainedByEdge,
  isOntologyEdgeKind,
  isOntologyOutwardEdge,
  isOntologyTypeRecordId,
  isOntologyTypeVertexId,
  isOutgoingLinkEdge,
  isPropertiesConstrainedByEdge,
  isPropertyTypeVertex,
  isSharedEdgeKind,
  isValuesConstrainedByEdge,
} from "./types.js";

// import {
//   BlockGraphProperties as BlockGraphPropertiesGeneral,
// } from "../types.js"

export { GraphBlockHandler } from "./graph-block-handler.js";
export { GraphEmbedderHandler } from "./graph-embedder-handler.js";

/*
 @todo - For some reason, exporting this alias breaks inference of generics when passed into things
 */
// export type BlockGraphProperties<RootEntity extends Entity = Entity> =
//   BlockGraphPropertiesGeneral<true, RootEntity>
export interface BlockGraphProperties<RootEntity extends Entity = Entity> {
  /**
   * The 'graph' object contains messages sent under the graph module from the app to the block.
   * They are sent on initialization and again when the application has new values to send.
   * One such message is 'graph.blockEntity', which is a data entity fitting the block's schema (its type).
   *
   * @see https://blockprotocol.org/spec/graph#message-definitions for a full list
   */
  graph: {
    blockEntitySubgraph: Subgraph<{
      vertexId: EntityVertexId;
      element: RootEntity;
    }>;
    readonly?: boolean;
  };
}
