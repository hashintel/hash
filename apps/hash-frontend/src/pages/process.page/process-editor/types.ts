import type { Edge, Node } from "reactflow";

import type { TokenType } from "./token-type-editor";

export type ArcData = {
  tokenWeights: {
    [tokenTypeId: string]: number | undefined;
  };
};

export type ArcType = Edge<ArcData>;

export type PlaceNodeData = {
  label: string;
  tokenCounts: TokenCounts;
  tokenTypes: TokenType[];
  type: "place";
};

export type PlaceNodeType = Node<PlaceNodeData>;

export type TransitionNodeData = {
  label: string;
  delay: number | undefined;
  description: string;
  type: "transition";
};

export type TransitionNodeType = Node<TransitionNodeData>;

export type NodeData = PlaceNodeData | TransitionNodeData;

export type NodeType = Node<TransitionNodeData | PlaceNodeData>;

export type TokenCounts = {
  [tokenTypeId: string]: number;
};
