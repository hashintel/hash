import { PixiCanvas } from "./renderers/pixi/pixi-canvas";
import { ReactFlowCanvas } from "./renderers/react-flow/react-flow-canvas";

import type { CanvasRenderer, CanvasRendererName } from "./canvas-renderer";

/** Every renderer the canvas view can mount, by the name the user setting stores. */
export const canvasRenderers: Record<CanvasRendererName, CanvasRenderer> = {
  "react-flow": ReactFlowCanvas,
  pixi: PixiCanvas,
};
