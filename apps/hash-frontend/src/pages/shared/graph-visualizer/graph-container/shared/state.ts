export type GraphState = {
  hoveredNodeId: string | null;
  hoveredNeighborIds: Set<string> | null;
  selectedNodeId: string | null;
};
