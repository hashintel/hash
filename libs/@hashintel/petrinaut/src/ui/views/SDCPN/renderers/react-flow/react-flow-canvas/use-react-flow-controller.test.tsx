// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
};

describe("useReactFlowController", () => {
  beforeEach(() => {
    setViewport.mockClear();
    setViewport.mockResolvedValue(true);
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
      resultPromise = rendered.result.current.frameSceneAfterRender();
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
    const registeredController = rendered.result.current;

    rendered.rerender({
      bounds: { x: 700, y: 300, width: 250, height: 150 },
    });

    expect(rendered.result.current).toBe(registeredController);
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
    await expect(result.current.fitView()).resolves.toBe("empty");
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("bounds an unresolved renderer move", async () => {
    vi.useFakeTimers();
    setViewport.mockReturnValue(new Promise<boolean>(() => {}));
    const { result } = renderHook(() => useReactFlowController(defaultProps));

    const frame = result.current.frameSceneAfterRender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    await expect(frame).resolves.toBe("timed-out");
    vi.useRealTimers();
  });
});
