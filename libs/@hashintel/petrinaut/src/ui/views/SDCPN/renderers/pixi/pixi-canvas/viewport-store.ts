/**
 * The Pixi renderer's viewport as an external store: gestures write to it
 * many times a second, and only the world container and the overlays that
 * subscribe re-render.
 */

import { useSyncExternalStore } from "react";

import type { CanvasViewport } from "../../../canvas-renderer";
import type { CanvasPoint } from "../../../canvas-scene";

export type ViewportStore = {
  get: () => CanvasViewport;
  set: (viewport: CanvasViewport) => void;
  subscribe: (listener: () => void) => () => void;
};

export const createViewportStore = (initial: CanvasViewport): ViewportStore => {
  let viewport = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => viewport,
    set: (next) => {
      if (
        next.x === viewport.x &&
        next.y === viewport.y &&
        next.zoom === viewport.zoom
      ) {
        return;
      }
      viewport = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const useViewport = (store: ViewportStore): CanvasViewport =>
  useSyncExternalStore(store.subscribe, store.get, store.get);

export const sceneToScreen = (
  viewport: CanvasViewport,
  point: CanvasPoint,
): CanvasPoint => ({
  x: point.x * viewport.zoom + viewport.x,
  y: point.y * viewport.zoom + viewport.y,
});

export const screenToScene = (
  viewport: CanvasViewport,
  point: CanvasPoint,
): CanvasPoint => ({
  x: (point.x - viewport.x) / viewport.zoom,
  y: (point.y - viewport.y) / viewport.zoom,
});

export type ZoomLimits = { min: number; max: number };

/** Zooms by `factor` keeping the scene point under `anchor` fixed on screen. */
export const zoomAt = (
  viewport: CanvasViewport,
  anchor: CanvasPoint,
  factor: number,
  limits: ZoomLimits,
): CanvasViewport => {
  const zoom = Math.min(
    limits.max,
    Math.max(limits.min, viewport.zoom * factor),
  );
  const ratio = zoom / viewport.zoom;
  return {
    zoom,
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
  };
};

export const panBy = (
  viewport: CanvasViewport,
  delta: CanvasPoint,
): CanvasViewport => ({
  ...viewport,
  x: viewport.x + delta.x,
  y: viewport.y + delta.y,
});

/** React Flow's wheel step: one notch of a mouse wheel multiplies the zoom by about 1.2. */
export const wheelZoomFactor = (event: {
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}): number => {
  const scale = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002;
  return 2 ** (-event.deltaY * scale * (event.ctrlKey ? 10 : 1));
};

/** React Flow's zoom-in and zoom-out buttons scale by this factor. */
export const buttonZoomFactor = 1.2;
