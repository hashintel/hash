export type GraphVizNode = {
  borderColor?: string;
  color: string;
  icon?: string;
  nodeId: string;
  nodeTypeId?: string;
  nodeTypeLabel?: string;
  label: string;
  size: number;
};

export type GraphVizEdge = {
  edgeId: string;
  edgeTypeId?: string;
  label?: string;
  size: number;
  source: string;
  target: string;
};
