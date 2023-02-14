import { Subgraph as SubgraphGraphApi } from "@local/hash-graph-client";
import {
  EntityRevisionId,
  OntologyTypeRevisionId,
  Subgraph,
} from "@local/hash-subgraph";

import { isBaseUri, isEntityId } from "../../src/types/shared/branded";

export const mapRoots = (
  roots: SubgraphGraphApi["roots"],
): Subgraph["roots"] => {
  return roots.map((root) => {
    if (isEntityId(root.baseId)) {
      return {
        baseId: root.baseId,
        revisionId: root.version as EntityRevisionId,
      };
    } else if (isBaseUri(root.baseId)) {
      return {
        baseId: root.baseId,
        revisionId: root.version as OntologyTypeRevisionId,
      };
    } else {
      throw new Error(
        `Unrecognized root vertex ID format: ${JSON.stringify(root)}`,
      );
    }
  });
};
