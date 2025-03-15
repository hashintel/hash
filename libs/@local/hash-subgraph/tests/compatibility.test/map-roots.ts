import type {
  EntityRevisionId,
  OntologyTypeRevisionId,
} from "@blockprotocol/graph";
import { isBaseUrl, isEntityId } from "@blockprotocol/type-system";
import type { Subgraph as SubgraphGraphApi } from "@local/hash-graph-client";

import type { Subgraph } from "../../src/main.js";

export const mapRoots = (
  roots: SubgraphGraphApi["roots"],
): Subgraph["roots"] => {
  return roots.map((root) => {
    if (isEntityId(root.baseId)) {
      return {
        baseId: root.baseId,
        revisionId: root.revisionId as EntityRevisionId,
      };
    } else if (isBaseUrl(root.baseId)) {
      return {
        baseId: root.baseId,
        revisionId: root.revisionId as OntologyTypeRevisionId,
      };
    } else {
      throw new Error(
        `Unrecognized root vertex ID format: ${JSON.stringify(root)}`,
      );
    }
  });
};
