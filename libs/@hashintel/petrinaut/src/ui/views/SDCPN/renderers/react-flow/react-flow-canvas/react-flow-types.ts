/**
 * React Flow's node and edge types for the canvas: the scene's nodes and arcs,
 * plus the simulation frame state React Flow components animate from.
 */

import type { SimulationFrameReader } from "../../../../../../react/simulation/context";
import type {
  CanvasArc,
  CanvasComponentInstanceNode,
  CanvasFusionLink,
  CanvasPlaceNode,
  CanvasTransitionNode,
} from "../../../canvas-scene";
import type { OutlineArcPath } from "./shared/outline-arcs";
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
  outlinePath?: OutlineArcPath;
};

export type ArcEdgeType = Edge<ArcData, "default">;

export type FusionEdgeData = Pick<
  CanvasFusionLink,
  "fusionId" | "name" | "focus" | "severity"
> & {
  /** Never set: an automatic arc outline is an arc's alone. */
  outlinePath?: undefined;
};

export type FusionEdgeType = Edge<FusionEdgeData, "fusion">;

export type CanvasEdgeType = ArcEdgeType | FusionEdgeType;

/** The fusion an edge draws, or `null` for an arc. */
export const fusionIdOfEdge = (edge: Edge): string | null =>
  edge.type === "fusion" && typeof edge.data?.fusionId === "string"
    ? edge.data.fusionId
    : null;
