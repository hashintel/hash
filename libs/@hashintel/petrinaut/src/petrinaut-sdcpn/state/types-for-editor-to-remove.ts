import type { Edge, Node } from "reactflow";

//
// These types are React-Flow specific, and should not appear in the global state.
// Instead we should only use them in SDCPNView and related components/mappers.
//

export type ArcData = {
  tokenWeights: {
    [tokenTypeId: string]: number | undefined;
  };
};

export type ArcType = Omit<Edge<ArcData>, "style">;

export type PlaceNodeData = {
  label: string;
  type: "place";
  dynamicsEnabled: boolean;
  hasColorType: boolean;
};

export type TransitionNodeData = {
  label: string;
  /**
   * Although a reactflow {@link Node} has a 'type' field, the library types don't discriminate on this field in all methods,
   * so we add our own discriminating field here to make it easier to narrow between Transition and Place nodes.
   */
  type: "transition";
  lambdaType: "predicate" | "stochastic";
};

export type TransitionNodeType = Omit<
  Node<TransitionNodeData, "transition">,
  "selected" | "dragging"
>;

export type PetriNetDefinitionObject = {
  arcs: ArcType[];
  nodes: NodeType[];
};

export type NodeData = PlaceNodeData | TransitionNodeData;

export type NodeType = Node<TransitionNodeData | PlaceNodeData>;
