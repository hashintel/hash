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
  UnknownKnowledgeEntity,
  EntityTypeRootedSubgraph,
} from "../../../../graphql/apiTypes.gen";

export type KnolwedgeCallbacks = {
  getEntity: GetEntityMessageCallback;
};

/* Entity CRU */

/**
 * @todo: remove this when we support the corresponding fields in the GQL API, or have implemented alternative fields.
 * @see https://app.asana.com/0/0/1203106234191589/f
 */
type UnsupportedKnowledgeEntityFields = "linkedEntities";

type Entity = Omit<
  UnknownKnowledgeEntity,
  UnsupportedKnowledgeEntityFields | "entityType"
> & {
  entityTypeRootedSubgraph: EntityTypeRootedSubgraph;
};

export type EntityResponse = Entity;

export type GetEntityRequest = Pick<EntityResponse, "entityId">;
export type GetEntityMessageCallback = MessageCallback<
  GetEntityRequest,
  null,
  EntityResponse,
  ReadOrModifyResourceError
>;
