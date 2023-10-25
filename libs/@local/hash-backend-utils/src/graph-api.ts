import { Subgraph as GraphApiSubgraph } from "@local/hash-graph-client";
import { Subgraph } from "@local/hash-subgraph";

export const mapGraphApiSubgraphToSubgraph = (subgraph: GraphApiSubgraph) =>
  subgraph as Subgraph;
