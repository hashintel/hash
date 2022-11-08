import {
  Entity,
  EntityId,
  EntityVersion,
  Subgraph,
} from "@hashintel/subgraph/src/types";
import {
  getRoots,
  isEntityRootedSubgraph,
} from "@hashintel/subgraph/src/roots";
import { getEntity } from "@hashintel/subgraph/src/";

export const getAllEditionsOfAnEntity = (
  subgraph: Subgraph,
  entityId: EntityId,
): Record<EntityVersion, Entity> => {
  getEntity(subgraph);
  if (isEntityRootedSubgraph(subgraph)) {
    const roots = getRoots(subgraph);

    // See TypeScript knows that the roots are `Entity` now
    return roots[0]!.metadata.identifier.version;
  } else {
    throw new Error();
  }
};
