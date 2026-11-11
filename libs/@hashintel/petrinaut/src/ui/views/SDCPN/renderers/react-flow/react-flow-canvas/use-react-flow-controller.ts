import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import {
  ZOOM_PADDING,
  getMinZoomForBounds,
  type Rect,
  type Size,
} from "@hashintel/petrinaut-core";

import { useLatest } from "../../../../../../react/hooks/use-latest";
import { fitViewportToBounds, MAX_FIT_ZOOM } from "../../../canvas-viewport";
import {
  createViewportAnimator,
  type ViewportAnimator,
  type ViewportAnimatorOptions,
} from "../../../viewport-animator";

import type {
  CanvasController,
  FrameSceneResult,
} from "../../../canvas-renderer";
import type { CanvasViewportInsets } from "../../../canvas-viewport";
import type { ArcEdgeType, NodeType } from "./react-flow-types";

const frameRequestTimeoutMs = 1_500;

type FrameState = {
  bounds: Rect | null;
  containerSize: Size;
  insets: CanvasViewportInsets;
};

const fitScene = async (
  { bounds, containerSize, insets }: FrameState,
  camera: ViewportAnimator,
): Promise<FrameSceneResult> => {
  if (!bounds || bounds.width === 0 || bounds.height === 0) {
    return "empty";
  }
  await camera.animateTo(
    fitViewportToBounds(
      bounds,
      containerSize,
      getMinZoomForBounds(bounds, containerSize),
      MAX_FIT_ZOOM,
      ZOOM_PADDING,
      insets,
    ),
  );
  return "framed";
};

/** One camera for the life of the component, stopped when it unmounts. */
const useCamera = (options: ViewportAnimatorOptions): ViewportAnimator => {
  const [camera] = useState(() => createViewportAnimator(options));
  useEffect(() => () => camera.cancel(), [camera]);
  return camera;
};

/**
 * The canvas controller over React Flow's viewport. Every programmatic move
 * goes through one spring camera, so moves that overlap retarget each other
 * instead of fighting, and a user gesture stops it via `camera.cancel`.
 */
export const useReactFlowController = ({
  bounds,
  containerSize,
  insets,
  animated,
}: FrameState & {
  /** Whether programmatic moves ease; off, they jump. */
  animated: boolean;
}): { controller: CanvasController; camera: ViewportAnimator } => {
  const reactFlow = useReactFlow<NodeType, ArcEdgeType>();
  const [frameRequestGeneration, setFrameRequestGeneration] = useState(0);
  const frameStateRef = useLatest({
    bounds,
    containerSize,
    insets,
    reactFlow,
    animated,
  });
  const pendingFrameRequestsRef = useRef<
    {
      resolve: (result: FrameSceneResult) => void;
      timeout: ReturnType<typeof setTimeout>;
    }[]
  >([]);

  const camera = useCamera({
    read: () => frameStateRef.current.reactFlow.getViewport(),
    write: (viewport) => {
      void frameStateRef.current.reactFlow.setViewport(viewport);
    },
    animated: () =>
      frameStateRef.current.animated &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });

  useEffect(() => {
    if (pendingFrameRequestsRef.current.length === 0) {
      return;
    }
    const requests = pendingFrameRequestsRef.current;
    pendingFrameRequestsRef.current = [];
    void fitScene(frameStateRef.current, camera).then((result) => {
      for (const request of requests) {
        clearTimeout(request.timeout);
        request.resolve(result);
      }
    });
  }, [frameRequestGeneration, frameStateRef, camera]);

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
    getRestViewport: () =>
      camera.target() ?? frameStateRef.current.reactFlow.getViewport(),
    setViewport: (viewport, options) => {
      if (options?.animate) {
        void camera.animateTo(viewport);
        return;
      }
      camera.cancel();
      void frameStateRef.current.reactFlow.setViewport(viewport);
    },
    zoomIn: () => {
      camera.cancel();
      void frameStateRef.current.reactFlow.zoomIn();
    },
    zoomOut: () => {
      camera.cancel();
      void frameStateRef.current.reactFlow.zoomOut();
    },
    fitView: () => fitScene(frameStateRef.current, camera),
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

  return { controller, camera };
};
