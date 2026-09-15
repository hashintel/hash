import { MarkerType } from "@xyflow/react";

import { arcHaloColor } from "../../../styles/focus";
import { useStableItems } from "../../../use-stable-items";
import { portInHandleId, portOutHandleId } from "./port-handles";

import type { CanvasArc, CanvasNode, CanvasScene } from "../../../canvas-scene";
import type { ArcEdgeType, NodeType } from "./react-flow-types";

const ARC_STROKE_WIDTH = 2;
const ARC_MARKER_SIZE = 20;

const toReactFlowNode = (node: CanvasNode): NodeType => {
  const size = { width: node.width, height: node.height };
  const common = {
    // Only a node carrying a role is marked, so the pane can mute the rest
    // without touching them.
    className: node.focus === "none" ? undefined : "canvas-focus-role",
    id: node.id,
    position: node.position,
    ...size,
    measured: size,
    dragging: node.dragging,
    selected: node.selected,
  };
  switch (node.kind) {
    case "place":
      return { ...common, type: "place", data: node };
    case "transition":
      return { ...common, type: "transition", data: node };
    case "componentInstance":
      return { ...common, type: "componentInstance", data: node };
  }
};

const toReactFlowEdge = (arc: CanvasArc): ArcEdgeType => {
  const color = arc.color;
  // The casing cannot wrap the arrowhead, so the arrowhead takes its colour:
  // the cased arc then runs into a head of the same colour rather than
  // stopping at a grey one.
  const headColor = arcHaloColor(arc.focus) ?? color;
  return {
    id: arc.id,
    source: arc.sourceId,
    target: arc.targetId,
    sourceHandle: arc.sourcePortId
      ? portOutHandleId(arc.sourcePortId)
      : undefined,
    targetHandle: arc.targetPortId
      ? portInHandleId(arc.targetPortId)
      : undefined,
    type: "default",
    className: arc.focus === "none" ? undefined : "canvas-focus-role",
    selected: arc.selected,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: headColor,
      width: ARC_MARKER_SIZE,
      height: ARC_MARKER_SIZE,
    },
    style: {
      stroke: color,
      strokeWidth: ARC_STROKE_WIDTH,
    },
    data: {
      kind: arc.kind,
      weight: arc.weight,
      focus: arc.focus,
      transitionId: arc.transitionId,
    },
  };
};

/**
 * The scene as React Flow nodes and edges. No per-frame value rides here: a
 * place's token count and a transition's firing state reach them by
 * subscription, so a playback frame leaves this list untouched.
 */
export const useReactFlowElements = (
  scene: CanvasScene,
): { nodes: NodeType[]; edges: ArcEdgeType[] } => {
  // Rebuilt from the scene, then held at their previous identity where
  // nothing changed, so React Flow re-renders only what a hover touched.
  return {
    nodes: useStableItems(scene.nodes.map(toReactFlowNode)),
    edges: useStableItems(scene.arcs.map(toReactFlowEdge)),
  };
};
