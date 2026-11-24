/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fitCamera, panCamera, zoomCamera } from "./camera";
import { useSceneCamera } from "./use-scene-camera";

const options = {
  origin: "center",
  navigation: "pan-zoom",
  viewBox: { x: -400, y: -300, width: 800, height: 600 },
} as const;
const size = { width: 400, height: 300 };
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;

beforeEach(() => {
  frameId = 0;
  frames.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const advanceFrame = (time: number) => {
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => {
    for (const callback of callbacks) callback(time);
  });
};

describe("scene camera reset", () => {
  it("keeps an untouched top-left origin aligned on resize and preserves a user camera", () => {
    const responsive = { origin: "top-left", navigation: "pan-zoom" } as const;
    const { result, rerender } = renderHook(
      (viewport) => useSceneCamera(responsive, viewport, false),
      { initialProps: size },
    );
    const resized = { width: 600, height: 400 };
    rerender(resized);
    expect(result.current.camera).toEqual(fitCamera(responsive, resized));
    expect(result.current.changed).toBe(false);
    act(() =>
      result.current.navigate((camera) => panCamera(camera, { x: 20, y: 0 })),
    );
    const moved = result.current.camera;
    rerender(size);
    expect(result.current.camera).toEqual(moved);
    expect(result.current.changed).toBe(true);
    act(() => result.current.reset());
    expect(result.current.camera).toEqual(fitCamera(responsive, size));
    expect(result.current.changed).toBe(false);
  });
  it("becomes available only after navigation, not resize or a click without movement", () => {
    const { result, rerender } = renderHook(
      (viewport) => useSceneCamera(options, viewport, true),
      { initialProps: size },
    );
    expect(result.current.changed).toBe(false);
    rerender({ width: 600, height: 400 });
    expect(result.current.changed).toBe(false);
    act(() =>
      result.current.navigate((camera) => panCamera(camera, { x: 0, y: 0 })),
    );
    expect(result.current.changed).toBe(false);
    act(() =>
      result.current.navigate((camera) => panCamera(camera, { x: 20, y: 0 })),
    );
    expect(result.current.changed).toBe(true);
    act(() =>
      result.current.navigate((camera) => panCamera(camera, { x: -20, y: 0 })),
    );
    expect(result.current.changed).toBe(false);
  });

  it("animates to the current window's framing and clears the changed state", () => {
    const { result, rerender } = renderHook(
      (viewport) => useSceneCamera(options, viewport, true),
      { initialProps: size },
    );
    act(() =>
      result.current.navigate((camera) =>
        zoomCamera(
          panCamera(camera, { x: 80, y: 40 }),
          4,
          { x: 200, y: 150 },
          size,
        ),
      ),
    );
    const moved = result.current.camera;
    const resized = { width: 600, height: 400 };
    rerender(resized);
    const target = fitCamera(options, resized);
    act(() => result.current.reset());
    expect(result.current.camera).toEqual(moved);
    advanceFrame(0);
    advanceFrame(90);
    expect(result.current.camera.x).toBeGreaterThan(moved.x);
    expect(result.current.camera.x).toBeLessThan(target.x);
    expect(result.current.camera.zoom).toBeGreaterThan(target.zoom);
    expect(result.current.camera.zoom).toBeLessThan(moved.zoom);
    advanceFrame(180);
    expect(result.current.camera).toEqual(target);
    expect(result.current.changed).toBe(false);
    expect(frames.size).toBe(0);
  });

  it("lets navigation interrupt a reset and cleans up when unmounted", () => {
    const { result, unmount } = renderHook(() =>
      useSceneCamera(options, size, true),
    );
    act(() =>
      result.current.navigate((camera) => panCamera(camera, { x: 80, y: 0 })),
    );
    act(() => result.current.reset());
    advanceFrame(0);
    advanceFrame(70);
    const interrupted = result.current.camera;
    act(() =>
      result.current.navigate((camera) => panCamera(camera, { x: 20, y: 0 })),
    );
    const next = panCamera(interrupted, { x: 20, y: 0 });
    advanceFrame(180);
    expect(result.current.camera).toEqual(next);
    expect(result.current.changed).toBe(true);
    act(() => result.current.reset());
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });

  it.each(["reduced motion", "disabled animations"])(
    "resets immediately for %s",
    (preference) => {
      vi.stubGlobal("matchMedia", () => ({
        matches: preference === "reduced motion",
      }));
      const { result } = renderHook(() =>
        useSceneCamera(options, size, preference !== "disabled animations"),
      );
      act(() =>
        result.current.navigate((camera) => panCamera(camera, { x: 40, y: 0 })),
      );
      act(() => result.current.reset());
      expect(result.current.camera).toEqual(fitCamera(options, size));
      expect(result.current.changed).toBe(false);
      expect(frames.size).toBe(0);
    },
  );
});
