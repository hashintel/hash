/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePointerAtRest } from "./use-pointer-at-rest";

let canvas: HTMLDivElement;

/** jsdom has no `PointerEvent`, and the listener only reads the position. */
const movePointer = (x: number, y: number) => {
  act(() => {
    canvas.dispatchEvent(
      new MouseEvent("pointermove", { clientX: x, clientY: y }),
    );
  });
};

const renderAtRest = () => {
  // Held across renders, as the component's own `useRef` would be: a new ref
  // object each render would re-run the effect and lose the pending wait.
  const ref = { current: canvas };
  return renderHook(() => usePointerAtRest(ref));
};

const wait = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("usePointerAtRest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    canvas = document.createElement("div");
    document.body.append(canvas);
  });

  afterEach(() => {
    vi.useRealTimers();
    canvas.remove();
  });

  it("starts at rest, before the pointer has moved at all", () => {
    const { result } = renderAtRest();

    expect(result.current).toBe(true);
  });

  it("is not at rest while the pointer is moving", () => {
    const { result } = renderAtRest();

    movePointer(100, 100);
    expect(result.current).toBe(false);

    movePointer(140, 100);
    wait(40);
    expect(result.current).toBe(false);
  });

  it("comes to rest once the pointer has held still", () => {
    const { result } = renderAtRest();

    movePointer(100, 100);
    wait(50);

    expect(result.current).toBe(true);
  });

  it("ignores a jitter of a pixel or two", () => {
    const { result } = renderAtRest();

    movePointer(100, 100);
    wait(50);
    expect(result.current).toBe(true);

    movePointer(101, 101);
    movePointer(102, 100);
    expect(result.current).toBe(true);
  });

  it("counts a drift that adds up past the threshold", () => {
    const { result } = renderAtRest();

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
    const { result } = renderAtRest();

    movePointer(100, 100);
    wait(40);
    movePointer(200, 100);
    wait(40);

    expect(result.current).toBe(false);

    wait(10);
    expect(result.current).toBe(true);
  });
  it("ignores movement outside its element", () => {
    const { result } = renderAtRest();

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 500, clientY: 500 }),
      );
    });

    expect(result.current).toBe(true);
  });
});
