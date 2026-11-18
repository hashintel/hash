// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useReactFlowController } from "./use-react-flow-controller";

import type { CanvasViewport } from "../../../../../../react/state/canvas-viewport-context";

const setViewport = vi.fn<
  (
    viewport: CanvasViewport,
    options?: { duration?: number },
  ) => Promise<boolean>
>(async () => true);

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    fitView: vi.fn(),
    flowToScreenPosition: vi.fn(),
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    screenToFlowPosition: vi.fn(),
    setViewport,
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
  }),
}));

const defaultProps = {
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  containerSize: { width: 1000, height: 600 },
  insets: { left: 100, right: 300, bottom: 100 },
  animated: false,
};

/** An animating camera whose frames never come, as in a hidden tab. */
const stallFrames = () => {
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
};

describe("useReactFlowController", () => {
  beforeEach(() => {
    setViewport.mockClear();
    setViewport.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("frames once from the post-render bounds and settles the request", async () => {
    const rendered = renderHook(
      ({ bounds }) =>
        useReactFlowController({
          ...defaultProps,
          bounds,
        }),
      { initialProps: { bounds: defaultProps.bounds } },
    );

    let resultPromise: Promise<unknown> | undefined;
    await act(async () => {
      resultPromise =
        rendered.result.current.controller.frameSceneAfterRender();
      rendered.rerender({
        bounds: { x: 400, y: 200, width: 200, height: 100 },
      });
    });

    await expect(resultPromise).resolves.toBe("framed");
    expect(setViewport).toHaveBeenCalledOnce();
    const viewport = setViewport.mock.calls[0]?.[0];
    expect(typeof viewport?.x).toBe("number");
    expect(typeof viewport?.y).toBe("number");
  });

  it("keeps one controller identity while calling the latest implementation", async () => {
    const rendered = renderHook(
      ({ bounds }) =>
        useReactFlowController({
          ...defaultProps,
          bounds,
        }),
      { initialProps: { bounds: defaultProps.bounds } },
    );
    const registeredController = rendered.result.current.controller;

    rendered.rerender({
      bounds: { x: 700, y: 300, width: 250, height: 150 },
    });

    expect(rendered.result.current.controller).toBe(registeredController);
    await act(async () => {
      await registeredController.fitView();
    });
    expect(setViewport).toHaveBeenCalledOnce();
    expect(setViewport.mock.calls[0]?.[0].x).toBeLessThan(0);
  });

  it("reports an empty scene without moving the viewport", async () => {
    const { result } = renderHook(() =>
      useReactFlowController({
        ...defaultProps,
        bounds: null,
      }),
    );
    await expect(result.current.controller.fitView()).resolves.toBe("empty");
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("bounds a move whose frames never come", async () => {
    vi.useFakeTimers();
    stallFrames();
    const { result } = renderHook(() =>
      useReactFlowController({ ...defaultProps, animated: true }),
    );

    const frame = result.current.controller.frameSceneAfterRender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    await expect(frame).resolves.toBe("timed-out");
  });

  it("reports where a move under way will come to rest", () => {
    stallFrames();
    const { result } = renderHook(() =>
      useReactFlowController({ ...defaultProps, animated: true }),
    );
    const { controller } = result.current;
    const target = { x: 120, y: -40, zoom: 2 };

    expect(controller.getRestViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    controller.setViewport(target, { animate: true });
    expect(controller.getRestViewport()).toEqual(target);
    expect(setViewport).not.toHaveBeenCalled();
  });
});
