// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { useCanvasControllerRegistration } from "./use-canvas-controller-registration";

import type { CanvasController } from "../../SDCPN/canvas-renderer";

const controllerWithFrame = (
  frameSceneAfterRender: CanvasController["frameSceneAfterRender"],
): CanvasController =>
  ({
    frameSceneAfterRender,
  }) as CanvasController;

it("keeps registration stable and sends an import frame only to the new renderer", () => {
  const rendered = renderHook(() => useCanvasControllerRegistration());
  const registration = rendered.result.current.registerController;
  const oldFrame = vi.fn(async () => "framed" as const);
  const newFrame = vi.fn(async () => "framed" as const);

  act(() => {
    registration(controllerWithFrame(oldFrame));
    rendered.result.current.requestFrameOnNextRegistration();
  });
  rendered.rerender();
  expect(rendered.result.current.registerController).toBe(registration);
  expect(oldFrame).not.toHaveBeenCalled();

  act(() => {
    registration(null);
    registration(controllerWithFrame(newFrame));
  });

  expect(oldFrame).not.toHaveBeenCalled();
  expect(newFrame).toHaveBeenCalledOnce();
});
