import { Subgraph } from "../../types/subgraph";
import { EntityId } from "../../types/identifier";
import { Entity } from "../../types/element";
import { getEntityAtTimestamp } from "../element/entity";
import {
  isHasLinkEdge,
  isHasRightEndpointEdge,
} from "../../types/edge/outward-edge-alias";
import { mustBeDefined } from "../../shared/invariant";

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

  return (
    Object.entries(entityEdges)
      // Only look at outgoing edges that were created before or at the timestamp
      .filter(([edgeTimestamp]) => edgeTimestamp <= timestampString)
      // Extract the link `EntityEditionId`s from the endpoints of the link edges
      .flatMap(([_, outwardEdges]) => {
        return outwardEdges.filter(isHasLinkEdge).map((edge) => {
          return edge.endpoint;
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
  );
};

export const getRightEndpointForLinkEntityAtMoment = (
  subgraph: Subgraph,
  entityId: EntityId,
  timestamp: Date | string,
): Entity => {
  const linkEntityEdges = mustBeDefined(
    subgraph.edges[entityId],
    "link entities must have right endpoints and therefore must have edges",
  );

  const endpointEntityId = mustBeDefined(
    Object.values(linkEntityEdges).flat().find(isHasRightEndpointEdge)?.endpoint
      .baseId,
    "link entities must have right endpoints",
  );

  return mustBeDefined(
    getEntityAtTimestamp(subgraph, endpointEntityId, timestamp),
    "all edge endpoints should have a corresponding vertex",
  );
};

export const getOutgoingLinkAndTargetEntitiesAtMoment = (
  subgraph: Subgraph,
  entityId: EntityId,
  timestamp: Date | string,
  includeArchived: boolean = false,
): { linkEntity: Entity; endpointEntity: Entity }[] => {
  return getOutgoingLinksForEntityAtMoment(
    subgraph,
    entityId,
    timestamp,
    includeArchived,
  ).map((linkEntity) => {
    return {
      linkEntity,
      endpointEntity: getRightEndpointForLinkEntityAtMoment(
        subgraph,
        linkEntity.metadata.editionId.baseId,
        timestamp,
      ),
    };
  });
};
