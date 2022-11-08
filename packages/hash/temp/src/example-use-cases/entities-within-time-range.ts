import { Entity, EntityId, Subgraph } from "@hashintel/subgraph/src/types";
import { getEntitiesByEntityId } from "@hashintel/subgraph/src/element/entity";

export const getEntityEditionsInTimeRange = (
  subgraph: Subgraph,
  entityId: EntityId,
  startDate: Date,
  endDate: Date,
): Entity[] => {
  const entities = getEntitiesByEntityId(subgraph, entityId);
  return entities.filter((entity) => {
    const version = entity.metadata.identifier.version;
    return startDate.toISOString() < version && version < endDate.toISOString();
  });
};
