/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../react/commands/command-registry";
import { fpsCounterPlugin } from "./fps-counter-plugin";
import { PluginRoots, PluginToolbarItems } from "./plugin-outlets";
import { renderPlugins } from "./plugins-test-harness";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
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
  vi.unstubAllGlobals();
});

const view = (
  <>
    <PluginToolbarItems place="top-bar-end" />
    <PluginRoots />
  </>
);

it("samples only while visible and stops when closed", () => {
  renderPlugins([fpsCounterPlugin], view);
  expect(
    screen.queryByRole("region", { name: "Browser FPS counter" }),
  ).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.keyDown(window, { key: "F", metaKey: true, shiftKey: true });
  expect(
    screen.getByRole("region", { name: "Browser FPS counter" }),
  ).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(600);
  });
  expect(screen.queryByText("–")).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Expand performance/ }),
  ).toBeNull();
  expect(vi.getTimerCount()).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Hide FPS counter" }));
  expect(vi.getTimerCount()).toBe(0);
});

it("restores visibility and stops on plugin removal", () => {
  localStorage.setItem(
    "petrinaut:plugin:hash.fps",
    JSON.stringify({ showFps: true }),
  );
  const { rerender } = renderPlugins([fpsCounterPlugin], view);
  expect(
    screen.getByRole("region", { name: "Browser FPS counter" }),
  ).toBeTruthy();
  expect(vi.getTimerCount()).toBe(1);
  rerender([]);
  expect(
    screen.queryByRole("region", { name: "Browser FPS counter" }),
  ).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it("registers the palette command and shortcut without a toolbar button", () => {
  const registry = createCommandRegistry();
  const { rerender } = renderPlugins([fpsCounterPlugin], view, {
    Around: ({ children }) => (
      <CommandRegistryProvider registry={registry}>
        {children}
      </CommandRegistryProvider>
    ),
  });
  expect(
    screen.queryByRole("button", { name: "Toggle browser FPS" }),
  ).toBeNull();
  expect(registry.list()).toMatchObject([
    { id: "hash.fps.toggleFps", shortcut: "mod+shift+f" },
  ]);
  act(() => {
    registry.execute("hash.fps.toggleFps");
  });
  expect(
    screen.getByRole("region", { name: "Browser FPS counter" }),
  ).toBeTruthy();
  rerender([]);
  expect(registry.list()).toEqual([]);
  const event = new KeyboardEvent("keydown", {
    key: "F",
    metaKey: true,
    shiftKey: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});

it.each(["ctrlKey", "metaKey"])(
  "toggles with Shift plus %s and ignores repeats or extra modifiers",
  (modifier) => {
    renderPlugins([fpsCounterPlugin], view);
    for (const extras of [
      { repeat: true },
      { isComposing: true },
      { altKey: true },
      { ctrlKey: true, metaKey: true },
      { shiftKey: false },
    ]) {
      fireEvent.keyDown(window, {
        key: "F",
        [modifier]: true,
        shiftKey: true,
        ...extras,
      });
      expect(
        screen.queryByRole("region", { name: "Browser FPS counter" }),
      ).toBeNull();
    }
    fireEvent.keyDown(window, { key: "F", [modifier]: true, shiftKey: true });
    expect(
      screen.getByRole("region", { name: "Browser FPS counter" }),
    ).toBeTruthy();
    fireEvent.keyDown(window, { key: "F", [modifier]: true, shiftKey: true });
    expect(
      screen.queryByRole("region", { name: "Browser FPS counter" }),
    ).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  },
);
