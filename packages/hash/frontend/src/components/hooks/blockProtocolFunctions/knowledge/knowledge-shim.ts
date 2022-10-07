/**
 * This file contains "knowledge" function signatures of the new type system used to augment the
 * existing set of Block Protocol.
 *
 * These signatures will eventually make their way into the @blockprotocol/graph
 * package and be removed from here.
 */

import { MessageCallback } from "@blockprotocol/core";
import { ReadOrModifyResourceError } from "@blockprotocol/graph";
import {
  UnknownPersistedEntity,
  EntityTypeRootedSubgraph,
} from "../../../../graphql/apiTypes.gen";

export type KnowledgeCallbacks = {
  getEntity: GetEntityMessageCallback;
};

/* Entity CRU */

/**
 * @todo: remove this when we support the corresponding fields in the GQL API, or have implemented alternative fields.
 * @see https://app.asana.com/0/0/1203106234191589/f
 */
type UnsupportedPersistedEntityFields = "linkedEntities";

type DeprecatedPersistedEntityFields = "accountId";

type Entity = Omit<
  UnknownPersistedEntity,
  | UnsupportedPersistedEntityFields
  | DeprecatedPersistedEntityFields
  | "entityType"
> & {
  entityTypeRootedSubgraph: EntityTypeRootedSubgraph;
};

export type GetEntityRequest = Pick<Entity, "entityId">;

export type GetEntityMessageCallback = MessageCallback<
  GetEntityRequest,
  null,
  Entity,
  ReadOrModifyResourceError
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
