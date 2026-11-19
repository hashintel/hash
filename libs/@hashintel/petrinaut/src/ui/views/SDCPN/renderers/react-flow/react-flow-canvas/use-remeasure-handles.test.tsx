/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useRemeasureHandles } from "./use-remeasure-handles";

const updateNodeInternals = vi.fn();
vi.mock("@xyflow/react", () => ({
  useUpdateNodeInternals: () => updateNodeInternals,
}));

beforeEach(() => {
  vi.useFakeTimers();
  updateNodeInternals.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("measures when the layout key changes, and once for every call within a frame", () => {
  const { result, rerender, unmount } = renderHook(
    ({ layoutKey }) => useRemeasureHandles("card", layoutKey),
    { initialProps: { layoutKey: "a:in b:in" } },
  );
  expect(updateNodeInternals).toHaveBeenCalledTimes(1);

  // The same ports: nothing to measure.
  rerender({ layoutKey: "a:in b:in" });
  expect(updateNodeInternals).toHaveBeenCalledTimes(1);
  // A port changes side.
  rerender({ layoutKey: "a:in b:out" });
  expect(updateNodeInternals).toHaveBeenCalledTimes(2);

  // Three pins finish sliding in one frame.
  result.current();
  result.current();
  result.current();
  expect(updateNodeInternals).toHaveBeenCalledTimes(2);
  vi.advanceTimersToNextFrame();
  expect(updateNodeInternals).toHaveBeenCalledTimes(3);
  expect(updateNodeInternals).toHaveBeenLastCalledWith("card");

  // A measurement still pending when the card goes is dropped.
  result.current();
  unmount();
  vi.advanceTimersToNextFrame();
  expect(updateNodeInternals).toHaveBeenCalledTimes(3);
});
