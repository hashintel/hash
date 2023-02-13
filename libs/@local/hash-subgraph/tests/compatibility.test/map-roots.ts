import { Subgraph as SubgraphGraphApi } from "@local/hash-graph-client";
import {
  EntityId,
  EntityRevisionId,
  isEntityVertexId,
  isOntologyTypeVertexId,
  OntologyTypeRevisionId,
  Subgraph,
} from "@local/hash-subgraph/main";

export const mapRoots = (
  roots: SubgraphGraphApi["roots"],
): Subgraph["roots"] => {
  return roots.map((root) => {
    if (isEntityVertexId(root)) {
      return {
        baseId: root.baseId as EntityId,
        revisionId: root.version as EntityRevisionId,
      };
    } else if (isOntologyTypeVertexId(root)) {
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
