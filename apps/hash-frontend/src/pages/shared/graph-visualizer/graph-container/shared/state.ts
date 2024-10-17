import type { GraphVizFilters } from "./filter-control";

export type GraphState = {
  colorByNodeTypeId: GraphVizFilters["colorByNodeTypeId"];
  hoveredEdgeId: string | null;
  hoveredNodeId: string | null;
  highlightedNeighborIds: Set<string> | null;
  selectedNodeId: string | null;
};
