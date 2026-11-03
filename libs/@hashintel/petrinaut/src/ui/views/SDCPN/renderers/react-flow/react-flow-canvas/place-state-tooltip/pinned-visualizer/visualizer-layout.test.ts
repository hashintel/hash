import { expect, it } from "vitest";

import {
  createVisualizerLayout,
  getVisualizerBounds,
  getVisualizerConnector,
  updateVisualizerLayout,
} from "./visualizer-layout";

const layout = {
  position: { x: 100, y: 200 },
  size: { width: 320, height: 240 },
};

it.each([
  { width: 800, height: 400, expected: { width: 480, height: 240 } },
  { width: 800, height: 1600, expected: { width: 200, height: 400 } },
  { width: 80, height: 40, expected: { width: 240, height: 120 } },
])(
  "preserves the initial aspect ratio for $width × $height artwork",
  ({ width, height, expected }) => {
    const initial = createVisualizerLayout(
      { x: 500, y: 400, width: 100, height: 80 },
      { width, height },
      { x: 0, y: 0, width: 1200, height: 800, zoom: 1 },
    );
    expect(initial.size).toEqual(expected);
  },
);

it.each([0.5, 1, 2])(
  "moves by screen pixels and retains size at zoom %s",
  (zoom) => {
    const moved = updateVisualizerLayout(
      layout,
      "move",
      { x: 40, y: -20 },
      zoom,
    );
    expect(moved).toEqual({
      position: { x: 100 + 40 / zoom, y: 200 - 20 / zoom },
      size: layout.size,
    });
    const bounds = getVisualizerBounds(moved, zoom);
    expect(bounds.width * zoom).toBe(layout.size.width);
    expect(bounds.height * zoom).toBe(layout.size.height);
  },
);

it("connects the place and panel outlines and hides the line when they overlap", () => {
  const node = { x: 0, y: 0, width: 100, height: 100 };
  expect(
    getVisualizerConnector(node, { x: 200, y: 0, width: 100, height: 100 }, 1),
  ).toEqual({
    start: { x: 100, y: 50 },
    end: { x: 200, y: 50 },
  });
  expect(
    getVisualizerConnector(node, { x: 50, y: 0, width: 100, height: 100 }, 1),
  ).toBeNull();
});

it.each([
  { direction: "top", delta: { x: 90, y: -60 }, position: { x: 80, y: 170 } },
  { direction: "right", delta: { x: 80, y: 90 }, position: { x: 100, y: 185 } },
  {
    direction: "bottom",
    delta: { x: -90, y: 60 },
    position: { x: 80, y: 200 },
  },
  { direction: "left", delta: { x: -80, y: 70 }, position: { x: 60, y: 185 } },
  {
    direction: "top-left",
    delta: { x: -80, y: -60 },
    position: { x: 60, y: 170 },
  },
  {
    direction: "top-right",
    delta: { x: 80, y: -60 },
    position: { x: 100, y: 170 },
  },
  {
    direction: "bottom-left",
    delta: { x: -80, y: 60 },
    position: { x: 60, y: 200 },
  },
  {
    direction: "bottom-right",
    delta: { x: 80, y: 60 },
    position: { x: 100, y: 200 },
  },
] as const)(
  "keeps the ratio and opposite anchor when resizing from $direction",
  ({ direction, delta, position }) => {
    expect(updateVisualizerLayout(layout, direction, delta, 2)).toEqual({
      position,
      size: { width: 400, height: 300 },
    });
  },
);

it.each([
  { x: 80, y: 0 },
  { x: 0, y: 60 },
])("resizes both dimensions with a one-axis corner drag: %o", (delta) => {
  expect(updateVisualizerLayout(layout, "bottom-right", delta, 0.5)).toEqual({
    position: layout.position,
    size: { width: 400, height: 300 },
  });
});

it("keeps the ratio at the minimum size and allows growing again", () => {
  const minimum = updateVisualizerLayout(
    layout,
    "bottom-right",
    { x: -1000, y: -1000 },
    1,
  );
  expect(minimum.size).toEqual({ width: 180, height: 135 });
  const grown = updateVisualizerLayout(
    minimum,
    "bottom-right",
    { x: 40, y: 0 },
    1,
  );
  expect(grown.size.width).toBeCloseTo(220);
  expect(grown.size.height).toBeCloseTo(165);
});
