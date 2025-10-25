/**
 * This file contains "knowledge" function signatures of the new type system used to augment the
 * existing set of Block Protocol.
 *
 * These signatures will eventually make their way into the @blockprotocol/graph
 * package and be removed from here.
 */

import type { MessageCallback, MessageReturn } from "@blockprotocol/core";
import type {
  CreateResourceError,
  EntityRootType,
  QueryOperationInput,
  ReadOrModifyResourceError,
  Subgraph,
  UploadFileData as BpUploadFileData,
} from "@blockprotocol/graph";
import type {
  EntityId,
  LinkData,
  PropertyObject,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { File as FileEntity } from "@local/hash-isomorphic-utils/system-types/shared";
import type {
  EntityTraversalPath,
  GraphResolveDepths,
  TraversalPath,
} from "@rust/hash-graph-store/types";

import type {
  FileEntityCreationInput,
  FileEntityUpdateInput,
} from "../../../../graphql/api-types.gen";

/* Entity CRU */

export type GetEntityData = {
  entityId: EntityId;
} & (
  | {
      graphResolveDepths: GraphResolveDepths;
      traversalPaths: EntityTraversalPath[];
    }
  | {
      traversalPaths: TraversalPath[];
    }
);

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
  MessageReturn<Subgraph<EntityRootType<HashEntity>>>,
  ReadOrModifyResourceError
>;

export type UpdateEntityData = {
  entityId: EntityId;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  properties: PropertyObject;
};

export type UpdateEntityMessageCallback = MessageCallback<
  UpdateEntityData,
  null,
  MessageReturn<HashEntity>,
  ReadOrModifyResourceError
>;

export type UploadFileRequestData = BpUploadFileData &
  (
    | {
        fileEntityCreationInput: Omit<FileEntityCreationInput, "webId">;
      }
    | { fileEntityUpdateInput: FileEntityUpdateInput }
  );

export type UploadFileRequestCallback = MessageCallback<
  UploadFileRequestData,
  null,
  MessageReturn<HashEntity<FileEntity>>,
  CreateResourceError
>;

export type QueryEntitiesRequest = {
  operation: QueryOperationInput;
} & (
  | {
      graphResolveDepths: GraphResolveDepths;
      traversalPaths: EntityTraversalPath[];
    }
  | {
      traversalPaths: TraversalPath[];
    }
);

export type QueryEntitiesMessageCallback = MessageCallback<
  QueryEntitiesRequest,
  null,
  MessageReturn<{
    results: Subgraph<EntityRootType<HashEntity>>;
    operation: QueryOperationInput;
  }>,
  ReadOrModifyResourceError
>;

export type CreateEntityParams = {
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  properties: PropertyObject;
  linkData?: LinkData;
};

export type CreateEntityMessageCallback = MessageCallback<
  CreateEntityParams,
  null,
  MessageReturn<HashEntity>,
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
