import type { GraphVizNode } from "../shared/types";
import type { SerializedGraph } from "graphology-types";

export type NodeData = GraphVizNode & {
  disabled?: boolean;
  nodePathToHighlight?: string[];
  shortestPathTo?: string;
  shortestPathVia?: string;
  valueForSelector: string;
};

export type Path = {
  nodePath: string[];
  label: string;
  significance?: number;
  valueForSelector: string;
};

export const simplePathSorts = [
  "Alphabetical",
  "Length",
  "Significance",
] as const;

export type SimplePathSort = (typeof simplePathSorts)[number];

export const pathDirections = ["Outgoing only", "Undirected"] as const;

export type PathDirection = (typeof pathDirections)[number];

export type GenerateSimplePathsParams = {
  allowRepeatedNodeTypes: boolean;
  endNode: NodeData;
  graph: SerializedGraph;
  maxSimplePathDepth: number;
  pathDirection: PathDirection;
  simplePathSort: SimplePathSort;
  startNode: NodeData;
  viaNode: NodeData | null;
};

export type GenerateSimplePathsRequestMessage = {
  type: "generateSimplePaths";
  params: GenerateSimplePathsParams;
};

export type GenerateSimplePathsResultMessage = {
  type: "generateSimplePathsResult";
  result: Path[];
};
