import { use, useEffect, useEffectEvent, useRef } from "react";

import { getBoundsOfCenteredBoxes, type Size } from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../react/state/editor-context";
import {
  BOTTOM_BAR_GAP,
  BOTTOM_BAR_HEIGHT,
  VIEWPORT_CONTROLS_CLEARANCE,
} from "../../../constants/ui";
import { isScenePointInView, revealBounds } from "../canvas-viewport";

import type { CanvasInsets } from "../../../hooks/use-canvas-insets";
import type { CanvasController } from "../canvas-renderer";
import type { CanvasScene } from "../canvas-scene";

/** Screen pixels kept clear between a revealed selection and a panel. */
const revealMargin = 32;

/**
 * The part of the canvas a selection counts as visible in: clear of the
 * panels, and of the controls floating over the canvas. The viewport controls
 * run up the right edge, and the bottom bar sits above the bottom panel.
 */
const withFloatingControls = (insets: CanvasInsets): CanvasInsets => ({
  left: insets.left,
  right: insets.right + VIEWPORT_CONTROLS_CLEARANCE,
  bottom: insets.bottom + BOTTOM_BAR_GAP + BOTTOM_BAR_HEIGHT,
});

/**
 * The nodes a selection stands for on the canvas: selected nodes, and both
 * ends of a selected arc, which has no geometry of its own.
 */
const selectedNodesOf = (
  scene: CanvasScene,
  selectedIds: readonly string[],
) => {
  const ids = new Set<string>();
  for (const id of selectedIds) {
    const arc = scene.arcs.find((candidate) => candidate.id === id);
    if (arc) {
      ids.add(arc.sourceId);
      ids.add(arc.targetId);
    } else {
      ids.add(id);
    }
  }
  return scene.nodes.filter((node) => ids.has(node.id));
};

/**
 * Keeps the selection where the user can see it as the panels around the
 * canvas change, and brings a newly selected item into view.
 *
 * - When a panel opens, resizes or moves, a selection that was in view stays
 *   in view: the camera pans just far enough to clear the panel. A selection
 *   the user had already panned away from is left alone.
 * - When a single item is selected, from the canvas or from anywhere else, it
 *   slides into view if a panel covers it or it is off screen. A multiple
 *   selection, made with a drag on the canvas, never moves the camera.
 *
 * Moves go through the controller's spring, so a panel sliding open and the
 * camera clearing it move together, and a splitter drag retargets the camera
 * on every frame without stutter.
 */
export const useKeepSelectionInView = ({
  controller,
  scene,
  containerSize,
  insets,
  minZoom,
}: {
  controller: CanvasController;
  scene: CanvasScene;
  containerSize: Size;
  insets: CanvasInsets;
  minZoom: number;
}) => {
  const { selection } = use(EditorContext);
  const selectedIds = Array.from(selection.keys());
  const selectionKey = selectedIds.join("\n");

  const reveal = useEffectEvent((previousInsets: CanvasInsets | null) => {
    const nodes = selectedNodesOf(scene, selectedIds);
    const bounds = getBoundsOfCenteredBoxes(nodes);
    if (!bounds) {
      return;
    }
    const viewport = controller.getViewport();
    if (
      previousInsets &&
      !isScenePointInView(
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        viewport,
        containerSize,
        withFloatingControls(previousInsets),
      )
    ) {
      return;
    }
    const next = revealBounds({
      bounds,
      viewport,
      container: containerSize,
      insets: withFloatingControls(insets),
      margin: revealMargin,
      minZoom,
      zoomOut: nodes.length === 1,
    });
    if (next) {
      controller.setViewport(next, { animate: true });
    }
  });

  const previousInsetsRef = useRef(insets);
  useEffect(() => {
    const previous = previousInsetsRef.current;
    previousInsetsRef.current = {
      left: insets.left,
      right: insets.right,
      bottom: insets.bottom,
    };
    if (
      previous.left !== insets.left ||
      previous.right !== insets.right ||
      previous.bottom !== insets.bottom
    ) {
      reveal(previous);
    }
  }, [insets.left, insets.right, insets.bottom]);

  // The first run sees the selection the canvas opened with, which the saved
  // viewport already frames as the user left it.
  const selectionSeenRef = useRef(false);
  useEffect(() => {
    if (!selectionSeenRef.current) {
      selectionSeenRef.current = true;
      return;
    }
    if (selectionKey !== "" && !selectionKey.includes("\n")) {
      reveal(null);
    }
  }, [selectionKey]);
};
