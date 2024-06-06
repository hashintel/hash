import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { TimeInterval } from "@local/hash-graph-types/temporal-versioning";

import type { LinkEntityAndRightEntity, Subgraph } from "../../../main";
import {
  isHasLeftEntityEdge,
  isHasRightEntityEdge,
  isIncomingLinkEdge,
  isOutgoingLinkEdge,
} from "../../../main";
import { getEntityRevisionsByEntityId } from "../../../stdlib";
import {
  intervalForTimestamp,
  intervalIntersectionWithInterval,
  intervalIsStrictlyAfterInterval,
} from "../../interval";

// Copied from `@blockprotocol/graph`
const getUniqueEntitiesFilter = () => {
  const set = new Set();
  return (entity: Entity) => {
    const recordIdString = JSON.stringify(entity.metadata.recordId);
    if (set.has(recordIdString)) {
      return false;
    } else {
      set.add(recordIdString);
      return true;
    }
  };
};

/**
 * Get all outgoing link entities from a given {@link Entity}.
 *
 * @param {Subgraph} subgraph
 * @param {EntityId} entityId - The ID of the source entity to search for outgoing links from
 * @param {TimeInterval} [interval] - An optional {@link TimeInterval} which, when provided with a
 *  {@link Subgraph} that supports temporal versioning, will constrain the results to links that were present during
 *  that interval. If the parameter is omitted then results will default to only returning results that are active in
 *  the latest instant of time in the {@link Subgraph}
 *
 * @returns {Entity[]} - A flat list of all {@link Entity}s associated with {@link OutgoingLinkEdge}s from the specified
 *   {@link Entity}. This list may contain multiple revisions of the same {@link Entity}s, and it might be beneficial to
 *   pair the output with {@link mapElementsIntoRevisions}.
 */
// Copied from `@blockprotocol/graph`
export const getOutgoingLinksForEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): Entity[] => {
  const searchInterval =
    interval ??
    intervalForTimestamp(
      subgraph.temporalAxes.resolved.variable.interval.end.limit,
    );

  const entityEdges = subgraph.edges[entityId];

  if (!entityEdges) {
    return [];
  }

  const uniqueEntitiesFilter = getUniqueEntitiesFilter();

  const entities = [];

  for (const [edgeTimestamp, outwardEdges] of typedEntries(entityEdges)) {
    // Only look at outgoing edges that were created before or within the search interval
    if (
      !intervalIsStrictlyAfterInterval(
        intervalForTimestamp(edgeTimestamp),
        searchInterval,
      )
    ) {
      for (const outwardEdge of outwardEdges) {
        if (isOutgoingLinkEdge(outwardEdge)) {
          const { entityId: linkEntityId, interval: edgeInterval } =
            outwardEdge.rightEndpoint;

          // Find the revisions of the link at the intersection of the search interval and the edge's valid interval
          const intersection = intervalIntersectionWithInterval(
            searchInterval,
            edgeInterval,
          );

          if (intersection === null) {
            continue;
          }

          for (const entity of getEntityRevisionsByEntityId(
            subgraph,
            linkEntityId,
            intersection,
          )) {
            if (uniqueEntitiesFilter(entity)) {
              entities.push(entity);
            }
          }
        }
      }
    }
  }

  return entities;
};

/**
 * Get all incoming link entities from a given {@link Entity}.
 *
 * @param {Subgraph} subgraph
 * @param {EntityId} entityId - The ID of the source entity to search for incoming links to
 * @param {TimeInterval} [interval] - An optional {@link TimeInterval} which, when provided with a
 *  {@link Subgraph} that supports temporal versioning, will constrain the results to links that were present during
 *  that interval. If the parameter is omitted then results will default to only returning results that are active in
 *  the latest instant of time in the {@link Subgraph}
 *
 * @returns {Entity[]} - A flat list of all {@link Entity}s associated with {@link IncomingLinkEdge}s from the specified
 *   {@link Entity}. This list may contain multiple revisions of the same {@link Entity}s, and it might be beneficial to
 *   pair the output with {@link mapElementsIntoRevisions}.
 */
export const getIncomingLinksForEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): Entity[] => {
  const searchInterval =
    interval ??
    intervalForTimestamp(
      subgraph.temporalAxes.resolved.variable.interval.end.limit,
    );

  const entityEdges = subgraph.edges[entityId];

  if (!entityEdges) {
    return [];
  }

  const uniqueEntitiesFilter = getUniqueEntitiesFilter();

  const entities = [];

  for (const [edgeTimestamp, outwardEdges] of typedEntries(entityEdges)) {
    if (
      !intervalIsStrictlyAfterInterval(
        intervalForTimestamp(edgeTimestamp),
        searchInterval,
      )
    ) {
      for (const outwardEdge of outwardEdges) {
        if (isIncomingLinkEdge(outwardEdge)) {
          const { entityId: linkEntityId, interval: edgeInterval } =
            outwardEdge.rightEndpoint;

          // Find the revisions of the link at the intersection of the search interval and the edge's valid interval
          const intersection = intervalIntersectionWithInterval(
            searchInterval,
            edgeInterval,
          );

          if (intersection === null) {
            continue;
          }

          for (const entity of getEntityRevisionsByEntityId(
            subgraph,
            linkEntityId,
            intersection,
          )) {
            if (uniqueEntitiesFilter(entity)) {
              entities.push(entity);
            }
          }
        }
      }
    }
  }

  return entities;
};

