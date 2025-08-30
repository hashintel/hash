import type {
  Entity,
  EntityId,
  TemporalBound,
  TemporalInterval,
  Timestamp,
} from "@blockprotocol/type-system";

import type { EntityRevisionId } from "../../../types/entity.js";
import type {
  KnowledgeGraphVertex,
  KnowledgeGraphVertices,
  Subgraph,
  SubgraphRootType,
} from "../../../types/subgraph.js";
import { isEntityVertex } from "../../../types/subgraph/vertices.js";
import { mustBeDefined } from "../../../util.js";
import {
  typedEntries,
  typedKeys,
  typedValues,
} from "../../../util/typed-entries.js";
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
export const getEntities = <
  RootType extends SubgraphRootType,
  EntityImpl extends Entity,
>(
  subgraph: Subgraph<RootType, EntityImpl>,
  latest: boolean,
): EntityImpl[] => {
  return typedValues(subgraph.vertices).flatMap((revisions) => {
    if (latest) {
      const revisionVersions = Object.keys(
        revisions,
      ).sort() as EntityRevisionId[];

      const lastIndex = revisionVersions.length - 1;
      const vertex = (
        revisions as Record<EntityRevisionId, KnowledgeGraphVertex<EntityImpl>>
      )[revisionVersions[lastIndex]!]!;
      return isEntityVertex(vertex) ? [vertex.inner] : [];
    } else {
      return typedValues(revisions)
        .filter(isEntityVertex)
        .map((vertex) => vertex.inner);
    }
  });
};

const getRevisionsForEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
): KnowledgeGraphVertices[EntityId] | undefined => {
  const entityRevisions = (subgraph.vertices as KnowledgeGraphVertices)[
    entityId
  ];

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
    const acc: KnowledgeGraphVertices[EntityId] = {};
    for (const draftEntityId of draftEntityIds) {
      const draftEntity: KnowledgeGraphVertices[EntityId] | undefined = (
        subgraph.vertices as KnowledgeGraphVertices
      )[draftEntityId];
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
  targetRevisionInformation?: EntityRevisionId | Date,
): Entity | undefined => {
  const entityRevisions = getRevisionsForEntity(subgraph, entityId);

  if (entityRevisions === undefined) {
    return undefined;
  }

  const revisionVersions = typedKeys(entityRevisions).sort();

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
          vertex.inner.metadata.temporalVersioning[
            subgraph.temporalAxes.resolved.variable.axis
          ],
          targetTime as Timestamp,
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
 * @param {TemporalInterval} [interval]
 */
export const getEntityRevisionsByEntityId = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TemporalInterval<TemporalBound, TemporalBound>,
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
