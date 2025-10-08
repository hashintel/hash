/**
 * Defines the main entrypoint to the Block Protocol Graph Module package, with support for temporal versioning.
 * This defines the main types and type-guards used when working with the Graph module.
 */

import type { Entity } from "@blockprotocol/type-system";

import type { EntityVertexId, Subgraph } from "./types.js";

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
export type {
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
  DeleteEntityData,
  EdgeResolveDepths,
  Edges,
  EntityIdWithInterval,
  EntityIdWithTimestamp,
  EntityRevisionId,
  EntityRootType,
  EntityTypeRootType,
  EntityTypeVertex,
  EntityVertex,
  EntityVertexId,
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
  IncomingLinkEdge,
  InheritsFromEdge,
  IsInheritedByEdge,
  IsOfTypeEdge,
  IsTypeOfEdge,
  KnowledgeGraphEdgeKind,
  KnowledgeGraphOutwardEdge,
  KnowledgeGraphRootedEdges,
  KnowledgeGraphVertex,
  KnowledgeGraphVertices,
  LinkDestinationsConstrainedByEdge,
  LinkEntityAndLeftEntity,
  LinkEntityAndRightEntity,
  LinksConstrainedByEdge,
  MultiFilter,
  MultiFilterOperatorType,
  MultiSort,
  OntologyEdgeKind,
  OntologyOutwardEdge,
  OntologyRootedEdges,
  OntologyTypeVertexId,
  OntologyVertex,
  OntologyVertices,
  OutgoingLinkEdge,
  OutwardEdge,
  PinnedTemporalAxis,
  PinnedTemporalAxisUnresolved,
  PropertiesConstrainedByEdge,
  PropertyTypeRootType,
  PropertyTypeVertex,
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
  TimeIntervalUnresolved,
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
