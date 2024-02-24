import { MessageCallback, MessageReturn } from "@blockprotocol/core";

import {
  CreateEntityData,
  DeleteEntityData,
  Entity,
  GetEntityData,
  QueryEntitiesData,
  QueryEntitiesResult,
  UpdateEntityData,
} from "./entity.js";
import { UploadFileData, UploadFileReturn } from "./file.js";
import {
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
import {
  GetEntityTypeData,
  QueryEntityTypesData,
  QueryEntityTypesResult,
} from "./ontology/entity-type.js";
import {
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

export type BlockGraphProperties<
  Temporal extends boolean,
  RootEntity extends Entity<Temporal> = Entity<Temporal>,
> = {
  /**
   * The 'graph' object contains messages sent under the graph module from the app to the block.
   * They are sent on initialization and again when the application has new values to send.
   * One such message is 'graph.blockEntitySubgraph', which is a data entity fitting the block's schema (its type).
   * @see https://blockprotocol.org/spec/graph#message-definitions for a full list
   */
  graph: {
    blockEntitySubgraph?: Subgraph<
      Temporal,
      {
        vertexId: EntityVertexId;
        element: RootEntity;
      }
    >;
    readonly?: boolean;
  };
};

export type GraphBlockMessageCallbacks<Temporal extends boolean> = {
  blockEntitySubgraph: MessageCallback<
    Subgraph<Temporal, EntityRootType<Temporal>>,
    null
  >;
  readonly: MessageCallback<boolean, null>;
};

export type GraphEmbedderMessages<
  Temporal extends boolean,
  Key extends
    keyof GraphBlockMessageCallbacks<Temporal> = keyof GraphBlockMessageCallbacks<Temporal>,
> = {
  [key in Key]: ({
    data,
    errors,
  }: Parameters<GraphBlockMessageCallbacks<Temporal>[key]>[0]) => ReturnType<
    GraphBlockMessageCallbacks<Temporal>[key]
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
 * @todo Generate these types from the JSON definition, to avoid manually keeping the JSON and types in sync
 */
export type GraphEmbedderMessageCallbacks<Temporal extends boolean> = {
  createEntity: MessageCallback<
    CreateEntityData,
    null,
    MessageReturn<Entity<Temporal>>,
    CreateResourceError
  >;
  updateEntity: MessageCallback<
    UpdateEntityData,
    null,
    MessageReturn<Entity<Temporal>>,
    ReadOrModifyResourceError
  >;
  deleteEntity: MessageCallback<
    DeleteEntityData,
    null,
    MessageReturn<true>,
    ReadOrModifyResourceError
  >;
  getEntity: MessageCallback<
    GetEntityData<boolean>,
    null,
    MessageReturn<Subgraph<Temporal, EntityRootType<Temporal>>>,
    ReadOrModifyResourceError
  >;
  queryEntities: MessageCallback<
    QueryEntitiesData<boolean>,
    null,
    MessageReturn<
      QueryEntitiesResult<
        Temporal,
        Subgraph<Temporal, EntityRootType<Temporal>>
      >
    >,
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
    MessageReturn<Subgraph<Temporal, EntityTypeRootType>>,
    ReadOrModifyResourceError
  >;
  queryEntityTypes: MessageCallback<
    QueryEntityTypesData,
    null,
    MessageReturn<
      QueryEntityTypesResult<Subgraph<Temporal, EntityTypeRootType>>
    >,
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
    MessageReturn<Subgraph<Temporal, PropertyTypeRootType>>,
    ReadOrModifyResourceError
  >;
  queryPropertyTypes: MessageCallback<
    QueryPropertyTypesData,
    null,
    MessageReturn<
      QueryPropertyTypesResult<Subgraph<Temporal, PropertyTypeRootType>>
    >,
    ReadOrModifyResourceError
  >;
  getDataType: MessageCallback<
    GetDataTypeData,
    null,
    MessageReturn<Subgraph<Temporal, DataTypeRootType>>,
    ReadOrModifyResourceError
  >;
  queryDataTypes: MessageCallback<
    QueryDataTypesData,
    null,
    MessageReturn<QueryDataTypesResult<Subgraph<Temporal, DataTypeRootType>>>,
    ReadOrModifyResourceError
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
    MessageReturn<UploadFileReturn<Temporal>>,
    CreateResourceError
  >;
};

export type GraphBlockMessages<
  Temporal extends boolean,
  Key extends
    keyof GraphEmbedderMessageCallbacks<Temporal> = keyof GraphEmbedderMessageCallbacks<Temporal>,
> = {
  [key in Key]: ({
    data,
    errors,
  }: Parameters<GraphEmbedderMessageCallbacks<Temporal>[key]>[0]) => ReturnType<
    GraphEmbedderMessageCallbacks<Temporal>[key]
  >;
};
