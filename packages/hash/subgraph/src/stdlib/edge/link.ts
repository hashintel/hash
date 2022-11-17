import { Subgraph } from "../../types/subgraph";
import { EntityId, EntityIdAndTimestamp } from "../../types/identifier";
import { Entity } from "../../types/element";
import { getEntityAtTimestamp } from "../element/entity";

export const getOutgoingLinksForEntityAtMoment = (
  subgraph: Subgraph,
  entityId: EntityId,
  timestamp: Date | string,
): { linkEntity: Entity; endpointEntity: Entity }[] => {
  const timestampString =
    typeof timestamp === "string" ? timestamp : timestamp.toISOString();

  const entityEdges = subgraph.edges[entityId];

  if (!entityEdges) {
    return [];
  }

  const linkEntities = Object.entries(entityEdges)
    // Only look at outgoing edges that were created before or at the timestamp
    .filter(([edgeTimestamp]) => edgeTimestamp <= timestampString)
    // Extract the link `EntityEditionId`s from the endpoints of the link edges
    .flatMap(([_, outwardEdges]) => {
      return outwardEdges
        .filter((edge) => {
          // The reverse of HAS_LEFT_ENDPOINT is equivalent to saying the entity "has a link" entity
          return edge.kind === "HAS_LEFT_ENDPOINT" && edge.reversed;
        })
        .map((edge) => edge.endpoint as EntityIdAndTimestamp);
    })
    .map(({ baseId: linkEntityId, timestamp: linkTimestamp }) => {
      const linkEntity = getEntityAtTimestamp(
        subgraph,
        linkEntityId,
        linkTimestamp,
      );

      if (!linkEntity) {
        throw new Error(
          `failed to find link entity with id ${linkEntityId} at time ${linkTimestamp}`,
        );
      }

      return linkEntity;
    });

  return linkEntities.map((linkEntity) => {
    for (const [edgeTimestamp, outwardEdges] of Object.entries(entityEdges)) {
      // Only look at outgoing edges that were created before or at creation of this edition of the link entity
      if (edgeTimestamp < linkEntity.metadata.editionId.version) {
        const endpointEdge = outwardEdges
          // There should only be one
          .find((edge) => {
            return edge.kind === "HAS_ENDPOINT";
          });

        if (!endpointEdge) {
          throw new Error(
            `expected to find HAS_ENDPOINT edge for link entity but did not`,
          );
        }

        const { baseId: endpointEntityId, timestamp: linkTimestamp } =
          endpointEdge.endpoint as EntityIdAndTimestamp;

        const endpointEntity = getEntityAtTimestamp(
          subgraph,
          endpointEntityId,
          linkTimestamp,
        );

        if (!endpointEntity) {
          throw new Error(
            `failed to find link entity with id ${endpointEntityId} at time ${linkTimestamp}`,
          );
        }

        return {
          linkEntity,
          endpointEntity,
        };
      }
    }

    throw new Error(
      `failed to find endpoint entity for link entity: ${linkEntity.metadata.editionId}`,
    );
  });
};
