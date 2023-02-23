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
  ReadOrModifyResourceError,
} from "@blockprotocol/graph";
import { VersionedUrl } from "@blockprotocol/type-system";
import {
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityRootType,
  LinkData,
  Subgraph,
} from "@local/hash-subgraph";

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

export declare type FileMediaType = "image" | "video";

export type UploadFileRequest = {
  file?: File | null;
  url?: string | null;
  mediaType: FileMediaType;
};

export type UploadFileResponse = {
  entityId: EntityId;
  url: string;
  mediaType: FileMediaType;
};

export type UploadFileRequestCallback = MessageCallback<
  UploadFileRequest,
  null,
  MessageReturn<UploadFileResponse>,
  CreateResourceError
>;

export type AggregateEntitiesRequest = {
  rootEntityTypeIds?: VersionedUrl[];
  graphResolveDepths?: Partial<Subgraph["depths"]>;
};

export type AggregateEntitiesMessageCallback = MessageCallback<
  AggregateEntitiesRequest,
  null,
  MessageReturn<Subgraph<EntityRootType>>,
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
  aggregateEntities: AggregateEntitiesMessageCallback;
  archiveEntity: ArchiveEntityMessageCallback;
};
