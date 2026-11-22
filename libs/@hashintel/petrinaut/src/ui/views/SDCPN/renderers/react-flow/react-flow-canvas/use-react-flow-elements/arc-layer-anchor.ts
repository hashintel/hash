/**
 * The node that the edge of the arc layer hangs on.
 *
 * React Flow renders an edge between two nodes whose handles it has
 * measured, and takes the edge off the page while one of them is not: a node
 * that was just created is measured a frame after it appears. Every arc is
 * drawn inside that one edge, so its node has to be one React Flow can place
 * now. The node stays the same for as long as it can be: a new one is chosen
 * when it leaves the scene, and never because another node appears.
 */

import { type InternalNode, useStore } from "@xyflow/react";
import { useState } from "react";

import type { CanvasScene } from "../../../../canvas-scene";

/**
 * Whether React Flow can run an edge from a node to itself: it has measured
 * a handle an edge can start at. In the loose connection mode of the canvas
 * the edge may end at the same handle.
 */
export const canAnchor = (node: InternalNode | undefined): boolean =>
  (node?.internals.handleBounds?.source?.length ?? 0) > 0;

/**
 * The node for the layer's edge, or `undefined` for a net without arcs.
 *
 * `held` is the node of the render before, if the scene still has it. It is
 * kept while React Flow can place it. Otherwise the first arc's transition
 * that React Flow can place is taken: a transition has a handle of each kind
 * in every mode, and every arc has one at one end, where a component may
 * have no pin to measure. Before React Flow has measured any of them the
 * choice does not matter, and stays what it was.
 */
export const arcLayerAnchor = (
  arcs: CanvasScene["arcs"],
  held: string | undefined,
  canPlace: (nodeId: string) => boolean,
): string | undefined => {
  const [first] = arcs;
  if (!first) {
    return undefined;
  }
  if (held !== undefined && canPlace(held)) {
    return held;
  }
  return (
    arcs.find((arc) => canPlace(arc.transitionId))?.transitionId ??
    held ??
    first.transitionId
  );
};

/**
 * The node for the layer's edge in this scene, read against what React Flow
 * has measured.
 *
 * React Flow's store learns of a scene after the render that draws it. A
 * node the scene no longer has is therefore dropped here, by the scene, and
 * not when the store drops it: the edge would hang on a missing node for a
 * render. The node of the render before is state adjusted during render.
 */
export const useArcLayerAnchor = (
  scene: Pick<CanvasScene, "nodes" | "arcs">,
): string | undefined => {
  const [held, setHeld] = useState<string>();
  const stillThere =
    held !== undefined && scene.nodes.some((node) => node.id === held)
      ? held
      : undefined;
  const anchor = useStore((state) =>
    arcLayerAnchor(scene.arcs, stillThere, (nodeId) =>
      canAnchor(state.nodeLookup.get(nodeId)),
    ),
  );
  if (anchor !== held) {
    setHeld(anchor);
  }
  return anchor;
};
