import type { Edge, Node, ReactFlowInstance } from "reactflow";

//
// Specific types for ReactFlow nodes, arcs, and instance.
// Serve for mapping between Petrinaut Contexts and ReactFlow.
//

export type ArcData = {
  weight: number;
  /** Number of times the transition connected to this arc has fired, or null if no simulation. */
  firingCount: number | null;
};

export type ArcType = Omit<Edge<ArcData>, "style">;

export type PlaceNodeData = {
  label: string;
  type: "place";
  dynamicsEnabled: boolean;
  hasColorType: boolean;
  typeColor?: string; // Color code from the type, if assigned
};

export type PlaceNodeType = Node<PlaceNodeData, "place">;

export type TransitionNodeData = {
  label: string;
  /**
   * Although a reactflow {@link Node} has a 'type' field, the library types don't discriminate on this field in all methods,
   * so we add our own discriminating field here to make it easier to narrow between Transition and Place nodes.
   */
  type: "transition";
  lambdaType: "predicate" | "stochastic";
  /** Number of times this transition has fired, or null if no simulation. */
  firingCount: number | null;
};

export type TransitionNodeType = Node<TransitionNodeData, "transition">;

export type NodeData = PlaceNodeData | TransitionNodeData;

export type NodeType = TransitionNodeType | PlaceNodeType;

/**
 * Object containing the nodes and arcs for the ReactFlow instance.
 */
export type PetrinautReactFlowDefinitionObject = {
  arcs: ArcType[];
  nodes: NodeType[];
};

/**
 * ReactFlow instance type for Petrinaut.
 */
export type PetrinautReactFlowInstance = ReactFlowInstance<NodeData, ArcData>;
