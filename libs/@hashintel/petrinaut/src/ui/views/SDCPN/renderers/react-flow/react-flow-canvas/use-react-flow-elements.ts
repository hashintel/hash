import { MarkerType } from "@xyflow/react";

import { arcHaloColor } from "../../../styles/focus";
import { useStableItems } from "../../../use-stable-items";
import { instanceFlowOrigin, instanceFlowPosition } from "./instance-anchor";
import { portInHandleId, portOutHandleId } from "./port-handles";
import { getOutlineNode } from "./shared/outline-arcs";

import type {
  CanvasArc,
  CanvasFusionLink,
  CanvasLinkEnds,
  CanvasNode,
  CanvasScene,
} from "../../../canvas-scene";
import type {
  ArcData,
  ArcEdgeType,
  CanvasEdgeType,
  FusionEdgeType,
  NodeType,
} from "./react-flow-types";

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
      return {
        ...common,
        position: instanceFlowPosition(node),
        origin: instanceFlowOrigin,
        type: "componentInstance",
        data: node,
      };
  }
};

/** What every edge takes from the line it draws: its ends, and its focus class. */
const edgeBase = (link: CanvasLinkEnds & Pick<CanvasArc, "id" | "focus">) => ({
  id: link.id,
  source: link.sourceId,
  target: link.targetId,
  sourceHandle: link.sourcePortId
    ? portOutHandleId(link.sourcePortId)
    : undefined,
  targetHandle: link.targetPortId
    ? portInHandleId(link.targetPortId)
    : undefined,
  // Only an edge carrying a role is marked, so the pane can mute the rest
  // without touching them.
  className: link.focus === "none" ? undefined : "canvas-focus-role",
});

const toReactFlowEdge = (
  arc: CanvasArc,
  attachments: Pick<
    ArcData,
    "sourceOutline" | "targetOutline" | "hasReverseArc"
  >,
): ArcEdgeType => {
  const color = arc.color;
  // The casing cannot wrap the arrowhead, so the arrowhead takes its colour:
  // the cased arc then runs into a head of the same colour rather than
  // stopping at a grey one.
  const headColor = arcHaloColor(arc.focus) ?? color;
  return {
    ...edgeBase(arc),
    type: "default",
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
      ...attachments,
    },
  };
};

const toFusionEdge = (link: CanvasFusionLink): FusionEdgeType => ({
  ...edgeBase(link),
  type: "fusion",
  selected: link.selected,
  data: {
    fusionId: link.fusionId,
    name: link.name,
    focus: link.focus,
    severity: link.severity,
  },
});

/**
 * The scene as React Flow nodes and edges. Each arc carries the outlines of
 * the nodes it joins; a component instance has none, so an arc at a subnet
 * port ends at the port's handle. No per-frame value rides here: a place's
 * token count and a transition's firing state reach them by subscription, so
 * a playback frame leaves this list untouched.
 */
export const useReactFlowElements = (
  scene: CanvasScene,
): { nodes: NodeType[]; edges: CanvasEdgeType[] } => {
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const outlineOf = (nodeId: string) => {
    const node = nodesById.get(nodeId);
    return node ? getOutlineNode(node) : null;
  };
  // Node pairs only, ports aside: an arc into a subnet port and one out of
  // the same component would otherwise meet the transition at one point.
  const connections = new Set(
    scene.arcs.map((arc) => JSON.stringify([arc.sourceId, arc.targetId])),
  );

  // Rebuilt from the scene, then held at their previous identity where
  // nothing changed, so React Flow re-renders only what a hover touched.
  return {
    nodes: useStableItems(scene.nodes.map(toReactFlowNode)),
    edges: useStableItems<CanvasEdgeType>([
      ...scene.arcs.map((arc): ArcEdgeType =>
        toReactFlowEdge(arc, {
          sourceOutline: outlineOf(arc.sourceId),
          targetOutline: outlineOf(arc.targetId),
          hasReverseArc: connections.has(
            JSON.stringify([arc.targetId, arc.sourceId]),
          ),
        }),
      ),
      ...scene.fusions.map(toFusionEdge),
    ]),
  };
};
