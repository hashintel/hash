/**
 *  A collection of a temporary mapping methods used in the middle of migrating APIs for consistency.
 *
 *  @todo-0.3 - Remove this once the HASH Graph API has been migrated to be consistent
 */

import { Subgraph as SubgraphGraphApi } from "@local/hash-graph-client";

import { mapEdges } from "./temp/map-edges";
import { Subgraph } from "./types";

export * from "./temp/map-edges";

export const mapSubgraph = (subgraphGraphApi: SubgraphGraphApi) => {
  const mappedSubgraph: Subgraph = {
    roots: subgraphGraphApi.roots as Subgraph["roots"],
    vertices: subgraphGraphApi.vertices as Subgraph["vertices"],
    edges: mapEdges(subgraphGraphApi.edges),
    depths: subgraphGraphApi.depths,
    temporalAxes: subgraphGraphApi.temporalAxes as Subgraph["temporalAxes"],
  };

  return mappedSubgraph;
};
