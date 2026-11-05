/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { VisualizerSvg } from "../lib/render-visualizer-hir/visualizer-svg";
import { useVisualizerBackground, VisualizerFrame } from "./visualizer-frame";

import type { SVGProps } from "react";

beforeEach(() =>
  vi.stubGlobal("CSS", {
    supports: (_property: string, value: string) => value.startsWith("#"),
  }),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const Background = ({ color }: { color: string }) =>
  useVisualizerBackground(color).background;

it("keeps the picture's color and the moving outline in sync, restoring the default when the picture leaves", () => {
  const frame = (path: string, color?: string) => (
    <VisualizerFrame path={path}>
      {color && <Background color={color} />}
    </VisualizerFrame>
  );
  const { container, rerender } = render(frame("M 0 0 L 20 20 Z", "#000014"));
  const background = () => container.querySelector("g path");
  expect(background()?.getAttribute("fill")).toBe("#000014");
  rerender(frame("M 0 0 L 40 20 Z", "#ecfeff"));
  expect(background()?.getAttribute("fill")).toBe("#ecfeff");
  expect(background()?.getAttribute("d")).toBe("M 0 0 L 40 20 Z");
  rerender(frame("M 0 0 L 40 20 Z"));
  expect(background()).toBeNull();
  expect(container.querySelector("svg > path")).not.toBeNull();
});

it("leaves standalone SVG visualizers independent of the window frame", () => {
  const { container } = render(<Background color="#ecfeff" />);
  expect(container.innerHTML).toBe("");
});

it("keeps legacy gradients in the picture instead of replacing them with a flat frame color", () => {
  const LegacyBackground = () =>
    useVisualizerBackground("#ecfeff", "linear-gradient(white, blue)")
      .background;
  const { container } = render(
    <VisualizerFrame path="M 0 0 L 20 20 Z">
      <LegacyBackground />
    </VisualizerFrame>,
  );
  expect(container.querySelector("g path")).toBeNull();
});

it.each<SVGProps<SVGSVGElement>>([
  { opacity: 0, style: { backgroundColor: "#000014" } },
  { style: { opacity: 0.5, backgroundColor: "#000014" } },
  { style: { color: "red", backgroundColor: "currentColor" } },
])(
  "keeps context-dependent legacy backgrounds on their SVG: %j",
  (legacyProps) => {
    vi.stubGlobal("CSS", { supports: () => true });
    const { container } = render(
      <VisualizerFrame path="M 0 0 L 20 20 Z">
        <VisualizerSvg
          options={{ origin: "top-left", navigation: "none" }}
          size={{ width: 400, height: 240 }}
          legacyProps={legacyProps}
        />
      </VisualizerFrame>,
    );
    expect(container.querySelector("g path")).toBeNull();
    const svg = container.querySelector<SVGSVGElement>(
      "[data-visualizer-scene] > svg",
    )!;
    expect(svg.style.backgroundColor.toLowerCase()).toBe(
      legacyProps.style?.backgroundColor === "currentColor"
        ? "currentcolor"
        : "rgb(0, 0, 20)",
    );
    if (legacyProps.opacity !== undefined)
      expect(svg.getAttribute("opacity")).toBe(String(legacyProps.opacity));
    if (legacyProps.style?.opacity !== undefined)
      expect(svg.style.opacity).toBe(String(legacyProps.style.opacity));
    if (legacyProps.style?.color !== undefined)
      expect(svg.style.color).toBe(legacyProps.style.color);
  },
);
