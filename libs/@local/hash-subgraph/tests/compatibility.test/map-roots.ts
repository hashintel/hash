import { Subgraph as SubgraphGraphApi } from "@local/hash-graph-client";

import {
  isEntityVertexId,
  isOntologyTypeRecordId,
  Subgraph,
} from "../../src/main";

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
