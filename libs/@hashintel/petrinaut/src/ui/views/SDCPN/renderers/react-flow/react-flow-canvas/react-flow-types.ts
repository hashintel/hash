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
import type { OutlineNode } from "./shared/outline-arcs";
import type { Edge, Node } from "@xyflow/react";

export type TransitionFrameState = NonNullable<
  ReturnType<SimulationFrameReader["getTransitionState"]>
>;

export type PlaceNodeData = CanvasPlaceNode;

export type TransitionNodeData = CanvasTransitionNode;

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

export type ArcData = Pick<
  CanvasArc,
  "kind" | "weight" | "focus" | "transitionId"
> & {
  /**
   * The outlines the arc attaches to. An end with none, at a subnet port,
   * attaches to the port's handle instead.
   */
  sourceOutline: OutlineNode | null;
  targetOutline: OutlineNode | null;
  /** Whether an arc runs the other way between the same two nodes. */
  hasReverseArc: boolean;
};

export type ArcEdgeType = Edge<ArcData>;
