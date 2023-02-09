/**
 * This file contains "knowledge" function signatures of the new type system used to augment the
 * existing set of Block Protocol.
 *
 * These signatures will eventually make their way into the @blockprotocol/graph
 * package and be removed from here.
 */

import { MessageCallback } from "@blockprotocol/core";
import {
  CreateResourceError,
  ReadOrModifyResourceError,
} from "@blockprotocol/graph";
import { VersionedUri } from "@blockprotocol/type-system";
import {
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityRootType,
  LinkData,
  Subgraph,
} from "@local/hash-types";

export type KnowledgeCallbacks = {
  getEntity: GetEntityMessageCallback;
  createEntity: CreateEntityMessageCallback;
  aggregateEntities: AggregateEntitiesMessageCallback;
  archiveEntity: ArchiveEntityMessageCallback;
};

export type GetEntityRequest = {
  entityId: EntityId;
  graphResolveDepths?: Partial<Subgraph["depths"]>;
};

/* Entity CRU */
export type GetEntityMessageCallback = MessageCallback<
  GetEntityRequest,
  null,
  Subgraph<EntityRootType>,
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
  UploadFileResponse,
  CreateResourceError
>;

export type AggregateEntitiesRequest = {
  rootEntityTypeIds?: VersionedUri[];
  graphResolveDepths?: Partial<Subgraph["depths"]>;
};

export type AggregateEntitiesMessageCallback = MessageCallback<
  AggregateEntitiesRequest,
  null,
  Subgraph<EntityRootType>,
  ReadOrModifyResourceError
>;

export type CreateEntityRequest = {
  entityTypeId: VersionedUri;
  properties: EntityPropertiesObject;
  linkData?: LinkData;
};

export type CreateEntityMessageCallback = MessageCallback<
  CreateEntityRequest,
  null,
  Entity,
  CreateResourceError
>;

export type ArchiveEntityRequest = {
  entityId: EntityId;
};

export type ArchiveEntityMessageCallback = MessageCallback<
  ArchiveEntityRequest,
  null,
  boolean,
  ReadOrModifyResourceError
>;
