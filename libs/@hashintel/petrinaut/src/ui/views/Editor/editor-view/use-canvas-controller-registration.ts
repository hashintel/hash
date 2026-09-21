import { useCallback, useRef } from "react";

import type {
  CanvasController,
  FrameSceneResult,
} from "../../SDCPN/canvas-renderer";

/**
 * Keeps the editor-facing controller seam stable and lets import framing wait
 * for the renderer that registers after the imported document is mounted.
 */
export const useCanvasControllerRegistration = (): {
  frameSceneAfterRender: () => Promise<FrameSceneResult>;
  registerController: (controller: CanvasController | null) => void;
  requestFrameOnNextRegistration: () => void;
} => {
  const controllerRef = useRef<CanvasController | null>(null);
  const frameOnNextRegistrationRef = useRef(false);

  const registerController = useCallback(
    (controller: CanvasController | null) => {
      controllerRef.current = controller;
      if (controller === null || !frameOnNextRegistrationRef.current) {
        return;
      }
      frameOnNextRegistrationRef.current = false;
      void controller.frameSceneAfterRender();
    },
    [],
  );
  const frameSceneAfterRender = useCallback(
    () =>
      controllerRef.current?.frameSceneAfterRender() ??
      Promise.resolve("no-renderer"),
    [],
  );
  const requestFrameOnNextRegistration = useCallback(() => {
    frameOnNextRegistrationRef.current = true;
  }, []);

  return {
    frameSceneAfterRender,
    registerController,
    requestFrameOnNextRegistration,
  };
};
