/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { performancePlugin } from "./performance-plugin";
import { PluginRoots, PluginToolbarItems } from "./plugin-outlets";
import { renderPlugins } from "./plugins-test-harness";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({
    toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const view = (
  <>
    <PluginToolbarItems place="top-bar-end" />
    <PluginRoots />
  </>
);

it("collects only while a panel is visible and keeps the two toggles independent", () => {
  renderPlugins([performancePlugin], view);
  expect(screen.queryByRole("region", { name: "Browser FPS" })).toBeNull();
  expect(
    screen.queryByRole("region", { name: "Performance information" }),
  ).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(
    screen.getByRole("button", { name: "Toggle performance information" }),
  );
  expect(
    screen.getByRole("region", { name: "Performance information" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "FPS counter" }));
  act(() => {
    vi.advanceTimersByTime(600);
  });
  expect(screen.getByRole("region", { name: "Browser FPS" })).toBeTruthy();
  expect(screen.getByRole("cell", { name: "Performance" })).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Hide performance information" }),
  );
  expect(screen.getByRole("region", { name: "Browser FPS" })).toBeTruthy();
  expect(vi.getTimerCount()).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Hide FPS counter" }));
  expect(vi.getTimerCount()).toBe(0);
});

it("restores saved panel choices and stops on plugin removal", () => {
  localStorage.setItem(
    "petrinaut:plugin:hash.performance",
    JSON.stringify({ showFps: true, showInformation: true }),
  );
  const { rerender } = renderPlugins([performancePlugin], view);
  expect(screen.getByRole("region", { name: "Browser FPS" })).toBeTruthy();
  expect(
    screen.getByRole("region", { name: "Performance information" }),
  ).toBeTruthy();
  rerender([]);
  expect(screen.queryByRole("region", { name: "Browser FPS" })).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
