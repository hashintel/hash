import type {
  CanvasController,
  FrameSceneResult,
} from "../../views/SDCPN/canvas-renderer";

export interface CanvasRegistration {
  frameSceneAfterRender: () => Promise<FrameSceneResult>;
  registerController: (controller: CanvasController | null) => void;
  requestFrameOnNextRegistration: () => void;
}

/**
 * Where the canvas registers its controller. It outlives each renderer, so
 * import framing can wait for the renderer that registers after the imported
 * document is mounted.
 */
export const createCanvasRegistration = (): CanvasRegistration => {
  let registered: CanvasController | null = null;
  let frameOnNextRegistration = false;

  return {
    frameSceneAfterRender: () =>
      registered?.frameSceneAfterRender() ?? Promise.resolve("no-renderer"),
    registerController: (controller) => {
      registered = controller;
      if (controller === null || !frameOnNextRegistration) {
        return;
      }
      frameOnNextRegistration = false;
      void controller.frameSceneAfterRender();
    },
    requestFrameOnNextRegistration: () => {
      frameOnNextRegistration = true;
    },
  };
};
