import type { Edge, Node } from "reactflow";

export type ArcData = {
  tokenWeights: {
    [tokenTypeId: string]: number | undefined;
  };
};

export type ArcType = Omit<Edge<ArcData>, "style">;

export type PlaceNodeData = {
  label: string;
  initialTokenCounts?: TokenCounts;
  type: "place";
};

export type PlaceMarkingsById = Record<string, TokenCounts>;

export type PlaceNodeType = Omit<
  Node<PlaceNodeData, "place">,
  "selected" | "dragging"
>;

export type TransitionCondition = {
  id: string;
  name: string;
  probability: number;
  outputEdgeId: string;
};

export type TransitionNodeData = {
  conditions?: TransitionCondition[];
  label: string;
  delay?: number;
  description?: string;
  childNet?: {
    childNetId: string;
    childNetTitle: string;
    /**
     * The IDs of the input places for this transition which are represented in the childNet (which should appear as starting places there).
     * There must be at least one, but not all input places to this transition (in the parent) must appear in the childNet.
     */
    inputPlaceIds: string[];
    /**
     * The IDs of the output places for this transition which are represented in the childNet (which should appear as ending places there).
     * There must be at least one, but not all output places to this transition (in the parent) must appear in the childNet.
     */
    outputPlaceIds: string[];
  };
  /**
   * Although a reactflow {@link Node} has a 'type' field, the library types don't discriminate on this field in all methods,
   * so we add our own discriminating field here to make it easier to narrow between Transition and Place nodes.
   */
  type: "transition";
};

export type TransitionNodeType = Omit<
  Node<TransitionNodeData, "transition">,
  "selected" | "dragging"
>;

export type PetriNetDefinitionObject = {
  arcs: ArcType[];
  nodes: NodeType[];
  tokenTypes: TokenType[];
};

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

export type MinimalNetMetadata = {
  netId: string;
  title: string;
};

export type ParentNet = {
  parentNetId: string;
  title: string;
};
