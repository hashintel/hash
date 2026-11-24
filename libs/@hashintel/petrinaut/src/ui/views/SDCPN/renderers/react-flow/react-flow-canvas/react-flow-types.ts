/**
 * React Flow's node and edge types for the canvas: the scene's nodes, the
 * layer that draws its arcs, and its fusion links.
 */

import type {
  CanvasComponentInstanceNode,
  CanvasFusionLink,
  CanvasPlaceNode,
  CanvasTransitionNode,
} from "../../../canvas-scene";
import type { CanvasLinkItem } from "../../../use-canvas-interactions";
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

/**
 * The one edge that draws every arc: see `ArcLayer`. It has no data: the
 * layer reads the scene from a context.
 */
export type ArcLayerEdgeType = Edge<Record<string, never>, "arcs">;

/**
 * A selected arc, which React Flow holds without drawing it. Every way it
 * has of deselecting an edge then reports the arc: a click on a node, the
 * start of a box, a click on a fusion link.
 */
export type SelectedArcEdgeType = Edge<Record<string, never>, undefined>;

type FusionEdgeData = Pick<
  CanvasFusionLink,
  "fusionId" | "name" | "focus" | "severity"
>;

export type FusionEdgeType = Edge<FusionEdgeData, "fusion">;

export type CanvasEdgeType =
  | ArcLayerEdgeType
  | SelectedArcEdgeType
  | FusionEdgeType;

/** The fusion an edge is a link of, or `null` for an edge that is no fusion link. */
export const fusionItemOf = (edge: CanvasEdgeType): CanvasLinkItem | null =>
  edge.type === "fusion" && edge.data
    ? { type: "fusion", id: edge.data.fusionId }
    : null;
