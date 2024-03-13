import { Entity, EntityId, EntityRevisionId } from "../../../types/entity.js";
import { Subgraph } from "../../../types/subgraph.js";
import { isEntityVertex, Vertices } from "../../../types/subgraph/vertices.js";
import { TimeInterval } from "../../../types/temporal-versioning.js";
import { mustBeDefined, typedEntries, typedValues } from "../../../util.js";
import {
  intervalContainsTimestamp,
  intervalForTimestamp,
  intervalIsStrictlyAfterInterval,
  intervalOverlapsInterval,
} from "../../interval.js";

/**
 * Returns all {@link Entity}s within the vertices of the given {@link Subgraph}, optionally filtering to only get their
 * latest revisions.
 *
 * @param subgraph
 * @param latest - whether or not to only return the latest revisions of each entity
 */
export const getEntities = <Temporal extends boolean>(
  subgraph: Subgraph<Temporal>,
  latest: Temporal extends true ? boolean : true,
): Entity<Temporal>[] => {
  return typedValues(subgraph.vertices).flatMap((revisions) => {
    if (latest) {
      const revisionVersions = Object.keys(revisions).sort();

      const lastIndex = revisionVersions.length - 1;
      const vertex = revisions[revisionVersions[lastIndex]!]!;
      return isEntityVertex(vertex) ? [vertex.inner] : [];
    } else {
      return typedValues(revisions)
        .filter(isEntityVertex)
        .map((vertex) => vertex.inner);
    }
  });
};

const getRevisionsForEntity = <Temporal extends boolean>(
  subgraph: Subgraph<Temporal>,
  entityId: EntityId,
): Vertices<Temporal>[string] | undefined => {
  const entityRevisions = subgraph.vertices[entityId];

  if (entityRevisions) {
    return entityRevisions;
  }

  /**
   * Check for the presence of a draft version of the entity in the subgraph
   */
  const draftEntityId = Object.keys(subgraph.vertices).find((id) =>
    id.startsWith(`${entityId}~`),
  );

  if (draftEntityId) {
    return subgraph.vertices[draftEntityId];
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
export const getEntityRevision = <Temporal extends boolean>(
  subgraph: Subgraph<Temporal>,
  entityId: EntityId,
  targetRevisionInformation?: Temporal extends true
    ? EntityRevisionId | Date
    : undefined,
): Entity<Temporal> | undefined => {
  const entityRevisions = getRevisionsForEntity(subgraph, entityId);

  if (entityRevisions === undefined) {
    return undefined;
  }

  const revisionVersions = Object.keys(entityRevisions).sort();

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
          (vertex.inner as Entity<true>).metadata.temporalVersioning[
            (subgraph as Subgraph<true>).temporalAxes.resolved.variable.axis
          ],
          targetTime,
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
export const getEntityRevisionsByEntityId = <Temporal extends boolean>(
  subgraph: Subgraph<Temporal>,
  entityId: EntityId,
  interval?: Temporal extends true ? TimeInterval : undefined,
): Entity<Temporal>[] => {
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
            (vertex.inner as Entity<true>).metadata.temporalVersioning[
              (subgraph as Subgraph<true>).temporalAxes.resolved.variable.axis
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
