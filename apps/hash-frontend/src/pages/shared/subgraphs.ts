import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";

export const generateEntityRootedSubgraph = (
  entity: Entity,
  subgraph: Subgraph<EntityRootType>,
) => {
  const entityRoot = subgraph.roots.find(
    ({ baseId }) => baseId === entity.metadata.recordId.entityId,
  );

  if (!entityRoot) {
    return undefined;
  }

  return {
    ...subgraph,
    roots: [entityRoot],
  };
};
