/**
 * This file contains "knowledge" function signatures of the new type system used to augment the
 * existing set of Block Protocol.
 *
 * These signatures will eventually make their way into the @blockprotocol/graph
 * package and be removed from here.
 */

import { MessageCallback, MessageReturn } from "@blockprotocol/core";
import {
  CreateResourceError,
  QueryOperationInput,
  ReadOrModifyResourceError,
  UploadFileData as BpUploadFileData,
} from "@blockprotocol/graph";
import { VersionedUrl } from "@blockprotocol/type-system";
import { FileV2 as FileEntityType } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityRootType,
  LinkData,
  Subgraph,
} from "@local/hash-subgraph";

import {
  FileEntityCreationInput,
  FileEntityUpdateInput,
} from "../../../../graphql/api-types.gen";

/* Entity CRU */

export type GetEntityData = {
  entityId: EntityId;
  graphResolveDepths?: Partial<Subgraph["depths"]>;
};

/** @todo-0.3 - we really want some type safety on these if we can find it, but this doesn't work */
// export type GetEntityMessageCallback = Subtype<
//   GraphEmbedderMessageCallbacks<true>["getEntity"],
//   MessageCallback<
//     GetEntityRequest,
//     null,
//     MessageReturn<Subgraph<EntityRootType>>,
//     ReadOrModifyResourceError
//   >
// >;
export type GetEntityMessageCallback = MessageCallback<
  GetEntityData,
  null,
  MessageReturn<Subgraph<EntityRootType>>,
  ReadOrModifyResourceError
>;

export type UpdateEntityData = {
  entityId: EntityId;
  entityTypeId: VersionedUrl;
  properties: EntityPropertiesObject;
} & Pick<LinkData, "leftToRightOrder" | "rightToLeftOrder">;

export type UpdateEntityMessageCallback = MessageCallback<
  UpdateEntityData,
  null,
  MessageReturn<Entity>,
  ReadOrModifyResourceError
>;

export type UploadFileRequestData = BpUploadFileData &
  (
    | {
        fileEntityCreationInput: Omit<FileEntityCreationInput, "ownedById">;
      }
    | { fileEntityUpdateInput: FileEntityUpdateInput }
  );

export type UploadFileRequestCallback = MessageCallback<
  UploadFileRequestData,
  null,
  MessageReturn<FileEntityType>,
  CreateResourceError
>;

export type QueryEntitiesRequest = {
  operation: QueryOperationInput;
  graphResolveDepths?: Partial<Subgraph["depths"]>;
};

export type QueryEntitiesMessageCallback = MessageCallback<
  QueryEntitiesRequest,
  null,
  MessageReturn<{
    results: Subgraph<EntityRootType>;
    operation: QueryOperationInput;
  }>,
  ReadOrModifyResourceError
>;

export type CreateEntityRequest = {
  entityTypeId: VersionedUrl;
  properties: EntityPropertiesObject;
  linkData?: LinkData;
};

export type CreateEntityMessageCallback = MessageCallback<
  CreateEntityRequest,
  null,
  MessageReturn<Entity>,
  CreateResourceError
>;

export type ArchiveEntityRequest = {
  entityId: EntityId;
};

export type ArchiveEntityMessageCallback = MessageCallback<
  ArchiveEntityRequest,
  null,
  MessageReturn<boolean>,
  ReadOrModifyResourceError
>;

export type KnowledgeCallbacks = {
  getEntity: GetEntityMessageCallback;
  updateEntity: UpdateEntityMessageCallback;
  createEntity: CreateEntityMessageCallback;
  queryEntities: QueryEntitiesMessageCallback;
  archiveEntity: ArchiveEntityMessageCallback;
};
