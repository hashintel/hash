import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";

import type { SimulationFrameState_Transition } from "../../simulation/context";

//
// Specific types for ReactFlow nodes, arcs, and instance.
// Serve for mapping between Petrinaut Contexts and ReactFlow.
//

export type ArcData = {
  weight: number;
  arcType: "standard" | "inhibitor";
  /**
   * State of the transition connected to this arc in the current simulation frame.
   * Null when no simulation is running.
   */
  frame: SimulationFrameState_Transition | null;
};

export type ArcEdgeType = Edge<ArcData>;

export type ArcType = ArcEdgeType;

export type WireData = {
  externalPlaceId: string;
  internalPlaceId: string;
};

export type WireEdgeType = Edge<WireData>;

export type WireType = WireEdgeType;

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
  /**
   * State of this transition in the current simulation frame.
   * Null when no simulation is running.
   */
  frame: SimulationFrameState_Transition | null;
};

export type TransitionNodeType = Node<TransitionNodeData, "transition">;

export type ComponentInstancePort = {
  id: string;
  name: string;
};

export type ComponentInstanceNodeData = {
  label: string;
  type: "componentInstance";
  subnetName: string;
  ports: ComponentInstancePort[];
};

export type ComponentInstanceNodeType = Node<
  ComponentInstanceNodeData,
  "componentInstance"
>;

export type NodeData =
  | PlaceNodeData
  | TransitionNodeData
  | ComponentInstanceNodeData;

export type NodeType =
  | TransitionNodeType
  | PlaceNodeType
  | ComponentInstanceNodeType;

export type EdgeType = ArcType | WireType;

/**
 * Object containing the nodes and edges for the ReactFlow instance.
 */
export type PetrinautReactFlowDefinitionObject = {
  edges: EdgeType[];
  nodes: NodeType[];
};

/**
 * ReactFlow instance type for Petrinaut.
 */
export type PetrinautReactFlowInstance = ReactFlowInstance<
  NodeType,
  ArcEdgeType | WireEdgeType
>;
