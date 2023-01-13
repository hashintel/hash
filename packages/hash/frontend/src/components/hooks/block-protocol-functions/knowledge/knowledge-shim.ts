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
import { EntityId } from "@hashintel/hash-shared/types";
import {
  Entity,
  LinkData,
  PropertyObject,
  Subgraph,
  SubgraphRootTypes,
  VersionedUri,
} from "@hashintel/hash-subgraph";

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
  Subgraph<SubgraphRootTypes["entity"]>,
  ReadOrModifyResourceError
>;

export type AggregateEntitiesRequest = {
  rootEntityTypeIds?: VersionedUri[];
  graphResolveDepths?: Partial<Subgraph["depths"]>;
};

export type AggregateEntitiesMessageCallback = MessageCallback<
  AggregateEntitiesRequest,
  null,
  Subgraph<SubgraphRootTypes["entity"]>,
  ReadOrModifyResourceError
>;

export type CreateEntityRequest = {
  entityTypeId: VersionedUri;
  properties: PropertyObject;
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
