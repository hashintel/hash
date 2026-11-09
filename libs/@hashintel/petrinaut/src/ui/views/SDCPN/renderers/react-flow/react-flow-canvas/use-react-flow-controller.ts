import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import {
  ZOOM_PADDING,
  getMinZoomForBounds,
  type Rect,
  type Size,
} from "@hashintel/petrinaut-core";

import { useLatest } from "../../../../../../react/hooks/use-latest";
import {
  createViewportAnimator,
  type ViewportAnimator,
} from "../../../camera/viewport-animator";
import { fitViewportToBounds, MAX_FIT_ZOOM } from "../../../canvas-viewport";

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
  const latestRef = useLatest({
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

  // Created on first use, from inside the closures below, so render never
  // reads the ref the camera reads.
  const [camera] = useState<ViewportAnimator>(() => {
    let animator: ViewportAnimator | null = null;
    const get = () => {
      if (!animator) {
        animator = createViewportAnimator({
          read: () => latestRef.current.reactFlow.getViewport(),
          write: (viewport) => {
            void latestRef.current.reactFlow.setViewport(viewport);
          },
          animated: () =>
            latestRef.current.animated &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
      }
      return animator;
    };
    return {
      animateTo: (target) => get().animateTo(target),
      cancel: () => animator?.cancel(),
      isAnimating: () => animator?.isAnimating() ?? false,
    };
  });

  useEffect(() => () => camera.cancel(), [camera]);

  useEffect(() => {
    if (pendingFrameRequestsRef.current.length === 0) {
      return;
    }
    const requests = pendingFrameRequestsRef.current;
    pendingFrameRequestsRef.current = [];
    void fitScene(latestRef.current, camera).then((result) => {
      for (const request of requests) {
        clearTimeout(request.timeout);
        request.resolve(result);
      }
    });
  }, [frameRequestGeneration, latestRef, camera]);

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
    getViewport: () => latestRef.current.reactFlow.getViewport(),
    setViewport: (viewport, options) => {
      if (options?.animate) {
        void camera.animateTo(viewport);
        return;
      }
      camera.cancel();
      void latestRef.current.reactFlow.setViewport(viewport);
    },
    zoomIn: () => {
      camera.cancel();
      void latestRef.current.reactFlow.zoomIn();
    },
    zoomOut: () => {
      camera.cancel();
      void latestRef.current.reactFlow.zoomOut();
    },
    fitView: () => fitScene(latestRef.current, camera),
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
      latestRef.current.reactFlow.screenToFlowPosition(point),
    sceneToScreen: (point) =>
      latestRef.current.reactFlow.flowToScreenPosition(point),
  }));

  return { controller, camera };
};
