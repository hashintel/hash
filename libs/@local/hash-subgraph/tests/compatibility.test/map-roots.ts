import { Subgraph as SubgraphGraphApi } from "@local/hash-graph-client";
import {
  EntityRevisionId,
  OntologyTypeRevisionId,
  Subgraph,
} from "@local/hash-subgraph";

import { isBaseUrl, isEntityId } from "../../src/types/shared/branded";

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
