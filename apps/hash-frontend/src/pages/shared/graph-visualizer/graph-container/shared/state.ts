export type GraphState = {
  hoveredNodeId: string | null;
  highlightedNeighborIds: Set<string> | null;
  selectedNodeId: string | null;
};
