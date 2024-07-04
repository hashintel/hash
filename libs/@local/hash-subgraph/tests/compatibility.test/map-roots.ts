import type { Subgraph as SubgraphGraphApi } from "@local/hash-graph-client";
import { isBaseUrl } from "@local/hash-graph-types/ontology";

import type {
  EntityRevisionId,
  OntologyTypeRevisionId,
  Subgraph,
} from "../../src/main.js";
import { isEntityId } from "../../src/types/shared/branded.js";

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
