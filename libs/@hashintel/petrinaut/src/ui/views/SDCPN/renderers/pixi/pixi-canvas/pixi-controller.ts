import {
  buttonZoomFactor,
  sceneToScreen,
  screenToScene,
  zoomAt,
  type ViewportStore,
  type ZoomLimits,
} from "./viewport-store";

import type { CanvasController } from "../../../canvas-renderer";
import type { Size } from "@hashintel/petrinaut-core";

/**
 * The canvas controller over the viewport store. Screen coordinates in the
 * contract are client coordinates, so the host element's position is
 * subtracted on the way in and added on the way out; the host is read when a
 * method runs, never during render.
 */
export const usePixiController = (
  store: ViewportStore,
  host: React.RefObject<HTMLElement | null>,
  containerSize: Size,
  zoomLimits: ZoomLimits,
): CanvasController => {
  const hostOrigin = () => {
    const rect = host.current?.getBoundingClientRect();
    return { x: rect?.left ?? 0, y: rect?.top ?? 0 };
  };
  const zoomAroundCenter = (factor: number) => {
    store.set(
      zoomAt(
        store.get(),
        { x: containerSize.width / 2, y: containerSize.height / 2 },
        factor,
        zoomLimits,
      ),
    );
  };
  return {
    getViewport: store.get,
    setViewport: (viewport) => store.set(viewport),
    zoomIn: () => zoomAroundCenter(buttonZoomFactor),
    zoomOut: () => zoomAroundCenter(1 / buttonZoomFactor),
    screenToScene: (point) => {
      const origin = hostOrigin();
      return screenToScene(store.get(), {
        x: point.x - origin.x,
        y: point.y - origin.y,
      });
    },
    sceneToScreen: (point) => {
      const origin = hostOrigin();
      const screen = sceneToScreen(store.get(), point);
      return { x: screen.x + origin.x, y: screen.y + origin.y };
    },
  };
};
