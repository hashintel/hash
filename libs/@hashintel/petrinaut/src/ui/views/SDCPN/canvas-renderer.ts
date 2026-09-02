/**
 * The contract between the canvas view and a renderer. A renderer draws a
 * {@link CanvasScene}, owns the viewport, and publishes a
 * {@link CanvasController} for the shared overlays and hooks around it.
 * Interaction semantics live in the shared `useCanvasInteractions`, so a
 * renderer only turns its own hit testing and gestures into those calls.
 */

import { createContext, use } from "react";

import type { ViewportAction } from "../../types/viewport-action";
import type { CanvasPoint, CanvasScene } from "./canvas-scene";
import type { Size } from "@hashintel/petrinaut-core";

/** Screen = scene × zoom + (x, y), in canvas pixels. */
export type CanvasViewport = { x: number; y: number; zoom: number };

export type CanvasController = {
  getViewport: () => CanvasViewport;
  /** `animate` eases the move when the renderer supports it. */
  setViewport: (
    viewport: CanvasViewport,
    options?: { animate?: boolean },
  ) => void;
  zoomIn: () => void;
  zoomOut: () => void;
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
  /** Extra buttons hosts add to the viewport controls. */
  viewportActions?: ViewportAction[];
};

export type CanvasRenderer = React.FC<CanvasRendererProps>;

export const canvasRendererNames = ["react-flow"] as const;

export type CanvasRendererName = (typeof canvasRendererNames)[number];
