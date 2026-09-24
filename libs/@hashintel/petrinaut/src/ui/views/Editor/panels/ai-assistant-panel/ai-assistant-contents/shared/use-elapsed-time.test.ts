/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { useElapsedTime } from "./use-elapsed-time";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("measures observed work and freezes the completed duration", () => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  const { result, rerender } = renderHook(
    ({ active }) => useElapsedTime(active),
    { initialProps: { active: true } },
  );
  act(() => {
    vi.advanceTimersByTime(2_300);
  });
  rerender({ active: false });
  expect(result.current).toBe(2_300);
  act(() => {
    vi.advanceTimersByTime(5_000);
  });
  expect(result.current).toBe(2_300);
});

test("does not invent a duration for settled history", () => {
  const { result } = renderHook(() => useElapsedTime(false));
  expect(result.current).toBeUndefined();
});
