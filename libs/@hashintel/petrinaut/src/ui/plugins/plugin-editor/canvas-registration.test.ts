import { expect, it, vi } from "vitest";

import { createCanvasRegistration } from "./canvas-registration";

import type { CanvasController } from "../../views/SDCPN/canvas-renderer";

const controllerWithFrame = (
  frameSceneAfterRender: CanvasController["frameSceneAfterRender"],
): CanvasController =>
  ({
    frameSceneAfterRender,
  }) as CanvasController;

it("sends an import frame only to the renderer that registers next", () => {
  const registration = createCanvasRegistration();
  const oldFrame = vi.fn(async () => "framed" as const);
  const newFrame = vi.fn(async () => "framed" as const);

  registration.registerController(controllerWithFrame(oldFrame));
  registration.requestFrameOnNextRegistration();
  expect(oldFrame).not.toHaveBeenCalled();

  registration.registerController(null);
  registration.registerController(controllerWithFrame(newFrame));

  expect(oldFrame).not.toHaveBeenCalled();
  expect(newFrame).toHaveBeenCalledOnce();
});
