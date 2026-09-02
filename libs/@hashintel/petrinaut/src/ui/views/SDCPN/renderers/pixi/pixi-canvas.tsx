/**
 * @layerRoot ui.views.canvas.pixi
 * @role Draws the canvas scene with Pixi and turns pointer gestures into the shared canvas interactions
 */

import { use, useEffect, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  getBoundsOfCenteredBoxes,
  getMinZoomForBounds,
} from "@hashintel/petrinaut-core";

import { useLatest } from "../../../../../react/hooks/use-latest";
import { CanvasViewportContext } from "../../../../../react/state/canvas-viewport-context";
import { EditorContext } from "../../../../../react/state/editor-context";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import {
  CanvasControllerContext,
  type CanvasRenderer,
} from "../../canvas-renderer";
import { getInitialViewport } from "../../canvas-viewport";
import { ViewportControls } from "../../components/viewport-controls";
import { useRecenterOnPanelOpen } from "../../hooks/use-recenter-on-panel-open";
import { useDebouncedValue } from "../../hooks/util/use-debounced-value";
import { useCanvasInteractions } from "../../use-canvas-interactions";
import { buildArcPolylines } from "./pixi-canvas/arc-polylines";
import {
  createFrameStore,
  FrameBridge,
  useFrameSnapshot,
} from "./pixi-canvas/frame-store";
import { usePixiController } from "./pixi-canvas/pixi-controller";
import { PixiMiniMap } from "./pixi-canvas/pixi-mini-map";
import { PixiPlaceStateTooltip } from "./pixi-canvas/pixi-place-state-tooltip";
import { readPixiTheme } from "./pixi-canvas/pixi-theme";
import { PixiWorld } from "./pixi-canvas/pixi-world";
import { useCanvasGestures } from "./pixi-canvas/use-canvas-gestures";
import { createViewportStore, useViewport } from "./pixi-canvas/viewport-store";

import type { ArcBatch } from "./pixi-canvas/pixi-arcs";
import type { NodeRegistry } from "./pixi-canvas/pixi-nodes";

/** React Flow's default zoom ceiling. */
const maxZoom = 2;
const minZoomDebounceMs = 100;

const hostStyle = css({
  position: "absolute",
  inset: "[0]",
  overflow: "hidden",
  touchAction: "none",
  userSelect: "none",
  "& canvas": {
    display: "block",
  },
});

const fadeBgStyle = css({
  position: "absolute",
  inset: "[0]",
  background: "[rgba(255, 255, 255, 0.3)]",
  pointerEvents: "none",
});

/**
 * The Pixi implementation of the canvas. The renderer owns the viewport in an
 * external store, draws the scene in one WebGL canvas, and keeps the shared
 * DOM overlays (viewport controls, minimap, tooltips) around it.
 */
export const PixiCanvas: CanvasRenderer = ({
  scene,
  containerSize,
  viewportActions,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const { compactNodes, showMinimap, partialSelection, arcRendering } =
    use(UserSettingsContext);
  const { hasCanvasSelection, globalMode } = use(EditorContext);
  const { savedViewport, rememberViewport } = use(CanvasViewportContext);
  const interactions = useCanvasInteractions(scene);

  const [theme] = useState(readPixiTheme);
  const [frames] = useState(createFrameStore);
  const [registry] = useState<NodeRegistry>(() => new Map());
  const batchRef = useRef<ArcBatch | null>(null);

  const bounds = getBoundsOfCenteredBoxes(scene.nodes);
  // The viewport at mount: where this net was last left, or centered on the
  // net. Gestures own it from then on, and every move is remembered.
  const [viewport] = useState(() =>
    createViewportStore(
      savedViewport ?? getInitialViewport(bounds, containerSize),
    ),
  );
  const current = useViewport(viewport);
  const remember = useLatest(rememberViewport);
  useEffect(
    () => viewport.subscribe(() => remember.current(viewport.get())),
    [viewport, remember],
  );

  // The zoom floor keeps the net at a readable fraction of the viewport, but
  // never rises above the current zoom, and settles before it applies, as on
  // the React Flow canvas.
  const boundsMinZoom = getMinZoomForBounds(bounds, containerSize);
  const minZoom = useDebouncedValue(
    Math.min(boundsMinZoom, current.zoom),
    minZoomDebounceMs,
  );
  const zoomLimits = { min: minZoom, max: maxZoom };

  const polylines = buildArcPolylines(scene, arcRendering);
  const { gestures, handlers, cursor } = useCanvasGestures(hostRef, {
    scene,
    polylines,
    interactions,
    viewport,
    zoomLimits,
    partialSelection,
  });

  const controller = usePixiController(
    viewport,
    hostRef,
    containerSize,
    zoomLimits,
  );
  useRecenterOnPanelOpen(controller, containerSize, scene.nodes);

  // The arc mesh publishes its GPU batch here for the animator to write to.
  const publishBatch = (batch: ArcBatch | null) => {
    batchRef.current = batch;
  };

  const { hasFrames } = useFrameSnapshot(frames);
  const hoveredPlaceWithVisualizer = scene.nodes.find(
    (node) =>
      node.kind === "place" &&
      node.hovered &&
      node.hasColorType &&
      node.hasVisualizer,
  );

  return (
    <CanvasControllerContext value={controller}>
      <FrameBridge store={frames} />
      <div ref={hostRef} className={hostStyle} style={{ cursor }} {...handlers}>
        <PixiWorld
          host={hostRef}
          scene={scene}
          polylines={polylines}
          theme={theme}
          viewport={viewport}
          frames={frames}
          gestures={gestures}
          registry={registry}
          batchRef={batchRef}
          onBatchChange={publishBatch}
          compact={compactNodes}
          containerSize={containerSize}
        />
        {hasCanvasSelection && <div className={fadeBgStyle} />}
        {hasFrames && hoveredPlaceWithVisualizer?.kind === "place" && (
          <PixiPlaceStateTooltip
            node={hoveredPlaceWithVisualizer}
            viewport={viewport}
          />
        )}
        {showMinimap && (
          <PixiMiniMap
            scene={scene}
            viewport={viewport}
            containerSize={containerSize}
          />
        )}
        {globalMode !== "actual" && (
          <ViewportControls viewportActions={viewportActions} />
        )}
      </div>
    </CanvasControllerContext>
  );
};
