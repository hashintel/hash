import { MarkerType } from "@xyflow/react";
import { use } from "react";

import { ExecutionFrameSourceContext } from "../../../../../../react/execution-frame/context";
import { SimulationContext } from "../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { arcHaloColor } from "../../../styles/focus";
import { useStableItems } from "../../../use-stable-items";
import { portInHandleId, portOutHandleId } from "./port-handles";

import type {
  InitialMarking,
  SimulationFrameReader,
  SimulationFrameState,
} from "../../../../../../react/simulation/context";
import type { CanvasArc, CanvasNode, CanvasScene } from "../../../canvas-scene";
import type { ArcEdgeType, NodeType } from "./react-flow-types";

const ARC_STROKE_WIDTH = 2;
const ARC_MARKER_SIZE = 20;

/**
 * What a place shows in its badge: the viewed frame's count, or the initial
 * marking while simulate mode waits for a run. Null hides the badge.
 *
 * Read here rather than in the place component: the frame source changes on
 * every playback frame, so a place that subscribed to it would re-render on
 * every frame whether or not its own count moved.
 */
const placeTokenCount = (
  placeId: string,
  frame: FrameContext,
): number | null => {
  if (frame.viewedFrame) {
    return frame.viewedFrame.places[placeId]?.tokenCount ?? null;
  }
  if (!frame.simulateMode) {
    return null;
  }
  const marking = frame.initialMarking[placeId];
  return typeof marking === "number" ? marking : (marking?.length ?? 0);
};

type FrameContext = {
  reader: SimulationFrameReader | null;
  viewedFrame: SimulationFrameState | null;
  framesAvailable: boolean;
  initialMarking: InitialMarking;
  simulateMode: boolean;
};

const toReactFlowNode = (node: CanvasNode, frame: FrameContext): NodeType => {
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
      return {
        ...common,
        type: "place",
        data: {
          ...node,
          tokenCount: placeTokenCount(node.id, frame),
          framesAvailable: frame.framesAvailable,
        },
      };
    case "transition":
      return {
        ...common,
        type: "transition",
        data: {
          ...node,
          frame: frame.reader?.getTransitionState(node.id) ?? null,
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
  const { currentFrameReader, currentViewedFrame, totalFrames } = use(
    ExecutionFrameSourceContext,
  );
  const { initialMarking } = use(SimulationContext);
  const { globalMode } = use(EditorContext);
  const frame: FrameContext = {
    reader: currentFrameReader,
    viewedFrame: currentViewedFrame,
    framesAvailable: totalFrames > 0,
    initialMarking,
    simulateMode: globalMode === "simulate",
  };
  // Rebuilt from the scene, then held at their previous identity where
  // nothing changed, so React Flow re-renders only what a hover touched.
  return {
    nodes: useStableItems(
      scene.nodes.map((node) => toReactFlowNode(node, frame)),
    ),
    edges: useStableItems(
      scene.arcs.map((arc) => toReactFlowEdge(arc, currentFrameReader)),
    ),
  };
};
