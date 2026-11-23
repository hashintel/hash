/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useBrowserFps } from "./use-browser-fps";

let callback: FrameRequestCallback | undefined;
let now = 0;
let hidden = false;
const cancel = vi.fn();
const frame = (time: number) => {
  now = time;
  act(() => callback?.(time));
};

beforeEach(() => {
  now = 0;
  hidden = false;
  callback = undefined;
  cancel.mockClear();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 1;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", cancel);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("counts callbacks over actual elapsed time, including stalls, and bounds history", () => {
  const { result } = renderHook(useBrowserFps);
  for (let index = 1; index <= 15; index++) frame(index * (250 / 15));
  expect(result.current).toEqual([expect.closeTo(60)]);
  frame(1250);
  expect(result.current).toEqual([expect.closeTo(60), expect.closeTo(1)]);
  for (let index = 1; index <= 30; index++) frame(1250 + index * 250);
  expect(result.current).toHaveLength(24);
  expect(result.current.every((fps) => fps === 4)).toBe(true);
});

it("pauses hidden tabs, resumes with fresh history, and removes its loop and listener", () => {
  const removeListener = vi.spyOn(document, "removeEventListener");
  const request = vi.mocked(requestAnimationFrame);
  const { result, unmount } = renderHook(useBrowserFps);
  frame(250);
  expect(result.current).toEqual([4]);
  hidden = true;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(result.current).toEqual([]);
  expect(cancel).toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(2);
  hidden = false;
  now = 10000;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  frame(10250);
  expect(result.current).toEqual([4]);
  unmount();
  expect(removeListener).toHaveBeenCalledWith(
    "visibilitychange",
    expect.any(Function),
  );
  expect(cancel).toHaveBeenLastCalledWith(1);
  expect(request).toHaveBeenCalledTimes(4);
});

it("waits for a hidden document to become visible before sampling", () => {
  hidden = true;
  renderHook(useBrowserFps);
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  hidden = false;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(requestAnimationFrame).toHaveBeenCalledOnce();
});
