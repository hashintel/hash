import { expect, it } from "vitest";

import {
  constrainVisualizerLayout,
  createVisualizerLayout,
  getVisualizerConnector,
  updateVisualizerLayout,
} from "./visualizer-layout";

const layout = {
  position: { x: 100, y: 200 },
  size: { width: 320, height: 240 },
};
const viewport = { x: 0, y: 0, width: 1200, height: 800 };

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
      viewport,
    );
    expect(initial.size).toEqual(expected);
  },
);

it("moves by screen pixels and retains size", () => {
  expect(
    updateVisualizerLayout(layout, "move", { x: 40, y: -20 }, viewport),
  ).toEqual({
    position: { x: 140, y: 180 },
    size: layout.size,
  });
});

it.each([
  { delta: { x: -1000, y: -1000 }, position: { x: 20, y: 40 } },
  { delta: { x: 1000, y: 1000 }, position: { x: 900, y: 600 } },
])(
  "keeps dragging inside every viewport edge: $delta",
  ({ delta, position }) => {
    expect(
      updateVisualizerLayout(layout, "move", delta, {
        ...viewport,
        x: 20,
        y: 40,
      }),
    ).toEqual({
      position,
      size: layout.size,
    });
  },
);

it("fits into a smaller viewport without changing the aspect ratio or the preferred layout", () => {
  expect(
    constrainVisualizerLayout(layout, {
      x: 40,
      y: 60,
      width: 160,
      height: 100,
    }),
  ).toEqual({
    position: { x: 40 + 160 - 320 * (100 / 240), y: 60 },
    size: { width: 320 * (100 / 240), height: 100 },
  });
  expect(constrainVisualizerLayout(layout, viewport)).toEqual(layout);
});

it("connects the place and panel outlines and hides the line when they overlap", () => {
  const node = { x: 0, y: 0, width: 100, height: 100 };
  expect(
    getVisualizerConnector(node, { x: 200, y: 0, width: 100, height: 100 }),
  ).toEqual({
    start: { x: 100, y: 50 },
    end: { x: 200, y: 50 },
  });
  expect(
    getVisualizerConnector(node, { x: 50, y: 0, width: 100, height: 100 }),
  ).toBeNull();
});

it.each([
  { direction: "top", delta: { x: 90, y: -60 }, position: { x: 60, y: 140 } },
  { direction: "right", delta: { x: 80, y: 90 }, position: { x: 100, y: 170 } },
  {
    direction: "bottom",
    delta: { x: -90, y: 60 },
    position: { x: 60, y: 200 },
  },
  { direction: "left", delta: { x: -80, y: 70 }, position: { x: 20, y: 170 } },
  {
    direction: "top-left",
    delta: { x: -80, y: -60 },
    position: { x: 20, y: 140 },
  },
  {
    direction: "top-right",
    delta: { x: 80, y: -60 },
    position: { x: 100, y: 140 },
  },
  {
    direction: "bottom-left",
    delta: { x: -80, y: 60 },
    position: { x: 20, y: 200 },
  },
  {
    direction: "bottom-right",
    delta: { x: 80, y: 60 },
    position: { x: 100, y: 200 },
  },
] as const)(
  "keeps the ratio and opposite anchor when resizing from $direction",
  ({ direction, delta, position }) => {
    expect(updateVisualizerLayout(layout, direction, delta, viewport)).toEqual({
      position,
      size: { width: 400, height: 300 },
    });
    expect(
      updateVisualizerLayout(layout, direction, delta, viewport, true),
    ).toEqual({
      position: { x: 20, y: 140 },
      size: { width: 480, height: 360 },
    });
  },
);

it.each([
  { x: 80, y: 0 },
  { x: 0, y: 60 },
])("resizes both dimensions with a one-axis corner drag: %o", (delta) => {
  expect(
    updateVisualizerLayout(layout, "bottom-right", delta, viewport),
  ).toEqual({
    position: layout.position,
    size: { width: 400, height: 300 },
  });
});

it("keeps the ratio at the minimum size and allows growing again", () => {
  const minimum = updateVisualizerLayout(
    layout,
    "bottom-right",
    { x: -1000, y: -1000 },
    viewport,
  );
  expect(minimum.size).toEqual({ width: 180, height: 135 });
  const grown = updateVisualizerLayout(
    minimum,
    "bottom-right",
    { x: 40, y: 0 },
    viewport,
  );
  expect(grown.size.width).toBeCloseTo(220);
  expect(grown.size.height).toBeCloseTo(165);
});

it.each([false, true])(
  "stops resizing at the viewport without moving its anchor (center: %s)",
  (fromCenter) => {
    const resized = updateVisualizerLayout(
      layout,
      "bottom-right",
      { x: 2000, y: 2000 },
      viewport,
      fromCenter,
    );
    if (fromCenter) {
      expect(resized.position.x).toBe(0);
      expect(resized.position.x + resized.size.width / 2).toBe(
        layout.position.x + layout.size.width / 2,
      );
      expect(resized.position.y + resized.size.height / 2).toBe(
        layout.position.y + layout.size.height / 2,
      );
    } else {
      expect(resized.position).toEqual(layout.position);
      expect(resized.position.y + resized.size.height).toBe(viewport.height);
    }
    expect(resized.size.width / resized.size.height).toBeCloseTo(4 / 3);
  },
);
