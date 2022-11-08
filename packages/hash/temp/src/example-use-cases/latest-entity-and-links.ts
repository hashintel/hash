import { Entity, EntityId, Subgraph } from "@hashintel/subgraph/src/types";
import { getEntityAtTimestamp } from "@hashintel/subgraph/src/element/entity";
import { getOutgoingLinksForEntityAtTime } from "@hashintel/subgraph/src/edge/link";

type EntityTree = {
  entity: Entity;
  siblings: EntityTree[];
};
export const getEntityTreeAtTimeToDepth = (
  subgraph: Subgraph,
  entityId: EntityId,
  timestamp: string,
  depth: number,
): EntityTree => {
  const entity = getEntityAtTimestamp(subgraph, entityId, timestamp);

  if (!entity) {
    throw new Error(
      `failed to find entity ${entityId} at timestamp ${timestamp}`,
    );
  }

  const links = getOutgoingLinksForEntityAtTime(
    subgraph,
    entity.metadata.identifier.entityIdentifier,
    timestamp,
  );

  return {
    entity,
    siblings: links.map(({ linkEntity, endpointEntity }) => {
      return {
        entity: linkEntity,
        siblings:
          depth > 1
            ? [
                getEntityTreeAtTimeToDepth(
                  subgraph,
                  endpointEntity.metadata.identifier.entityIdentifier,
                  timestamp,
                  depth - 1,
                ),
              ]
            : [],
      };
    }),
  };
};
