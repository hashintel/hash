import { use, useEffect, useEffectEvent, useRef } from "react";

import {
  getBoundsOfCenteredBoxes,
  type SelectionMap,
  type Size,
} from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../react/state/editor-context";
import { usePanelTarget } from "../../../../react/state/use-selection";
import {
  BOTTOM_BAR_GAP,
  BOTTOM_BAR_HEIGHT,
  VIEWPORT_CONTROLS_CLEARANCE,
} from "../../../constants/ui";
import {
  isScenePointInView,
  revealBounds,
  type CanvasViewportInsets,
} from "../canvas-viewport";

import type { CanvasInsets } from "../../../hooks/use-canvas-insets";
import type { CanvasController } from "../canvas-renderer";
import type { CanvasScene } from "../canvas-scene";

/** Screen pixels kept free around a selection brought into view. */
const margin = 32;

/**
 * What a selection in view keeps clear of: the panels, the controls floating
 * over the canvas, and a margin. The viewport controls run up the right edge,
 * and the bottom bar sits above the bottom panel.
 */
const clearanceOf = (insets: CanvasInsets): CanvasViewportInsets => ({
  left: insets.left + margin,
  top: margin,
  right: insets.right + VIEWPORT_CONTROLS_CLEARANCE + margin,
  bottom: insets.bottom + BOTTOM_BAR_GAP + BOTTOM_BAR_HEIGHT + margin,
});

/**
 * The nodes a selection stands for on the canvas: the selected nodes, and both
 * ends of a selected arc, which has no geometry of its own.
 */
const selectedNodesOf = (scene: CanvasScene, selection: SelectionMap) => {
  const ids = new Set(selection.keys());
  for (const arc of scene.arcs) {
    if (selection.has(arc.id)) {
      ids.add(arc.sourceId);
      ids.add(arc.targetId);
    }
  }
  return scene.nodes.filter((node) => ids.has(node.id));
};

/**
 * Keeps the selection where the user can see it.
 *
 * - Selecting a single item, on the canvas or anywhere else, slides it into
 *   view when a panel covers it or it is off screen. A multiple selection,
 *   made with a drag on the canvas, never moves the camera.
 * - When a panel opens or resizes, a selection that was in view stays in
 *   view: the camera pans just far enough to clear the panel. A selection the
 *   user had panned away from is left alone.
 *
 * Moves go through the controller's camera, which retargets, so a splitter
 * drag can ask for a new position on every frame without stutter.
 */
export const useKeepSelectionInView = ({
  controller,
  scene,
  containerSize,
  insets: { left, right, bottom },
  minZoom,
}: {
  controller: CanvasController;
  scene: CanvasScene;
  containerSize: Size;
  insets: CanvasInsets;
  minZoom: number;
}) => {
  const { selection } = use(EditorContext);
  const target = usePanelTarget();
  const soleSelectedId = target.kind === "single" ? target.item.id : undefined;

  /** `inViewUnder` limits the move to a selection in view under those insets. */
  const reveal = useEffectEvent((inViewUnder?: CanvasInsets) => {
    const nodes = selectedNodesOf(scene, selection);
    const bounds = getBoundsOfCenteredBoxes(nodes);
    if (!bounds) {
      return;
    }
    const viewport = controller.getViewport();
    const centre = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
    if (
      inViewUnder &&
      !isScenePointInView(
        centre,
        viewport,
        containerSize,
        clearanceOf(inViewUnder),
      )
    ) {
      return;
    }
    const next = revealBounds({
      bounds,
      viewport,
      container: containerSize,
      insets: clearanceOf({ left, right, bottom }),
      minZoom,
      zoomOut: nodes.length === 1,
    });
    if (next) {
      controller.setViewport(next, { animate: true });
    }
  });

  // Starts from what the canvas opened with: the saved viewport already
  // frames that selection as the user left it.
  const lastRef = useRef({ soleSelectedId, left, right, bottom });
  useEffect(() => {
    const last = lastRef.current;
    lastRef.current = { soleSelectedId, left, right, bottom };
    if (soleSelectedId !== last.soleSelectedId) {
      if (soleSelectedId !== undefined) {
        reveal();
      }
    } else if (
      left !== last.left ||
      right !== last.right ||
      bottom !== last.bottom
    ) {
      reveal(last);
    }
  }, [soleSelectedId, left, right, bottom]);
};
