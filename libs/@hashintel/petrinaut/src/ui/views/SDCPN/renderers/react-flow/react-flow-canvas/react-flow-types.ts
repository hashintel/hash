/**
 * React Flow's node and edge types for the canvas: the scene's nodes, arcs
 * and fusion links.
 */

import type {
  CanvasArc,
  CanvasComponentInstanceNode,
  CanvasFusionLink,
  CanvasPlaceNode,
  CanvasTransitionNode,
} from "../../../canvas-scene";
import type { CanvasLinkItem } from "../../../use-canvas-interactions";
import type { OutlineNode } from "./shared/outline-arcs";
import type { Edge, Node } from "@xyflow/react";

export type PlaceNodeType = Node<CanvasPlaceNode, "place">;

export type TransitionNodeType = Node<CanvasTransitionNode, "transition">;

export type ComponentInstanceNodeType = Node<
  CanvasComponentInstanceNode,
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
   * The outlines the arc attaches to. An end with none, at a component port,
   * attaches to the port's handle instead.
   */
  sourceOutline: OutlineNode | null;
  targetOutline: OutlineNode | null;
  /** Whether an arc runs the other way between the same two nodes. */
  hasReverseArc: boolean;
};

export type ArcEdgeType = Edge<ArcData, "default">;

type FusionEdgeData = Pick<
  CanvasFusionLink,
  "fusionId" | "name" | "focus" | "severity"
>;

export type FusionEdgeType = Edge<FusionEdgeData, "fusion">;

export type CanvasEdgeType = ArcEdgeType | FusionEdgeType;

/** The item an edge draws: an arc, or the fusion one of whose links it is. */
export const linkItemOf = (edge: CanvasEdgeType): CanvasLinkItem =>
  edge.type === "fusion" && edge.data
    ? { type: "fusion", id: edge.data.fusionId }
    : { type: "arc", id: edge.id };
