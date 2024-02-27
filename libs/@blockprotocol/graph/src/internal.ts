export {
  addDataTypeVerticesToSubgraphByMutation,
  addEntityTypeVerticesToSubgraphByMutation,
  addEntityVerticesToSubgraphByMutation,
  addOutwardEdgeToSubgraphByMutation,
  addPropertyTypeVerticesToSubgraphByMutation,
  inferDataTypeEdgesInSubgraphByMutation,
  inferEntityEdgesInSubgraphByMutation,
  inferEntityTypeEdgesInSubgraphByMutation,
  inferPropertyTypeEdgesInSubgraphByMutation,
} from "./internal/mutate-subgraph.js";
export { isTemporalSubgraph } from "./shared/types/subgraph.js";
