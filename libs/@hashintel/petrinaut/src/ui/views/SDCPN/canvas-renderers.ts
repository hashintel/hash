import { ReactFlowCanvas } from "./renderers/react-flow/react-flow-canvas";

import type { CanvasRenderer, CanvasRendererName } from "./canvas-renderer";

/** Every renderer the canvas view can mount, by name. */
export const canvasRenderers: Record<CanvasRendererName, CanvasRenderer> = {
  "react-flow": ReactFlowCanvas,
};

export const defaultCanvasRenderer: CanvasRendererName = "react-flow";
