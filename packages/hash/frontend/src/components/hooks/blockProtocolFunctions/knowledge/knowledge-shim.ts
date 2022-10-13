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
  PersistedLink,
  UnknownPersistedEntity,
  EntityTypeRootedSubgraph,
} from "../../../../graphql/apiTypes.gen";

export type KnowledgeCallbacks = {
  getEntity: GetEntityMessageCallback;
  updateEntity: UpdateEntityMessageCallback;
};

/* Entity CRU */

/**
 * @todo: remove this when we support the corresponding fields in the GQL API, or have implemented alternative fields.
 * @see https://app.asana.com/0/0/1203106234191589/f
 */
type UnsupportedPersistedEntityFields = "linkedEntities";

type DeprecatedPersistedEntityFields = "accountId";

type BaseEntity = Omit<
  UnknownPersistedEntity,
  | UnsupportedPersistedEntityFields
  | DeprecatedPersistedEntityFields
  | "entityType"
>;

type Entity = BaseEntity & {
  links: Link[];
  entityTypeRootedSubgraph: EntityTypeRootedSubgraph;
};

type Link = Omit<PersistedLink, "sourceEntity" | "targetEntity"> & {
  targetEntity: BaseEntity;
};

export type EntityResponse = Entity;

export type GetEntityRequest = Pick<EntityResponse, "entityId">;
export type GetEntityMessageCallback = MessageCallback<
  GetEntityRequest,
  null,
  EntityResponse,
  ReadOrModifyResourceError
>;

export type CreateEntityRequest = {
  entityTypeId: string;
  properties: Entity["properties"];
};

export type CreateEntityMessageCallback = MessageCallback<
  CreateEntityRequest,
  null,
  Entity,
  CreateResourceError
>;

export type UpdateEntityRequest = {
  entityId: string;
  updatedProperties: Entity["properties"];
};

export type UpdateEntityMessageCallback = MessageCallback<
  UpdateEntityRequest,
  null,
  Entity,
  ReadOrModifyResourceError
>;
