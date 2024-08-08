import type { EntityId } from "@local/hash-graph-types/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";

export const generateEntityRootedSubgraph = (
  entityId: EntityId,
  subgraph: Subgraph<EntityRootType>,
) => {
  const entityRoot = subgraph.roots.find(({ baseId }) => baseId === entityId);

  if (!entityRoot) {
    return undefined;
  }

  return {
    ...subgraph,
    roots: [entityRoot],
  };
};