/**
 * Get the "left entity" revisions (by default this is the "source") of a given link entity.
 *
 * @param {Subgraph} subgraph
 * @param {EntityId} entityId - The ID of the link entity
 * @param {TimeInterval} [interval] - An optional {@link TimeInterval} which, when provided with a
 *  {@link Subgraph} that supports temporal versioning, will constrain the results to links that were present during
 *  that interval. If the parameter is omitted then results will default to only returning results that are active in
 *  the latest instant of time in the {@link Subgraph}
 *
 * @returns {Entity[] | undefined} - all revisions of the left {@link Entity} which was associated with a
 *   {@link HasLeftEntityEdge}, if found, from the given {@link EntityId} within the {@link Subgraph}, otherwise
 *   `undefined`.
 */
export const getLeftEntityForLinkEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): Entity[] | undefined => {
  const searchInterval =
    interval ??
    intervalForTimestamp(
      subgraph.temporalAxes.resolved.variable.interval.end.limit,
    );

  const outwardEdge = Object.values(subgraph.edges[entityId] ?? {})
    .flat()
    .find(isHasLeftEntityEdge);

  if (!outwardEdge) {
    return undefined;
  }

  const { entityId: leftEntityId, interval: edgeInterval } =
    outwardEdge.rightEndpoint;
  const intersection = intervalIntersectionWithInterval(
    searchInterval,
    edgeInterval,
  );

  if (intersection === null) {
    throw new Error(
      `No entity revision was found which overlapped the given edge, subgraph was likely malformed.\n` +
        `EntityId: ${leftEntityId}\n` +
        `Search Interval: ${JSON.stringify(searchInterval)}\n` +
        `Edge Valid Interval: ${JSON.stringify(edgeInterval)}`,
    );
  }

  return getEntityRevisionsByEntityId(subgraph, leftEntityId, intersection);
};

/**
 * Get the "right entity" revisions (by default this is the "target") of a given link entity.
 *
 * @param {Subgraph} subgraph
 * @param {EntityId} entityId - The ID of the link entity
 * @param {TimeInterval} [interval] - An optional {@link TimeInterval} which, when provided with a
 *  {@link Subgraph} that supports temporal versioning, will constrain the results to links that were present during
 *  that interval. If the parameter is omitted then results will default to only returning results that are active in
 *  the latest instant of time in the {@link Subgraph}
 *
 * @returns {Entity[] | undefined} - all revisions of the right {@link Entity} which was associated with a
 *   {@link HasRightEntityEdge}, if found, from the given {@link EntityId} within the {@link Subgraph}, otherwise
 *   `undefined`.
 */
export const getRightEntityForLinkEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): Entity[] | undefined => {
  const searchInterval =
    interval ??
    intervalForTimestamp(
      subgraph.temporalAxes.resolved.variable.interval.end.limit,
    );

  const outwardEdge = Object.values(subgraph.edges[entityId] ?? {})
    .flat()
    .find(isHasRightEntityEdge);

  if (!outwardEdge) {
    return undefined;
  }

  const { entityId: rightEntityId, interval: edgeInterval } =
    outwardEdge.rightEndpoint;

  const intersection = intervalIntersectionWithInterval(
    searchInterval,
    edgeInterval,
  );

  if (intersection === null) {
    throw new Error(
      `No entity revision was found which overlapped the given edge, subgraph was likely malformed.\n` +
        `EntityId: ${rightEntityId}\n` +
        `Search Interval: ${JSON.stringify(searchInterval)}\n` +
        `Edge Valid Interval: ${JSON.stringify(edgeInterval)}`,
    );
  }

  return getEntityRevisionsByEntityId(subgraph, rightEntityId, intersection);
};

/**
 * For a given {@link TimeInterval}, get all outgoing link {@link Entity} revisions, and their "target" {@link Entity}
 * revisions (by default this is the "right entity"), from a given {@link Entity}.
 *
 * @param subgraph
 * @param {EntityId} entityId - The ID of the source entity to search for outgoing links from
 * @param {TimeInterval} [interval] - An optional {@link TimeInterval} to constrain the period of time to search across.
 * If the parameter is omitted then results will default to only returning results that are active in the latest instant
 *   of time in the {@link Subgraph}
 */
export const getOutgoingLinkAndTargetEntities = <
  LinkAndRightEntities extends
    LinkEntityAndRightEntity[] = LinkEntityAndRightEntity[],
>(
  subgraph: Subgraph,
  entityId: EntityId,
  interval?: TimeInterval,
): LinkAndRightEntities => {
  const searchInterval =
    interval ??
    intervalForTimestamp(
      subgraph.temporalAxes.resolved.variable.interval.end.limit,
    );

  const outgoingLinkEntities = getOutgoingLinksForEntity(
    subgraph,
    entityId,
    searchInterval,
  );
  const mappedRevisions = outgoingLinkEntities.reduce(
    (revisionMap, entity) => {
      const linkEntityId = entity.metadata.recordId.entityId;

      // eslint-disable-next-line no-param-reassign
      revisionMap[linkEntityId] ??= [];
      revisionMap[linkEntityId]!.push(entity);

      return revisionMap;
    },
    {} as Record<EntityId, Entity[]>,
  );

  return typedEntries(mappedRevisions).map(
    ([linkEntityId, linkEntityRevisions]) => {
      return {
        linkEntity: linkEntityRevisions,
        rightEntity: getRightEntityForLinkEntity(
          subgraph,
          linkEntityId,
          searchInterval,
        ),
      };
    },
  ) as LinkAndRightEntities; // @todo consider fixing generics in functions called within
};
