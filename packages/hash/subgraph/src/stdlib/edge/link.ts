import { mustBeDefined } from "../../shared/invariant";
import {
  isHasLeftEntityEdge,
  isHasRightEntityEdge,
  isIncomingLinkEdge,
  isOutwardLinkEdge,
} from "../../types/edge/outward-edge-alias";
import { Entity } from "../../types/element";
import { entityEditionIdToString, EntityId } from "../../types/identifier";
import { Subgraph } from "../../types/subgraph";
import { getEntityAtTimestamp } from "../element/entity";

const getUniqueEntitiesFilter = () => {
  const set = new Set();
  return (entity: Entity) => {
    const editionIdString = entityEditionIdToString(entity.metadata.editionId);
    if (set.has(editionIdString)) {
      return false;
    } else {
      set.add(editionIdString);
      return true;
    }
  };
};

/**
 * For a given moment in time, get all outgoing link entities from a given entity.
 *
 * @param subgraph
 * @param {EntityId} entityId - The ID of the source entity to search for outgoing links from
 * @param {Date | string} timestamp - A `Date` or an ISO-formatted datetime string of the moment to search for
 * @param includeArchived - Whether or not to return currently-archived links, defaults to false
 */
export const getOutgoingLinksForEntityAtMoment = (
  subgraph: Subgraph,
  entityId: EntityId,
  timestamp: Date | string,
  includeArchived: boolean = false,
): Entity[] => {
  const timestampString =
    typeof timestamp === "string" ? timestamp : timestamp.toISOString();

  const entityEdges = subgraph.edges[entityId];

  if (!entityEdges) {
    return [];
  }

  const uniqueEntitiesFilter = getUniqueEntitiesFilter();

  return (
    Object.entries(entityEdges)
      // Only look at outgoing edges that were created before or at the timestamp
      .filter(([edgeTimestamp, _]) => edgeTimestamp <= timestampString)
      // Extract the link `EntityEditionId`s from the endpoints of the link edges
      .flatMap(([_, outwardEdges]) => {
        return outwardEdges.filter(isOutwardLinkEdge).map((edge) => {
          return edge.rightEndpoint;
        });
      })
      .map(({ baseId: linkEntityId, timestamp: _firstEditionTimestamp }) => {
        const linkEntity = mustBeDefined(
          getEntityAtTimestamp(
            subgraph,
            linkEntityId,
            // Find the edition of the link at the given moment (not at `_firstEditionTimestamp`, the start of its history)
            timestampString,
          ),
        );

        if (!includeArchived) {
          if (linkEntity.metadata.archived) {
            return undefined;
          }
        }

        return linkEntity;
      })
      .filter((x): x is Entity => x !== undefined)
      .filter(uniqueEntitiesFilter)
  );
};

/**
 * For a given moment in time, get all incoming link entities from a given entity.
 *
 * @param subgraph
 * @param {EntityId} entityId - The ID of the source entity to search for outgoing links from
 * @param {Date | string} timestamp - A `Date` or an ISO-formatted datetime string of the moment to search for
 * @param includeArchived - Whether or not to return currently-archived links, defaults to false
 */
export const getIncomingLinksForEntityAtMoment = (
  subgraph: Subgraph,
  entityId: EntityId,
  timestamp: Date | string,
  includeArchived: boolean = false,
): Entity[] => {
  const timestampString =
    typeof timestamp === "string" ? timestamp : timestamp.toISOString();

  const entityEdges = subgraph.edges[entityId];

  if (!entityEdges) {
    return [];
  }

  const uniqueEntitiesFilter = getUniqueEntitiesFilter();

  return (
    Object.entries(entityEdges)
      // Only look at edges that were created before or at the timestamp
      .filter(([edgeTimestamp, _]) => edgeTimestamp <= timestampString)
      // Extract the link `EntityEditionId`s from the endpoints of the link edges
      .flatMap(([_, outwardEdges]) => {
        return outwardEdges.filter(isIncomingLinkEdge).map((edge) => {
          return edge.rightEndpoint;
        });
      })
      .map(({ baseId: linkEntityId, timestamp: _firstEditionTimestamp }) => {
        const linkEntity = mustBeDefined(
          getEntityAtTimestamp(
            subgraph,
            linkEntityId,
            // Find the edition of the link at the given moment (not at `_firstEditionTimestamp`, the start of its history)
            timestampString,
          ),
        );

        if (!includeArchived) {
          if (linkEntity.metadata.archived) {
            return undefined;
          }
        }

        return linkEntity;
      })
      .filter((x): x is Entity => x !== undefined)
      .filter(uniqueEntitiesFilter)
  );
};

/**
 * For a given moment in time, get the "left entity" (by default this is the "source") of a given link entity.
 *
 * @param subgraph
 * @param {EntityId} entityId - The ID of the link entity
 * @param {Date | string} timestamp - A `Date` or an ISO-formatted datetime string of the moment to search for
 */
export const getLeftEntityForLinkEntityAtMoment = (
  subgraph: Subgraph,
  entityId: EntityId,
  timestamp: Date | string,
): Entity => {
  const linkEntityEdges = mustBeDefined(
    subgraph.edges[entityId],
    "link entities must have left endpoints and therefore must have edges",
  );

  const endpointEntityId = mustBeDefined(
    Object.values(linkEntityEdges).flat().find(isHasLeftEntityEdge)
      ?.rightEndpoint.baseId,
    "link entities must have left endpoints",
  );

  return mustBeDefined(
    getEntityAtTimestamp(subgraph, endpointEntityId, timestamp),
    "all edge endpoints should have a corresponding vertex",
  );
};

/**
 * For a given moment in time, get the "right entity" (by default this is the "destination") of a given link entity.
 *
 * @param subgraph
 * @param {EntityId} entityId - The ID of the link entity
 * @param {Date | string} timestamp - A `Date` or an ISO-formatted datetime string of the moment to search for
 */
export const getRightEntityForLinkEntityAtMoment = (
  subgraph: Subgraph,
  entityId: EntityId,
  timestamp: Date | string,
): Entity => {
  const linkEntityEdges = mustBeDefined(
    subgraph.edges[entityId],
    "link entities must have right endpoints and therefore must have edges",
  );

  const endpointEntityId = mustBeDefined(
    Object.values(linkEntityEdges).flat().find(isHasRightEntityEdge)
      ?.rightEndpoint.baseId,
    "link entities must have right endpoints",
  );

  return mustBeDefined(
    getEntityAtTimestamp(subgraph, endpointEntityId, timestamp),
    "all edge endpoints should have a corresponding vertex",
  );
};

/**
 * For a given moment in time, get all outgoing link entities, and their right entities, from a given entity.
 *
 * @param subgraph
 * @param {EntityId} entityId - The ID of the source entity to search for outgoing links from
 * @param {Date | string} timestamp - A `Date` or an ISO-formatted datetime string of the moment to search for
 * @param includeArchived - Whether or not to return currently-archived links, defaults to false
 */
export const getOutgoingLinkAndTargetEntitiesAtMoment = (
  subgraph: Subgraph,
  entityId: EntityId,
  timestamp: Date | string,
  includeArchived: boolean = false,
): { linkEntity: Entity; rightEntity: Entity }[] => {
  return getOutgoingLinksForEntityAtMoment(
    subgraph,
    entityId,
    timestamp,
    includeArchived,
  ).map((linkEntity) => {
    return {
      linkEntity,
      rightEntity: getRightEntityForLinkEntityAtMoment(
        subgraph,
        linkEntity.metadata.editionId.baseId,
        timestamp,
      ),
    };
  });
};
