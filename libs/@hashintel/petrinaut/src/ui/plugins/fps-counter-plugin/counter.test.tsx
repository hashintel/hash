/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { FpsCounter } from "./counter";

vi.mock("./counter/use-browser-fps", () => ({
  useBrowserFps: () => [60, 40, 20],
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("draws a 24 by 6 history coloured by frame rate, newest on the right", () => {
  const fills: { color: string; x: number }[] = [];
  const context = {
    fillStyle: "",
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: (x: number) => {
      fills.push({ color: context.fillStyle, x });
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  render(<FpsCounter onClose={() => {}} />);

  const rightmost = Math.max(...fills.map((fill) => fill.x));
  const slowest = fills.filter((fill) => fill.color === "#f85149");
  expect(fills).toHaveLength(144);
  expect(fills.filter((fill) => fill.color === "#3fb950")).toHaveLength(6);
  expect(fills.filter((fill) => fill.color === "#e3b341")).toHaveLength(4);
  expect(slowest).toHaveLength(2);
  expect(slowest.every((fill) => fill.x === rightmost)).toBe(true);
  expect(screen.getByText("20")).toBeTruthy();
});
