import {
  getRoots,
  isEntityRootedSubgraph,
} from "@hashintel/subgraph/src/roots";
import { Subgraph, EntityVersion } from "@hashintel/subgraph/src/types";

export const entityRootedSubgraph = (subgraph: Subgraph): EntityVersion => {
  if (isEntityRootedSubgraph(subgraph)) {
    const roots = getRoots(subgraph);

    // See TypeScript knows that the roots are `Entity` now
    return roots[0]!.metadata.identifier.version;
  } else {
    throw new Error();
  }
};
