/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PerformanceMonitor } from "./panels";

import type { PluginPerformanceSnapshot } from "../../plugin";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("draws the demo's 24 by 6 square history, newest on the right", () => {
  const fills: {
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[] = [];
  const context = {
    fillStyle: "",
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: (x: number, y: number, width: number, height: number) => {
      fills.push({ color: context.fillStyle, x, y, width, height });
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  const snapshot: PluginPerformanceSnapshot = {
    collecting: true,
    hidden: false,
    observedMs: 750,
    plugins: [],
    omittedPlugins: 0,
    reactProfiling: "waiting-for-callback",
    observerMs: 0,
    frames: [60, 40, 20].map((fps, index) => ({
      fps,
      time: index * 250,
      durationMs: 250,
      longestFrameMs: 1000 / fps,
    })),
  };
  render(
    <PerformanceMonitor
      performance={{
        snapshot: { get: () => snapshot, subscribe: () => () => {} },
      }}
      expanded={false}
      setExpanded={() => {}}
      onClose={() => {}}
    />,
  );
  expect(fills).toHaveLength(144);
  expect(fills.filter((fill) => fill.color === "#3fb950")).toHaveLength(6);
  expect(fills.filter((fill) => fill.color === "#e3b341")).toHaveLength(4);
  expect(fills.filter((fill) => fill.color === "#f85149")).toEqual([
    { color: "#f85149", x: 184, y: 40, width: 6, height: 6 },
    { color: "#f85149", x: 184, y: 32, width: 6, height: 6 },
  ]);
  expect(screen.getByText("20")).toBeTruthy();
});
