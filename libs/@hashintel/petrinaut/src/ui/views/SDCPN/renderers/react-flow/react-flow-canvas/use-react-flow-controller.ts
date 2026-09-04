import { useReactFlow } from "@xyflow/react";

import type { CanvasController } from "../../../canvas-renderer";
import type { ArcEdgeType, NodeType } from "./react-flow-types";

const viewportAnimationMs = 200;

/** The canvas controller over React Flow's own viewport API. */
export const useReactFlowController = (): CanvasController => {
  const reactFlow = useReactFlow<NodeType, ArcEdgeType>();
  return {
    getViewport: () => reactFlow.getViewport(),
    setViewport: (viewport, options) => {
      void reactFlow.setViewport(
        viewport,
        options?.animate ? { duration: viewportAnimationMs } : undefined,
      );
    },
    zoomIn: () => {
      void reactFlow.zoomIn();
    },
    zoomOut: () => {
      void reactFlow.zoomOut();
    },
    screenToScene: (point) => reactFlow.screenToFlowPosition(point),
    sceneToScreen: (point) => reactFlow.flowToScreenPosition(point),
  };
};
