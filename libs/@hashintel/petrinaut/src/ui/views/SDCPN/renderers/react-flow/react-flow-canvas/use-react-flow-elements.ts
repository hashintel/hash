import { useStableItems } from "../../../use-stable-items";
import { ARC_STROKE_WIDTH, arcHeadOf } from "./arc-head";
import { instanceFlowOrigin, instanceFlowPosition } from "./instance-anchor";
import { portInHandleId, portOutHandleId } from "./port-handles";
import { getOutlineNode } from "./shared/outline-arcs";
import { useArcHeadRoles } from "./use-arc-head-roles";

import type { CanvasArcFocus } from "../../../canvas-focus";
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

const toArcEdge = (
  arc: CanvasArc,
  /** The id of the arrowhead, for an arc that ends in one. */
  headId: string | undefined,
  attachments: Pick<
    ArcData,
    "sourceOutline" | "targetOutline" | "hasReverseArc"
  >,
): ArcEdgeType => ({
  ...edgeBase(arc),
  type: "default",
  selected: arc.selected,
  // The id of a marker the canvas draws itself: React Flow adds none for it.
  markerEnd: headId,
  style: {
    stroke: arc.color,
    strokeWidth: ARC_STROKE_WIDTH,
  },
  data: {
    kind: arc.kind,
    weight: arc.weight,
    focus: arc.focus,
    transitionId: arc.transitionId,
    ...attachments,
  },
});

const toFusionEdge = (link: CanvasFusionLink): FusionEdgeType => ({
  ...edgeBase(link),
  type: "fusion",
  selected: link.selected,
  reconnectable: link.movableEnds === "both" ? true : link.movableEnds,
  data: {
    fusionId: link.fusionId,
    name: link.name,
    focus: link.focus,
    severity: link.severity,
  },
});

type ReactFlowElements = { nodes: NodeType[]; edges: CanvasEdgeType[] };

const toReactFlowElements = (
  scene: CanvasScene,
  canvasId: string,
  headRoles: ReadonlyMap<string, CanvasArcFocus>,
): ReactFlowElements => {
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const outlineOf = (nodeId: string) => {
    const node = nodesById.get(nodeId);
    return node ? getOutlineNode(node) : null;
  };
  // Node pairs only, ports aside: an arc into a component port and one out of
  // the same component would otherwise meet the transition at one point.
  const connections = new Set(
    scene.arcs.map((arc) => JSON.stringify([arc.sourceId, arc.targetId])),
  );

  return {
    nodes: scene.nodes.map(toReactFlowNode),
    edges: [
      ...scene.arcs.map((arc) =>
        toArcEdge(
          arc,
          // A read or an inhibitor arc ends in a mark of its own.
          arc.kind === "standard"
            ? arcHeadOf(canvasId, {
                color: arc.color,
                focus: headRoles.get(arc.id) ?? "none",
              }).id
            : undefined,
          {
            sourceOutline: outlineOf(arc.sourceId),
            targetOutline: outlineOf(arc.targetId),
            hasReverseArc: connections.has(
              JSON.stringify([arc.targetId, arc.sourceId]),
            ),
          },
        ),
      ),
      ...scene.fusions.map(toFusionEdge),
    ],
  };
};

/**
 * The scene as React Flow nodes and edges. Each arc carries the outlines of
 * the nodes it joins; a component instance has none, so an arc at a component
 * port ends at the port's handle. No per-frame value rides here: a place's
 * token count and a transition's firing state reach them by subscription, so
 * a playback frame leaves this list untouched. `canvasId` names the
 * arrowheads of this canvas: see `arcHeadOf`. An arc points at the head of
 * the role `useArcHeadRoles` gives it, which outlasts the focus.
 *
 * The elements are rebuilt when the scene is, then held at their previous
 * identity where nothing changed, so React Flow renders only what changed.
 */
export const useReactFlowElements = (
  scene: CanvasScene,
  canvasId: string,
): ReactFlowElements => {
  const headRoles = useArcHeadRoles(scene);
  const { nodes, edges } = toReactFlowElements(scene, canvasId, headRoles);
  return { nodes: useStableItems(nodes), edges: useStableItems(edges) };
};
