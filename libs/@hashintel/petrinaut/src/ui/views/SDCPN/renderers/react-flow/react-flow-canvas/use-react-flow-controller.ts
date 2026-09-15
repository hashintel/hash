import { useReactFlow, type ReactFlowInstance } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import {
  ZOOM_PADDING,
  getMinZoomForBounds,
  type Rect,
  type Size,
} from "@hashintel/petrinaut-core";

import { useLatest } from "../../../../../../react/hooks/use-latest";
import { fitViewportToBounds, MAX_FIT_ZOOM } from "../../../canvas-viewport";

import type {
  CanvasController,
  FrameSceneResult,
} from "../../../canvas-renderer";
import type { CanvasViewportInsets } from "../../../canvas-viewport";
import type { ArcEdgeType, NodeType } from "./react-flow-types";

const viewportAnimationMs = 200;
const frameRequestTimeoutMs = 1_500;

const fitScene = async ({
  bounds,
  containerSize,
  insets,
  reactFlow,
}: {
  bounds: Rect | null;
  containerSize: Size;
  insets: CanvasViewportInsets;
  reactFlow: ReactFlowInstance<NodeType, ArcEdgeType>;
}): Promise<FrameSceneResult> => {
  if (!bounds || bounds.width === 0 || bounds.height === 0) {
    return "empty";
  }
  const viewport = fitViewportToBounds(
    bounds,
    containerSize,
    getMinZoomForBounds(bounds, containerSize),
    MAX_FIT_ZOOM,
    ZOOM_PADDING,
    insets,
  );
  await reactFlow.setViewport(viewport, { duration: 250 });
  return "framed";
};

/** The canvas controller over React Flow's own viewport API. */
export const useReactFlowController = ({
  bounds,
  containerSize,
  insets,
}: {
  bounds: Rect | null;
  containerSize: Size;
  insets: CanvasViewportInsets;
}): CanvasController => {
  const reactFlow = useReactFlow<NodeType, ArcEdgeType>();
  const [frameRequestGeneration, setFrameRequestGeneration] = useState(0);
  const frameStateRef = useLatest({
    bounds,
    containerSize,
    insets,
    reactFlow,
  });
  const pendingFrameRequestsRef = useRef<
    {
      resolve: (result: FrameSceneResult) => void;
      timeout: ReturnType<typeof setTimeout>;
    }[]
  >([]);

  useEffect(() => {
    if (pendingFrameRequestsRef.current.length === 0) {
      return;
    }
    const requests = pendingFrameRequestsRef.current;
    pendingFrameRequestsRef.current = [];
    void fitScene(frameStateRef.current).then((result) => {
      for (const request of requests) {
        clearTimeout(request.timeout);
        request.resolve(result);
      }
    });
  }, [frameRequestGeneration, frameStateRef]);

  useEffect(
    () => () => {
      for (const request of pendingFrameRequestsRef.current) {
        clearTimeout(request.timeout);
        request.resolve("no-renderer");
      }
      pendingFrameRequestsRef.current = [];
    },
    [],
  );

  const [controller] = useState<CanvasController>(() => ({
    getViewport: () => frameStateRef.current.reactFlow.getViewport(),
    setViewport: (viewport, options) => {
      void frameStateRef.current.reactFlow.setViewport(
        viewport,
        options?.animate ? { duration: viewportAnimationMs } : undefined,
      );
    },
    zoomIn: () => {
      void frameStateRef.current.reactFlow.zoomIn();
    },
    zoomOut: () => {
      void frameStateRef.current.reactFlow.zoomOut();
    },
    fitView: () => fitScene(frameStateRef.current),
    frameSceneAfterRender: () =>
      new Promise<FrameSceneResult>((resolve) => {
        const request = {
          resolve,
          timeout: setTimeout(() => {
            pendingFrameRequestsRef.current =
              pendingFrameRequestsRef.current.filter(
                (candidate) => candidate !== request,
              );
            resolve("timed-out");
          }, frameRequestTimeoutMs),
        };
        pendingFrameRequestsRef.current.push(request);
        setFrameRequestGeneration((generation) => generation + 1);
      }),
    screenToScene: (point) =>
      frameStateRef.current.reactFlow.screenToFlowPosition(point),
    sceneToScreen: (point) =>
      frameStateRef.current.reactFlow.flowToScreenPosition(point),
  }));

  return controller;
};
