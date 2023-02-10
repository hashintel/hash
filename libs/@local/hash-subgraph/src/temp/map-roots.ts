import { Subgraph as SubgraphGraphApi } from "@local/hash-graph-client";

import { isEntityVertexId, isOntologyTypeEditionId } from "../types/identifier";
import { Subgraph } from "../types/subgraph";

export const mapRoots = (
  roots: SubgraphGraphApi["roots"],
): Subgraph["roots"] => {
  return roots.map((root) => {
    if (isEntityVertexId(root)) {
      return root;
    } else if (isOntologyTypeEditionId(root)) {
      return root;
    } else {
      throw new Error(
        `Unrecognized root edition ID format: ${JSON.stringify(root)}`,
      );
    }
  });
};
