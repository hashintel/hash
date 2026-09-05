/**
 * The Pixi scene graph: a dot grid in screen space and, inside one render
 * group that pan and zoom move as a unit, the arcs, the nodes and the gesture
 * overlays.
 */

import { Application, extend } from "@pixi/react";
import {
  BitmapText,
  Container,
  Graphics,
  Texture,
  TilingSprite,
} from "pixi.js";
import { Suspense, use, type FC } from "react";

import { SNAP_GRID_SIZE } from "../../../../../constants/ui";
import { PixiAnimator } from "./pixi-animator";
import {
  PixiArcDecorations,
  PixiArcMesh,
  PixiConnectionLine,
  type ArcBatch,
} from "./pixi-arcs";
import { ensurePixiFonts } from "./pixi-fonts";
import {
  NodeRegistryContext,
  PixiNode,
  PixiThemeContext,
  type NodeRegistry,
} from "./pixi-nodes";
import { gridDotColor, selectionOutline, type PixiTheme } from "./pixi-theme";
import {
  selectionBoxOf,
  useGesture,
  type GestureStore,
} from "./use-canvas-gestures";
import { useViewport, type ViewportStore } from "./viewport-store";

import type { CanvasScene } from "../../../canvas-scene";
import type { ArcPolylines } from "./arc-polylines";
import type { FrameStore } from "./frame-store";
import type { Size } from "@hashintel/petrinaut-core";

extend({ Container, Graphics, BitmapText, TilingSprite });

const gridDotRadius = 1;

let gridTexture: Texture | null = null;

/** One grid cell with a dot in its corner, drawn once to a canvas. */
const getGridTexture = (): Texture => {
  if (gridTexture) return gridTexture;
  const resolution = 2;
  const canvas = document.createElement("canvas");
  canvas.width = SNAP_GRID_SIZE * resolution;
  canvas.height = SNAP_GRID_SIZE * resolution;
  const context = canvas.getContext("2d")!;
  context.fillStyle = `#${gridDotColor.toString(16).padStart(6, "0")}`;
  context.beginPath();
  context.arc(
    gridDotRadius * resolution,
    gridDotRadius * resolution,
    gridDotRadius * resolution,
    0,
    Math.PI * 2,
  );
  context.fill();
  gridTexture = Texture.from({ resource: canvas, resolution });
  return gridTexture;
};

/** Dots every grid step, scaled and offset with the viewport like React Flow's background. */
const Grid: FC<{ viewport: ViewportStore; size: Size }> = ({
  viewport,
  size,
}) => {
  const current = useViewport(viewport);
  const step = SNAP_GRID_SIZE * current.zoom;
  return (
    <pixiTilingSprite
      texture={getGridTexture()}
      width={size.width}
      height={size.height}
      tileScale={{ x: current.zoom, y: current.zoom }}
      tilePosition={{
        x: ((current.x % step) + step) % step,
        y: ((current.y % step) + step) % step,
      }}
      eventMode="none"
    />
  );
};

/** Only this component re-renders on pan and zoom; its children keep their identity. */
const World: FC<{ viewport: ViewportStore; children: React.ReactNode }> = ({
  viewport,
  children,
}) => {
  const current = useViewport(viewport);
  return (
    <pixiContainer
      isRenderGroup
      eventMode="none"
      interactiveChildren={false}
      x={current.x}
      y={current.y}
      scale={current.zoom}
    >
      {children}
    </pixiContainer>
  );
};

/** The selection box and the connection being dragged, in scene coordinates. */
const GestureOverlay: FC<{ gestures: GestureStore; theme: PixiTheme }> = ({
  gestures,
  theme,
}) => {
  const gesture = useGesture(gestures);
  const box = selectionBoxOf(gesture);
  if (box) {
    return (
      <pixiGraphics
        draw={(graphics) =>
          graphics
            .clear()
            .rect(box.x, box.y, box.width, box.height)
            .fill({ color: selectionOutline.color, alpha: 0.08 })
            .stroke({ color: selectionOutline.color, alpha: 0.8, width: 1 })
        }
        eventMode="none"
      />
    );
  }
  if (gesture.type === "connect") {
    return (
      <PixiConnectionLine
        from={gesture.from.position}
        to={gesture.target?.position ?? gesture.current}
        valid={gesture.target !== null}
        theme={theme}
      />
    );
  }
  return null;
};

/** Waits for the bitmap fonts so the first labels already use the editor font. */
const FontsReady: FC<{ children: React.ReactNode }> = ({ children }) => {
  use(ensurePixiFonts());
  return children;
};

export type PixiWorldProps = {
  host: React.RefObject<HTMLDivElement | null>;
  scene: CanvasScene;
  polylines: ArcPolylines;
  theme: PixiTheme;
  viewport: ViewportStore;
  frames: FrameStore;
  gestures: GestureStore;
  registry: NodeRegistry;
  /** The arc mesh's GPU batch, read by the animator. */
  batchRef: React.RefObject<ArcBatch | null>;
  /** Called when the arc mesh creates or destroys its batch. */
  onBatchChange: (batch: ArcBatch | null) => void;
  compact: boolean;
  containerSize: Size;
};

export const PixiWorld: FC<PixiWorldProps> = ({
  host,
  scene,
  polylines,
  theme,
  viewport,
  frames,
  gestures,
  registry,
  batchRef,
  onBatchChange,
  compact,
  containerSize,
}) => (
  <Application
    resizeTo={host}
    backgroundAlpha={0}
    antialias
    autoDensity
    resolution={Math.min(window.devicePixelRatio, 2)}
    preference="webgl"
  >
    <Suspense fallback={null}>
      <FontsReady>
        <PixiThemeContext value={theme}>
          <NodeRegistryContext value={registry}>
            <Grid viewport={viewport} size={containerSize} />
            <World viewport={viewport}>
              <PixiArcDecorations
                scene={scene}
                polylines={polylines}
                theme={theme}
                layer="below"
              />
              <PixiArcMesh
                scene={scene}
                polylines={polylines}
                theme={theme}
                onBatchChange={onBatchChange}
              />
              <PixiArcDecorations
                scene={scene}
                polylines={polylines}
                theme={theme}
                layer="above"
              />
              {scene.nodes.map((node) => (
                <PixiNode key={node.id} node={node} compact={compact} />
              ))}
              <GestureOverlay gestures={gestures} theme={theme} />
            </World>
            <PixiAnimator scene={scene} frames={frames} batchRef={batchRef} />
          </NodeRegistryContext>
        </PixiThemeContext>
      </FontsReady>
    </Suspense>
  </Application>
);
