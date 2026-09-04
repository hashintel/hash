/**
 * React Flow's node and edge types for the canvas: the scene's nodes and arcs,
 * plus the simulation frame state React Flow components animate from.
 */

import type { SimulationFrameReader } from "../../../../../../react/simulation/context";
import type {
  CanvasArc,
  CanvasComponentInstanceNode,
  CanvasPlaceNode,
  CanvasTransitionNode,
} from "../../../canvas-scene";
import type { Edge, Node } from "@xyflow/react";

export type TransitionFrameState = NonNullable<
  ReturnType<SimulationFrameReader["getTransitionState"]>
>;

export type PlaceNodeData = CanvasPlaceNode;

export type TransitionNodeData = CanvasTransitionNode & {
  /**
   * State of this transition in the current simulation frame.
   * Null when no simulation is running.
   */
  frame: TransitionFrameState | null;
};

export type ComponentInstanceNodeData = CanvasComponentInstanceNode;

export type PlaceNodeType = Node<PlaceNodeData, "place">;

export type TransitionNodeType = Node<TransitionNodeData, "transition">;

export type ComponentInstanceNodeType = Node<
  ComponentInstanceNodeData,
  "componentInstance"
>;

export type NodeType =
  | TransitionNodeType
  | PlaceNodeType
  | ComponentInstanceNodeType;

export type ArcData = Pick<CanvasArc, "kind" | "weight"> & {
  /**
   * State of the transition connected to this arc in the current simulation frame.
   * Null when no simulation is running.
   */
  frame: TransitionFrameState | null;
};

export type ArcEdgeType = Edge<ArcData>;
