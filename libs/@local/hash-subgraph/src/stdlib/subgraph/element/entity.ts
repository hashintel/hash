import type { Timestamp } from "@blockprotocol/graph";
import { typedEntries, typedValues } from "@local/advanced-types/typed-entries";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { TimeInterval } from "@local/hash-graph-types/temporal-versioning";

import type { EntityRevisionId, Subgraph, Vertices } from "../../../main";
import { isEntityVertex } from "../../../main";
import { mustBeDefined } from "../../../shared/invariant";
import {
  intervalContainsTimestamp,
  intervalForTimestamp,
  intervalIsStrictlyAfterInterval,
  intervalOverlapsInterval,
} from "../../interval";

/**
 * Returns all {@link Entity}s within the vertices of the given {@link Subgraph}, optionally filtering to only get their
 * latest revisions.
 *
 * @param subgraph
 * @param latest - whether or not to only return the latest revisions of each entity
 */
export const getEntities = (subgraph: Subgraph): Entity[] =>
  typedValues(subgraph.vertices).flatMap((revisions) =>
    typedValues(revisions)
      .filter(isEntityVertex)
      .map((vertex) => vertex.inner),
  );

const getRevisionsForEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
): Vertices[EntityId] | undefined => {
  const entityRevisions = subgraph.vertices[entityId];

  if (entityRevisions) {
    return entityRevisions;
  }

  // check for the presence of draft versions of the entity in the subgraph
  if (entityId.split("~")[2]) {
    /**
     * This entityId contains a draftId, and so we would have already found it via vertices[entityId] if it exists
     */
    return undefined;
  }

  /**
   * We haven't found the exact entityId in the subgraph, but it might be qualified by a draftId
   * – check for vertices which are keyed by a qualified version of the provided entityId
   */
  const draftEntityIds = Object.keys(subgraph.vertices).filter((id) =>
    id.startsWith(`${entityId}~`),
  ) as EntityId[];

  if (draftEntityIds.length > 0) {
    /**
     * Return a combined object of all the draft editions of this entity present in the subgraph.
     * There may be multiple draft editions with the same timestamp, if:
     * 1. There are multiple draft series for the entity (i.e. multiple draftId where `${baseEntityId}~${draftId}`)
     * AND
     * 2. Two or more draft series contain an edition created at the exact same timestamp.
     * If this is the case, some will not be present among the editions, as they will be overwritten by the last one.
     * @todo reconsider the approach to this as part of rethinking the subgraph shape
     */
    const acc: Vertices[EntityId] = {};
    for (const draftEntityId of draftEntityIds) {
      const draftEntity = subgraph.vertices[draftEntityId];
      if (draftEntity) {
        for (const [timestamp, vertex] of typedEntries(draftEntity)) {
          acc[timestamp] = vertex;
        }
      }
    }
    return acc;
  }
};

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
): Entity | undefined => {
  const entityRevisions = getRevisionsForEntity(subgraph, entityId);

  if (entityRevisions === undefined) {
    return undefined;
  }

  const revisionVersions = Object.keys(
    entityRevisions,
  ).sort() as EntityRevisionId[];

  // Short circuit for efficiency, just take the latest
  if (targetRevisionInformation === undefined) {
    const lastIndex = revisionVersions.length - 1;
    const vertex = entityRevisions[revisionVersions[lastIndex]!]!;

    if (!isEntityVertex(vertex)) {
      throw new Error(
        `Found non-entity vertex associated with EntityId: ${entityId}`,
      );
    }

    return vertex.inner;
  } else {
    const targetTime =
      typeof targetRevisionInformation === "string"
        ? targetRevisionInformation
        : targetRevisionInformation.toISOString();

    for (const revisionTimestamp of revisionVersions) {
      const vertex = mustBeDefined(entityRevisions[revisionTimestamp]);

      if (!isEntityVertex(vertex)) {
        throw new Error(
          `Found non-entity vertex associated with EntityId: ${entityId}`,
        );
      }

      if (
        intervalContainsTimestamp(
          /*
         these casts are safe as we check for `targetRevisionInformation === undefined` above and that's only ever
         defined if `Temporal extends true`
         */
          vertex.inner.metadata.temporalVersioning[
            subgraph.temporalAxes.resolved.variable.axis
          ],
          targetTime as EntityRevisionId,
        )
      ) {
        return vertex.inner;
      }
    }

    return undefined;
  }
};

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
): Entity[] => {
  const entityRevisions = getRevisionsForEntity(subgraph, entityId);

  if (entityRevisions === undefined) {
    return [];
  }

  if (interval !== undefined) {
    const filteredEntities = [];

    for (const [startTime, vertex] of typedEntries(entityRevisions)) {
      // Only look at vertices that were created before or within the search interval
      if (
        !intervalIsStrictlyAfterInterval(
          intervalForTimestamp(startTime),
          interval,
        ) &&
        isEntityVertex(vertex)
      ) {
        if (
          /*
           We want to find all entities which were active _at some point_ in the search interval. This is indicated by
           an overlap.
           */
          intervalOverlapsInterval(
            interval,
            /*
             these casts are safe as we check for `interval !== undefined` above and that's only ever defined if
             `Temporal extends true`
             */
            vertex.inner.metadata.temporalVersioning[
              subgraph.temporalAxes.resolved.variable.axis
            ],
          )
        ) {
          filteredEntities.push(vertex.inner);
        }
      }
    }

    return filteredEntities;
  } else {
    const entityVertices = typedValues(entityRevisions);
    return entityVertices.filter(isEntityVertex).map((vertex) => {
      return vertex.inner;
    });
  }
};
