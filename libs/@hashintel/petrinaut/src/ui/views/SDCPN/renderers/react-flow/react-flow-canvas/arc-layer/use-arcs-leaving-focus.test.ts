/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scene, withArcs } from "../scene.test-helpers";
import { useArcsLeavingFocus } from "./use-arcs-leaving-focus";

import type { CanvasArc } from "../../../../canvas-scene";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The scene's arcs with a focus on some of them. */
const focusOn = (...ids: string[]): CanvasArc[] =>
  withArcs(Object.fromEntries(ids.map((id) => [id, { focus: "incoming" }])))
    .arcs;

const mount = (arcs: CanvasArc[] = scene.arcs, fades = true) =>
  renderHook((input: CanvasArc[]) => [...useArcsLeavingFocus(input, fades)], {
    initialProps: arcs,
  });

describe("the arcs that had a focus role a moment ago", () => {
  it("are none at rest, and none while the roles stay as they are", () => {
    const { result, rerender } = mount();
    expect(result.current).toEqual([]);

    rerender(focusOn("input"));
    expect(result.current).toEqual([]);

    // A scene is rebuilt with every arc a new object: the roles are the same.
    rerender(focusOn("input"));
    expect(result.current).toEqual([]);
  });

  it("are the arcs of a focus that just ended, in the render that ends it", () => {
    const { result, rerender } = mount(focusOn("input", "output"));

    rerender(scene.arcs);
    expect(result.current).toEqual(["input", "output"]);
  });

  it("are the arcs a focus left when it moved straight on", () => {
    const { result, rerender } = mount(focusOn("input"));

    rerender(focusOn("output"));
    expect(result.current).toEqual(["input"]);
  });

  it("are let go once the fade is over", () => {
    const { result, rerender } = mount(focusOn("input"));
    rerender(scene.arcs);

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toEqual(["input"]);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toEqual([]);
  });

  it("are none where the pane does not fade a focus", () => {
    const { result, rerender } = mount(focusOn("input", "output"), false);

    rerender(focusOn("output"));
    expect(result.current).toEqual([]);
    rerender(scene.arcs);
    expect(result.current).toEqual([]);
  });

  it("are kept for as long as the roles keep changing, and one fade more", () => {
    const { result, rerender } = mount(focusOn("input"));

    rerender(focusOn("output"));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(focusOn("port-input"));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // The first fade would be over, but its arc joined the ones still fading.
    expect(result.current).toEqual(["input", "output"]);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toEqual([]);
  });
});
