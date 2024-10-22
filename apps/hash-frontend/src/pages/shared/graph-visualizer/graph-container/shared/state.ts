import type { GraphVizFilters } from "./filter-control";

export type GraphState = {
  colorByNodeTypeId: GraphVizFilters["colorByNodeTypeId"];
  /**
   * A path to highlight in the graph, represented by a list of edge ids.
   * Takes precedence over any other highlighting.
   */
  highlightedEdgePath: string[] | null;
  hoveredEdgeId: string | null;
  /**
   * Which node is hovered
   */
  hoveredNodeId: string | null;
  /**
   * When a node is hovered or selected, the connected nodes (which and to what depth determined by config)
   */
  neighborsByDepth: Set<string>[] | null;
  /**
   * Which node has been selected by clicking on it
   */
  selectedNodeId: string | null;
};
