import type { Edge, Node } from "reactflow";

export type ArcData = {
  tokenWeights: {
    [tokenTypeId: string]: number | undefined;
  };
};

export type ArcType = Edge<ArcData>;

export type PlaceNodeData = {
  label: string;
  initialTokenCounts?: TokenCounts;
  tokenCounts: TokenCounts;
  type: "place";
};

export type PlaceNodeType = Node<PlaceNodeData, "place">;

export type Condition = {
  id: string;
  name: string;
  probability: number;
  outputEdgeId: string;
};

export type TransitionNodeData = {
  conditions?: Condition[];
  label: string;
  delay: number | undefined;
  description: string;
  /**
   * Although a reactflow {@link Node} has a 'type' field, the library types don't discriminate on this field in all methods,
   * so we add our own discriminating field here to make it easier to narrow between Transition and Place nodes.
   */
  type: "transition";
};

export type TransitionNodeType = Node<TransitionNodeData, "transition">;

export type NodeData = PlaceNodeData | TransitionNodeData;

export type NodeType = Node<TransitionNodeData | PlaceNodeData>;

export type TokenCounts = {
  [tokenTypeId: string]: number;
};

export type TokenType = {
  id: string;
  name: string;
  color: string;
};
