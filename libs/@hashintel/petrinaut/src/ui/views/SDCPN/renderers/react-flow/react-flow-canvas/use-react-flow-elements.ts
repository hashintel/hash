import { MarkerType } from "@xyflow/react";
import { use } from "react";

import { ExecutionFrameSourceContext } from "../../../../../../react/execution-frame/context";
import { arcFocusColor, arcHaloColor } from "../../../styles/focus";
import { portInHandleId, portOutHandleId } from "./port-handles";

import type { SimulationFrameReader } from "../../../../../../react/simulation/context";
import type { CanvasArc, CanvasNode, CanvasScene } from "../../../canvas-scene";
import type { ArcEdgeType, NodeType } from "./react-flow-types";

const ARC_STROKE_WIDTH = 2;
const ARC_MARKER_SIZE = 20;

const toReactFlowNode = (
  node: CanvasNode,
  frameReader: SimulationFrameReader | null,
): NodeType => {
  const size = { width: node.width, height: node.height };
  const common = {
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
      return {
        ...common,
        type: "transition",
        data: {
          ...node,
          frame: frameReader?.getTransitionState(node.id) ?? null,
        },
      };
    case "componentInstance":
      return { ...common, type: "componentInstance", data: node };
  }
};

const toReactFlowEdge = (
  arc: CanvasArc,
  frameReader: SimulationFrameReader | null,
): ArcEdgeType => {
  const color = arcFocusColor(arc.focus, arc.color);
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
      selected: arc.selected,
      focus: arc.focus,
      frame: frameReader?.getTransitionState(arc.transitionId) ?? null,
    },
  };
};

/**
 * The scene as React Flow nodes and edges. React Flow keeps its own copy of
 * both, so these are rebuilt on every render and reconciled by id.
 */
export const useReactFlowElements = (
  scene: CanvasScene,
): { nodes: NodeType[]; edges: ArcEdgeType[] } => {
  const { currentFrameReader } = use(ExecutionFrameSourceContext);
  return {
    nodes: scene.nodes.map((node) => toReactFlowNode(node, currentFrameReader)),
    edges: scene.arcs.map((arc) => toReactFlowEdge(arc, currentFrameReader)),
  };
};
