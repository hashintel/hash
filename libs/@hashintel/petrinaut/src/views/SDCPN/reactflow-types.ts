import type { Edge, Node, ReactFlowInstance } from "reactflow";

//
// Specific types for ReactFlow nodes, arcs, and instance.
// Serve for mapping between Petrinaut Contexts and ReactFlow.
//

export type ArcData = {
  weight: number;
};

export type ArcType = Omit<Edge<ArcData>, "style">;

export type PlaceNodeData = {
  label: string;
  type: "place";
  dynamicsEnabled: boolean;
  hasColorType: boolean;
  typeColor?: string; // Color code from the type, if assigned
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

export type PetrinautReactFlowInstance = ReactFlowInstance<NodeData, ArcData>;
