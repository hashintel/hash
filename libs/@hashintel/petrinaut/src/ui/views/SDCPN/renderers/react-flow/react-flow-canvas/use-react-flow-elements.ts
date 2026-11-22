import { useStore } from "@xyflow/react";

import { useStableItems } from "../../../use-stable-items";
import { arcLayerEdgeId } from "./arc-layer-context";
import { instanceFlowOrigin, instanceFlowPosition } from "./instance-anchor";
import { portInHandleId, portOutHandleId } from "./port-handles";
import { useArcLayerAnchor } from "./use-react-flow-elements/arc-layer-anchor";

import type {
  CanvasArc,
  CanvasFusionLink,
  CanvasLinkEnds,
  CanvasNode,
  CanvasScene,
} from "../../../canvas-scene";
import type {
  ArcLayerEdgeType,
  CanvasEdgeType,
  FusionEdgeType,
  NodeType,
  SelectedArcEdgeType,
} from "./react-flow-types";

/**
 * Marks a node or a fusion link that has a role in the focus. Only those are
 * marked, so the pane can mute the rest without touching them.
 */
const focusRoleClass = "canvas-focus-role";

const toReactFlowNode = (node: CanvasNode): NodeType => {
  const size = { width: node.width, height: node.height };
  const common = {
    className: node.focus === "none" ? undefined : focusRoleClass,
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

/** The ends of a line as React Flow names them. */
const edgeEnds = (link: CanvasLinkEnds & Pick<CanvasArc, "id">) => ({
  id: link.id,
  source: link.sourceId,
  target: link.targetId,
  sourceHandle: link.sourcePortId
    ? portOutHandleId(link.sourcePortId)
    : undefined,
  targetHandle: link.targetPortId
    ? portInHandleId(link.targetPortId)
    : undefined,
});

/**
 * The edge that draws every arc. React Flow draws an edge between two nodes
 * it has measured, so the layer's edge runs from one node to itself: the
 * anchor, which `useArcLayerAnchor` chooses. Anchored at an arc's own ends,
 * one arc at a component that cannot be read would hide them all.
 *
 * The wrapper React Flow puts around an edge says nothing to a screen
 * reader here and takes no focus: each arc has an element of its own inside
 * it. React Flow names an edge unless its label is `null`, which its type
 * leaves out.
 */
const toArcLayerEdge = (anchorId: string): ArcLayerEdgeType => ({
  id: arcLayerEdgeId,
  type: "arcs",
  source: anchorId,
  target: anchorId,
  focusable: false,
  selectable: false,
  ariaRole: "none",
  ariaLabel: null as unknown as undefined,
  domAttributes: { "aria-roledescription": undefined },
});

const toSelectedArcEdge = (arc: CanvasArc): SelectedArcEdgeType => ({
  ...edgeEnds(arc),
  hidden: true,
  selected: true,
});

const toFusionEdge = (link: CanvasFusionLink): FusionEdgeType => ({
  ...edgeEnds(link),
  type: "fusion",
  className: link.focus === "none" ? undefined : focusRoleClass,
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

/**
 * Whether React Flow draws the focus of the scene.
 *
 * React Flow takes the nodes of a scene up in an effect, a commit after the
 * render that made them, and the browser may show a frame in between. A node
 * outside the focus dims in one frame, so a pane that said "a focus is
 * active" with the scene would show that frame with the neighbourhood dimmed
 * too. The focus is drawn once a node React Flow holds has a role. While a
 * focus moves from one item to another the nodes of the one before have
 * theirs, and when it ends the scene says so at once.
 */
const useFocusDrawn = (scene: CanvasScene): boolean =>
  useStore(
    (state) =>
      scene.focusActive &&
      state.nodes.some((node) => node.className === focusRoleClass),
  );

const toReactFlowElements = (
  scene: CanvasScene,
  anchor: string | undefined,
): ReactFlowElements => ({
  nodes: scene.nodes.map(toReactFlowNode),
  edges: [
    // First, so the arcs lie under the fusion links and come before them
    // in the order of the Tab key.
    ...(anchor === undefined ? [] : [toArcLayerEdge(anchor)]),
    ...scene.arcs.filter((arc) => arc.selected).map(toSelectedArcEdge),
    ...scene.fusions.map(toFusionEdge),
  ],
});

/**
 * The scene as React Flow nodes and edges. React Flow holds one edge for all
 * the arcs, which draws them from the scene, an edge it does not draw for
 * each selected arc, and the fusion links. The edge of the arcs hangs on a
 * node React Flow has measured, so this reads React Flow's store. No
 * per-frame value rides here: a place's token count and a transition's
 * firing state reach them by subscription, so a playback frame leaves this
 * list untouched.
 *
 * The elements are rebuilt when the scene is, then held at their previous
 * identity where nothing changed, so React Flow renders only what changed.
 */
export const useReactFlowElements = (
  scene: CanvasScene,
): ReactFlowElements & { focusDrawn: boolean } => {
  const anchor = useArcLayerAnchor(scene);
  const { nodes, edges } = toReactFlowElements(scene, anchor);
  return {
    nodes: useStableItems(nodes),
    edges: useStableItems(edges),
    focusDrawn: useFocusDrawn(scene),
  };
};
