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

it("expands details from the FPS counter without restarting collection", () => {
  const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
  renderPlugins([performancePlugin], view);
  expect(
    screen.queryByRole("region", { name: "Performance monitor" }),
  ).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(
    screen.getByRole("button", { name: "Toggle performance monitor" }),
  );
  const monitor = screen.getByRole("region", { name: "Performance monitor" });
  const canvas = monitor.querySelector("canvas");
  expect(screen.queryByRole("table")).toBeNull();
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Expand performance details" }),
  );
  expect(screen.getByRole("cell", { name: "Performance" })).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Collapse performance details" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  fireEvent.click(
    screen.getByRole("button", { name: "Collapse performance details" }),
  );
  expect(screen.queryByRole("table")).toBeNull();
  expect(monitor.querySelector("canvas")).toBe(canvas);
  expect(cancelFrame).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Hide performance monitor" }),
  );
  expect(
    screen.queryByRole("region", { name: "Performance monitor" }),
  ).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it("restores the expanded counter and stops on plugin removal", () => {
  localStorage.setItem(
    "petrinaut:plugin:hash.performance",
    JSON.stringify({ showFps: true, showInformation: true }),
  );
  const { rerender } = renderPlugins([performancePlugin], view);
  expect(
    screen.getByRole("region", { name: "Performance monitor" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Collapse performance details" }),
  ).toBeTruthy();
  rerender([]);
  expect(
    screen.queryByRole("region", { name: "Performance monitor" }),
  ).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps an expanded preference hidden until the FPS counter is shown", () => {
  localStorage.setItem(
    "petrinaut:plugin:hash.performance",
    JSON.stringify({ showFps: false, showInformation: true }),
  );
  renderPlugins([performancePlugin], view);
  expect(
    screen.queryByRole("region", { name: "Performance monitor" }),
  ).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(
    screen.getByRole("button", { name: "Toggle performance monitor" }),
  );
  expect(
    screen.getByRole("button", { name: "Collapse performance details" }),
  ).toBeTruthy();
});
