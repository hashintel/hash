import { Entity, EntityId, Subgraph } from "@hashintel/subgraph/src/types";
import { getEntitiesByEntityId } from "@hashintel/subgraph/src/element/entity";

export const getLatestEditionOfEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
): Entity => {
  const entities = getEntitiesByEntityId(subgraph, entityId);
  return entities
    .sort((entityA, entityB) =>
      entityB.metadata.identifier.version.localeCompare(
        entityA.metadata.identifier.version,
      ),
    )
    .pop()!;
};
