import { Entity, EntityId, Subgraph } from "@hashintel/subgraph/src/types";
import { getEntitiesByEntityId } from "@hashintel/subgraph/src/element/entity";

export const getEarliestEditionOfEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
): Entity => {
  const entities = getEntitiesByEntityId(subgraph, entityId);
  return entities
    .sort((entityA, entityB) =>
      entityA.metadata.identifier.version.localeCompare(
        entityB.metadata.identifier.version,
      ),
    )
    .pop()!;
};
