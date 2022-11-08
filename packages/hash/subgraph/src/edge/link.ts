import {
  Entity,
  EntityAndTimestamp,
  EntityId,
  KnowledgeGraphOutwardEdge,
  Subgraph,
} from "../types";
import { getEntityAtTimestamp } from "../element/entity";

export const getOutgoingLinksForEntityAtTime = (
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
    // Extract the link entity edition IDs from the endpoints of the link edges
    .flatMap(([_, outwardEdges]) => {
      return (outwardEdges as KnowledgeGraphOutwardEdge[])
        .filter((edge) => {
          return edge.kind === "HAS_LINK";
        })
        .map((edge) => edge.endpoint as EntityAndTimestamp);
    })
    .map(({ entityId: linkEntityId, timestamp: linkTimestamp }) => {
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
      if (edgeTimestamp < linkEntity.metadata.identifier.version) {
        const endpointEdge = (outwardEdges as KnowledgeGraphOutwardEdge[])
          // There should only be one
          .find((edge) => {
            return edge.kind === "HAS_ENDPOINT";
          });

        if (!endpointEdge) {
          throw new Error(
            `expected to find HAS_ENDPOINT edge for link entity but did not`,
          );
        }

        const { entityId: endpointEntityId, timestamp: linkTimestamp } =
          endpointEdge.endpoint as EntityAndTimestamp;

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
      `failed to find endpoint entity for link entity: ${linkEntity.metadata.identifier}`,
    );
  });
};
