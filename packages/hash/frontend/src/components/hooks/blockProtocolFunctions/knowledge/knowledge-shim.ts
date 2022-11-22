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
import {
  EntityWithMetadata,
  EntityId,
  PropertyObject,
  Subgraph,
  VersionedUri,
} from "@hashintel/hash-subgraph";

export type KnowledgeCallbacks = {
  getEntity: GetEntityMessageCallback;
  createEntity: CreateEntityMessageCallback;
  aggregateEntities: AggregateEntitiesMessageCallback;
  updateEntity: UpdateEntityMessageCallback;
};

/* Entity CRU */
export type GetEntityMessageCallback = MessageCallback<
  EntityId,
  null,
  Subgraph,
  ReadOrModifyResourceError
>;

export type AggregateEntitiesMessageCallback = MessageCallback<
  {},
  null,
  Subgraph,
  ReadOrModifyResourceError
>;

export type CreateEntityRequest = {
  entityTypeId: VersionedUri;
  properties: PropertyObject;
};

export type CreateEntityMessageCallback = MessageCallback<
  CreateEntityRequest,
  null,
  EntityWithMetadata,
  CreateResourceError
>;

export type UpdateEntityRequest = {
  entityId: EntityId;
  updatedProperties: PropertyObject;
};

export type UpdateEntityMessageCallback = MessageCallback<
  UpdateEntityRequest,
  null,
  EntityWithMetadata,
  ReadOrModifyResourceError
>;
