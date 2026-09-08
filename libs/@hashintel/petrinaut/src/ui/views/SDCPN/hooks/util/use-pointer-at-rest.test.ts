/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePointerAtRest } from "./use-pointer-at-rest";

/** jsdom has no `PointerEvent`, and the listener only reads the position. */
const movePointer = (x: number, y: number) => {
  act(() => {
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: x, clientY: y }),
    );
  });
};

const wait = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("usePointerAtRest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at rest, before the pointer has moved at all", () => {
    const { result } = renderHook(() => usePointerAtRest());

    expect(result.current).toBe(true);
  });

  it("is not at rest while the pointer is moving", () => {
    const { result } = renderHook(() => usePointerAtRest());

    movePointer(100, 100);
    expect(result.current).toBe(false);

    movePointer(140, 100);
    wait(40);
    expect(result.current).toBe(false);
  });

  it("comes to rest once the pointer has held still", () => {
    const { result } = renderHook(() => usePointerAtRest());

    movePointer(100, 100);
    wait(50);

    expect(result.current).toBe(true);
  });

  it("ignores a jitter of a pixel or two", () => {
    const { result } = renderHook(() => usePointerAtRest());

    movePointer(100, 100);
    wait(50);
    expect(result.current).toBe(true);

    movePointer(101, 101);
    movePointer(102, 100);
    expect(result.current).toBe(true);
  });

  it("counts a drift that adds up past the threshold", () => {
    const { result } = renderHook(() => usePointerAtRest());

    movePointer(100, 100);
    wait(50);

    // Each step is under the threshold, but they are measured from the last
    // position that counted, so together they are a move.
    movePointer(101, 100);
    movePointer(102, 100);
    movePointer(103, 100);

    expect(result.current).toBe(false);
  });

  it("restarts the wait when the pointer moves again", () => {
    const { result } = renderHook(() => usePointerAtRest());

    movePointer(100, 100);
    wait(40);
    movePointer(200, 100);
    wait(40);

    expect(result.current).toBe(false);

    wait(10);
    expect(result.current).toBe(true);
  });
});
