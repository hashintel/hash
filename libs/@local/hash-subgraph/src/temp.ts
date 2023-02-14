/**
 *  A collection of a temporary mapping methods used in the middle of migrating APIs for consistency.
 *
 *  @todo-0.3 - Remove this once the HASH Graph API has been migrated to be consistent
 */

import { Subgraph as SubgraphGraphApi } from "@local/hash-graph-client";

import { mapEdges } from "./temp/map-edges";
import { mapRoots } from "./temp/map-roots";
import { mapVertices } from "./temp/map-vertices";
import { Subgraph } from "./types/subgraph";

export const mapSubgraph = (subgraphGraphApi: SubgraphGraphApi) => {
  const mappedSubgraph: Subgraph = {
    roots: mapRoots(subgraphGraphApi.roots),
    vertices: mapVertices(subgraphGraphApi.vertices),
    edges: mapEdges(subgraphGraphApi.edges),
    depths: subgraphGraphApi.depths,
    timeProjection: subgraphGraphApi.timeProjection,
    resolvedTimeProjection: subgraphGraphApi.resolvedTimeProjection,
  };

  return mappedSubgraph;
};
