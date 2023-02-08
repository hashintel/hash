import {
  getEntities as getEntitiesBp,
  getEntityRevision as getEntityRevisionBp,
  getEntityRevisionsByEntityId as getEntityRevisionsByEntityIdBp,
} from "@blockprotocol/graph/stdlib";

import { EntityId } from "../../../branded";
import { Entity, EntityRevisionId } from "../../../types";
import { Subgraph } from "../../../types/subgraph";
import { TimeInterval, Timestamp } from "../../../types/temporal-versioning";

/**
 * Returns all {@link Entity}s within the vertices of the given {@link Subgraph}, optionally filtering to only get their
 * latest revisions.
 *
 * @param subgraph
 * @param latest - whether or not to only return the latest revisions of each entity
 */
export const getEntities = (
  subgraph: Subgraph,
  latest: boolean = false,
): Entity[] => getEntitiesBp(subgraph, latest) as Entity[];

/**
 * Gets an {@link Entity} by its {@link EntityId} from within the vertices of the subgraph. If
 * `targetRevisionInformation` is not passed, then the latest version of the {@link Entity} will be returned.
 *
 * Returns `undefined` if the entity couldn't be found.
 *
 * @param subgraph
 * @param {EntityId} entityId - The {@link EntityId} of the entity to get.
 * @param {EntityRevisionId|Timestamp|Date} [targetRevisionInformation] - Optional information needed to uniquely
 *     identify a revision of an entity either by an explicit {@link EntityRevisionId}, `Date`, or by a given
 *     {@link Timestamp} where the entity whose lifespan overlaps the given timestamp will be returned.
 * @throws if the vertex isn't an {@link EntityVertex}
 */
export const getEntityRevision = (
  subgraph: Subgraph,
  entityId: EntityId,
  targetRevisionInformation?: EntityRevisionId | Timestamp | Date,
): Entity | undefined =>
  getEntityRevisionBp(subgraph, entityId, targetRevisionInformation) as
    | Entity
    | undefined;

/**
 * Returns all {@link Entity} revisions within the vertices of the subgraph that match a given {@link EntityId}.
 *
 * When querying a subgraph with support for temporal versioning, it optionally constrains the search to a given
 * {@link TimeInterval}.
 *
 * @param {Subgraph }subgraph
 * @param {EntityId} entityId
 * @param {TimeInterval} [interval]
 */
export const getEntityRevisionsByEntityId = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): Entity[] =>
  getEntityRevisionsByEntityIdBp(subgraph, entityId, interval) as Entity[];
