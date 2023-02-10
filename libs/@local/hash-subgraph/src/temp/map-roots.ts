import { Subgraph as SubgraphGraphApi } from "@local/hash-graph-client";

import { isEntityVertexId, isOntologyTypeRecordId } from "../types/identifier";
import { Subgraph } from "../types/subgraph";

export const mapRoots = (
  roots: SubgraphGraphApi["roots"],
): Subgraph["roots"] => {
  return roots.map((root) => {
    if (isEntityVertexId(root)) {
      return root;
    } else if (isOntologyTypeRecordId(root)) {
      return root;
    } else {
      throw new Error(
        `Unrecognized root edition ID format: ${JSON.stringify(root)}`,
      );
    }
  });
};
