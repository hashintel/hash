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
  /**
   * If the process is a subprocess, it represents the detail of a transition from the parent.
   * It must contain at least one each of input and output places to that parent transition.
   * This field indicates if this place corresponds to an input or output place to the transition in the parent.
   */
  parentProcessNode?: {
    id: string;
    type: "input" | "output";
  };
  type: "place";
};

export type PlaceMarkingsById = Record<string, TokenCounts>;

export type PlaceNodeType = Node<PlaceNodeData, "place">;

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
  subProcess?: {
    subProcessId: string;
    subProcessTitle: string;
    /**
     * The IDs of the input places for this transition which are represented in the subprocess (which should appear as starting places there).
     * There must be at least one, but not all input places to this transition (in the parent) must appear in the subprocess.
     */
    inputPlaceIds: string[];
    /**
     * The IDs of the output places for this transition which are represented in the subprocess (which should appear as ending places there).
     * There must be at least one, but not all output places to this transition (in the parent) must appear in the subprocess.
     */
    outputPlaceIds: string[];
  };
  /**
   * Although a reactflow {@link Node} has a 'type' field, the library types don't discriminate on this field in all methods,
   * so we add our own discriminating field here to make it easier to narrow between Transition and Place nodes.
   */
  type: "transition";
};

export type PetriNetDefinitionObject = {
  arcs: ArcType[];
  nodes: NodeType[];
  tokenTypes: TokenType[];
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

export type MinimalNetMetadata = {
  netId: string;
  title: string;
};
