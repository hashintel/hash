import {
  Entity,
  EntityId,
  EntityVersion,
  Subgraph,
} from "@hashintel/subgraph/src/types";
import { getEntitiesByEntityId } from "@hashintel/subgraph/src/element/entity";

export const getAllEditionsOfAnEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
): Record<EntityVersion, Entity> => {
  const entities = getEntitiesByEntityId(subgraph, entityId);

  return Object.fromEntries(
    entities.map((entity) => [entity.metadata.identifier.version, entity]),
  );
};
