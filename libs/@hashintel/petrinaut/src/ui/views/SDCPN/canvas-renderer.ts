/**
 * The contract between the canvas view and a renderer. A renderer draws a
 * {@link CanvasScene}, owns the viewport, and publishes a
 * {@link CanvasController} for the shared overlays and hooks around it.
 * Interaction semantics live in the shared `useCanvasInteractions`, so a
 * renderer only turns its own hit testing and gestures into those calls.
 */

import { createContext, use } from "react";

import type { CanvasViewport } from "../../../react/state/canvas-viewport-context";
import type { CanvasPoint, CanvasScene } from "./canvas-scene";
import type { Size } from "@hashintel/petrinaut-core";

/** The viewport type is owned by the React layer, where it is persisted. */
export type { CanvasViewport };

export type FrameSceneResult = "framed" | "empty" | "no-renderer" | "timed-out";

export type CanvasController = {
  getViewport: () => CanvasViewport;
  /** `animate` eases the move when the renderer supports it. */
  setViewport: (
    viewport: CanvasViewport,
    options?: { animate?: boolean },
  ) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Frames the whole scene, easing the move when the renderer supports it. */
  fitView: () => Promise<FrameSceneResult>;
  /**
   * Frames once after the renderer has committed its next scene. The promise
   * is bounded so callers never wait indefinitely for an unmounted renderer.
   */
  frameSceneAfterRender: () => Promise<FrameSceneResult>;
  /** Client (viewport-relative screen) coordinates to scene coordinates. */
  screenToScene: (point: CanvasPoint) => CanvasPoint;
  sceneToScreen: (point: CanvasPoint) => CanvasPoint;
};

export const CanvasControllerContext = createContext<CanvasController | null>(
  null,
);

/** The controller of the renderer this component is rendered inside. */
export const useCanvasController = (): CanvasController => {
  const controller = use(CanvasControllerContext);
  if (!controller) {
    throw new Error(
      "useCanvasController must be used inside a canvas renderer",
    );
  }
  return controller;
};

export type CanvasRendererProps = {
  scene: CanvasScene;
  /** Settled size of the canvas container. */
  containerSize: Size;
  /** Publishes this renderer's controller to the editor-level command seam. */
  registerController: (controller: CanvasController | null) => void;
};

export type CanvasRenderer = React.FC<CanvasRendererProps>;

export const canvasRendererNames = ["react-flow"] as const;

export type CanvasRendererName = (typeof canvasRendererNames)[number];
