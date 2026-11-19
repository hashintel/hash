import { expect, it } from "vitest";

import {
  constrainVisualizerLayout,
  createVisualizerLayout,
  getVisualizerAnchor,
  updateVisualizerLayout,
} from "./visualizer-layout";

const layout = {
  position: { x: 100, y: 200 },
  size: { width: 320, height: 240 },
};
const viewport = { x: 0, y: 0, width: 1200, height: 800 };

it("opens at the default size in the best available position", () => {
  const initial = createVisualizerLayout(
    { x: 500, y: 400, width: 100, height: 80 },
    viewport,
  );
  expect(initial).toEqual({
    position: { x: 370, y: 144 },
    size: { width: 360, height: 240 },
  });
});

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

it("fits into a smaller viewport without changing the preferred layout", () => {
  expect(
    constrainVisualizerLayout(layout, {
      x: 40,
      y: 60,
      width: 160,
      height: 100,
    }),
  ).toEqual({
    position: { x: 40, y: 60 },
    size: { width: 160, height: 100 },
  });
  expect(constrainVisualizerLayout(layout, viewport)).toEqual(layout);
});

it("keeps the attachment on the visible part of an overlapping place", () => {
  const node = { x: 0, y: 0, width: 100, height: 100 };
  expect(
    getVisualizerAnchor(node, { x: 200, y: 0, width: 100, height: 100 }),
  ).toEqual({
    x: 100,
    y: 50,
  });
  const overlapping = getVisualizerAnchor(node, {
    x: 50,
    y: 0,
    width: 100,
    height: 100,
  });
  expect(overlapping.x).toBeCloseTo(40, 2);
  expect(overlapping.y).toBeCloseTo(50, 2);
  expect(
    getVisualizerAnchor(node, { x: -10, y: -10, width: 200, height: 200 }),
  ).toEqual({ x: 50, y: 50 });
});

it.each([
  {
    direction: "top",
    delta: { x: 90, y: -60 },
    position: { x: 100, y: 140 },
    size: { width: 320, height: 300 },
    centered: { x: 100, y: 140, width: 320, height: 360 },
  },
  {
    direction: "right",
    delta: { x: 80, y: 90 },
    position: { x: 100, y: 200 },
    size: { width: 400, height: 240 },
    centered: { x: 20, y: 200, width: 480, height: 240 },
  },
  {
    direction: "bottom",
    delta: { x: -90, y: 60 },
    position: { x: 100, y: 200 },
    size: { width: 320, height: 300 },
    centered: { x: 100, y: 140, width: 320, height: 360 },
  },
  {
    direction: "left",
    delta: { x: -80, y: 70 },
    position: { x: 20, y: 200 },
    size: { width: 400, height: 240 },
    centered: { x: 20, y: 200, width: 480, height: 240 },
  },
  {
    direction: "top-left",
    delta: { x: -80, y: -60 },
    position: { x: 20, y: 140 },
    size: { width: 400, height: 300 },
    centered: { x: 20, y: 140, width: 480, height: 360 },
  },
  {
    direction: "top-right",
    delta: { x: 80, y: -60 },
    position: { x: 100, y: 140 },
    size: { width: 400, height: 300 },
    centered: { x: 20, y: 140, width: 480, height: 360 },
  },
  {
    direction: "bottom-left",
    delta: { x: -80, y: 60 },
    position: { x: 20, y: 200 },
    size: { width: 400, height: 300 },
    centered: { x: 20, y: 140, width: 480, height: 360 },
  },
  {
    direction: "bottom-right",
    delta: { x: 80, y: 60 },
    position: { x: 100, y: 200 },
    size: { width: 400, height: 300 },
    centered: { x: 20, y: 140, width: 480, height: 360 },
  },
] as const)(
  "resizes independent axes from $direction, keeping the opposite anchor or Alt center",
  ({ direction, delta, position, size, centered }) => {
    expect(updateVisualizerLayout(layout, direction, delta, viewport)).toEqual({
      position,
      size,
    });
    const resized = updateVisualizerLayout(
      layout,
      direction,
      delta,
      viewport,
      true,
    );
    expect({ ...resized.position, ...resized.size }).toEqual(centered);
  },
);

it("changes only width on a horizontal corner drag", () => {
  expect(
    updateVisualizerLayout(layout, "bottom-right", { x: 80, y: 0 }, viewport),
  ).toEqual({ position: layout.position, size: { width: 400, height: 240 } });
});

it("enforces minimum dimensions and allows growing again", () => {
  const minimum = updateVisualizerLayout(
    layout,
    "bottom-right",
    { x: -1000, y: -1000 },
    viewport,
  );
  expect(minimum.size).toEqual({ width: 180, height: 120 });
  const grown = updateVisualizerLayout(
    minimum,
    "bottom-right",
    { x: 40, y: 0 },
    viewport,
  );
  expect(grown.size.width).toBeCloseTo(220);
  expect(grown.size.height).toBeCloseTo(120);
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
    expect(resized.size.width).toBeLessThanOrEqual(800);
    expect(resized.size.height).toBeLessThanOrEqual(600);
  },
);

it("limits both dimensions even when the viewport has more room", () => {
  expect(
    updateVisualizerLayout(
      layout,
      "bottom-right",
      { x: 3000, y: 3000 },
      { x: 0, y: 0, width: 4000, height: 4000 },
    ).size,
  ).toEqual({ width: 800, height: 600 });
});
