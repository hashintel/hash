import type { MessageCallback, MessageReturn } from "@blockprotocol/core";

import type {
  CreateEntityData,
  DeleteEntityData,
  Entity,
  GetEntityData,
  QueryEntitiesData,
  QueryEntitiesResult,
  UpdateEntityData,
} from "./entity.js";
import type { UploadFileData, UploadFileReturn } from "./file.js";
import type {
  CreateEntityTypeData,
  CreatePropertyTypeData,
  EntityTypeWithMetadata,
  GetPropertyTypeData,
  PropertyTypeWithMetadata,
  QueryPropertyTypesData,
  QueryPropertyTypesResult,
  UpdateEntityTypeData,
  UpdatePropertyTypeData,
} from "./ontology.js";
import type {
  GetEntityTypeData,
  QueryEntityTypesData,
  QueryEntityTypesResult,
} from "./ontology/entity-type.js";
import type {
  DataTypeRootType,
  EntityRootType,
  EntityTypeRootType,
  EntityVertexId,
  GetDataTypeData,
  PropertyTypeRootType,
  QueryDataTypesData,
  QueryDataTypesResult,
  Subgraph,
} from "./subgraph.js";

export interface BlockGraphProperties<RootEntity extends Entity = Entity> {
  /**
   * The 'graph' object contains messages sent under the graph module from the app to the block.
   * They are sent on initialization and again when the application has new values to send.
   * One such message is 'graph.blockEntitySubgraph', which is a data entity fitting the block's schema (its type).
   *
   * @see https://blockprotocol.org/spec/graph#message-definitions for a full list
   */
  graph: {
    blockEntitySubgraph?: Subgraph<{
      vertexId: EntityVertexId;
      element: RootEntity;
    }>;
    readonly?: boolean;
  };
}

export interface GraphBlockMessageCallbacks {
  blockEntitySubgraph: MessageCallback<Subgraph<EntityRootType>, null>;
  readonly: MessageCallback<boolean, null>;
}

export type GraphEmbedderMessages<
  Key extends
    keyof GraphBlockMessageCallbacks = keyof GraphBlockMessageCallbacks,
> = {
  [key in Key]: ({
    data,
    errors,
  }: Parameters<GraphBlockMessageCallbacks[key]>[0]) => ReturnType<
    GraphBlockMessageCallbacks[key]
  >;
};

export type CreateResourceError =
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "INVALID_INPUT"
  | "NOT_IMPLEMENTED";

export type ReadOrModifyResourceError =
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "NOT_IMPLEMENTED";

/**
 * @todo Generate these types from the JSON definition, to avoid manually keeping the JSON and types in sync.
 */
export interface GraphEmbedderMessageCallbacks {
  createEntity: MessageCallback<
    CreateEntityData,
    null,
    MessageReturn<Entity>,
    CreateResourceError
  >;
  updateEntity: MessageCallback<
    UpdateEntityData,
    null,
    MessageReturn<Entity>,
    ReadOrModifyResourceError
  >;
  deleteEntity: MessageCallback<
    DeleteEntityData,
    null,
    MessageReturn<true>,
    ReadOrModifyResourceError
  >;
  getEntity: MessageCallback<
    GetEntityData,
    null,
    MessageReturn<Subgraph<EntityRootType>>,
    ReadOrModifyResourceError
  >;
  queryEntities: MessageCallback<
    QueryEntitiesData,
    null,
    MessageReturn<QueryEntitiesResult<Subgraph<EntityRootType>>>,
    ReadOrModifyResourceError
  >;
  createEntityType: MessageCallback<
    CreateEntityTypeData,
    null,
    MessageReturn<EntityTypeWithMetadata>,
    CreateResourceError
  >;
  updateEntityType: MessageCallback<
    UpdateEntityTypeData,
    null,
    MessageReturn<EntityTypeWithMetadata>,
    ReadOrModifyResourceError
  >;
  getEntityType: MessageCallback<
    GetEntityTypeData,
    null,
    MessageReturn<Subgraph<EntityTypeRootType>>,
    ReadOrModifyResourceError
  >;
  queryEntityTypes: MessageCallback<
    QueryEntityTypesData,
    null,
    MessageReturn<QueryEntityTypesResult<Subgraph<EntityTypeRootType>>>,
    ReadOrModifyResourceError
  >;
  createPropertyType: MessageCallback<
    CreatePropertyTypeData,
    null,
    MessageReturn<PropertyTypeWithMetadata>,
    CreateResourceError
  >;
  updatePropertyType: MessageCallback<
    UpdatePropertyTypeData,
    null,
    MessageReturn<PropertyTypeWithMetadata>,
    ReadOrModifyResourceError
  >;
  getPropertyType: MessageCallback<
    GetPropertyTypeData,
    null,
    MessageReturn<Subgraph<PropertyTypeRootType>>,
    ReadOrModifyResourceError
  >;
  queryPropertyTypes: MessageCallback<
    QueryPropertyTypesData,
    null,
    MessageReturn<QueryPropertyTypesResult<Subgraph<PropertyTypeRootType>>>,
    ReadOrModifyResourceError
  >;
  getDataType: MessageCallback<
    GetDataTypeData,
    null,
    MessageReturn<Subgraph<DataTypeRootType>>,
    ReadOrModifyResourceError
  >;
  queryDataTypes: MessageCallback<
    QueryDataTypesData,
    null,
    MessageReturn<QueryDataTypesResult<Subgraph<DataTypeRootType>>>,
    ReadOrModifyResourceError
  >;
  requestLinkedQuery: MessageCallback<
    null,
    null,
    MessageReturn<null>,
    "NOT_IMPLEMENTED"
  >;
  /** @todo - Reimplement linked queries */
  // createLinkedQuery: MessageCallback<
  //   CreateLinkedQueryData,
  //   null,
  //   MessageReturn<LinkedQueryDefinition>,
  //   CreateResourceError
  // >;
  // updateLinkedQuery: MessageCallback<
  //   UpdateLinkedQueryData,
  //   null,
  //   MessageReturn<LinkedQueryDefinition>,
  //   ReadOrModifyResourceError
  // >;
  // deleteLinkedQuery: MessageCallback<
  //   DeleteLinkedQueryData,
  //   null,
  //   MessageReturn<true>,
  //   ReadOrModifyResourceError
  // >;
  // getLinkedQuery: MessageCallback<
  //   GetLinkedQueryData,
  //   null,
  //   MessageReturn<LinkedQueryDefinition>,
  //   ReadOrModifyResourceError
  // >;
  uploadFile: MessageCallback<
    UploadFileData,
    null,
    MessageReturn<UploadFileReturn>,
    CreateResourceError
  >;
}

export type GraphBlockMessages<
  Key extends
    keyof GraphEmbedderMessageCallbacks = keyof GraphEmbedderMessageCallbacks,
> = {
  [key in Key]: ({
    data,
    errors,
  }: Parameters<GraphEmbedderMessageCallbacks[key]>[0]) => ReturnType<
    GraphEmbedderMessageCallbacks[key]
  >;
};
