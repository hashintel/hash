/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useVisualizerBackground, VisualizerFrame } from "./visualizer-frame";

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
