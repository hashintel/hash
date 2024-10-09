import { typedKeys } from "@local/advanced-types/typed-entries";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";

export const generateEntityRootedSubgraph = (
  entityId: EntityId,
  subgraph: Subgraph<EntityRootType>,
) => {
  let entityRoot = subgraph.roots.find(({ baseId }) => baseId === entityId);

  if (!entityRoot) {
    const entityRevisions = subgraph.vertices[entityId];
    if (!entityRevisions) {
      throw new Error(`No entity with id ${entityId} in subgraph`);
    }

    const firstRevisionTimestamp = typedKeys(entityRevisions)[0];

    if (!firstRevisionTimestamp) {
      throw new Error(`No revisions for entity ${entityId} in subgraph`);
    }

    entityRoot = {
      baseId: entityId,
      revisionId: firstRevisionTimestamp,
    };
  }

  return {
    ...subgraph,
    roots: [entityRoot],
  };
};
