import { describe, expect, it } from "vitest";

import {
  centerViewportOn,
  fitViewport,
  MAX_SCALE,
  MIN_SCALE,
  panViewport,
  visibleRegion,
  zoomViewport,
} from "./net-graph-viewport";

const PANE = { width: 400, height: 300 };

describe("fitViewport", () => {
  it("centres a small layout at 1:1 instead of magnifying it", () => {
    const viewport = fitViewport({ width: 200, height: 100 }, PANE);
    expect(viewport.scale).toBe(1);
    expect(viewport.x).toBe(100);
    expect(viewport.y).toBe(100);
  });

  it("shrinks a large layout to fit with the margin", () => {
    const viewport = fitViewport({ width: 800, height: 300 }, PANE);
    expect(viewport.scale).toBeCloseTo((400 - 32) / 800);
    // Centred: equal slack on both sides.
    expect(viewport.x).toBeCloseTo((400 - 800 * viewport.scale) / 2);
  });
});

describe("zoomViewport", () => {
  it("keeps the layout point under the cursor fixed", () => {
    const viewport = { x: 50, y: 20, scale: 1 };
    const cursor = { x: 150, y: 120 };
    const layoutUnderCursor = {
      x: (cursor.x - viewport.x) / viewport.scale,
      y: (cursor.y - viewport.y) / viewport.scale,
    };
    const zoomed = zoomViewport(viewport, cursor, -200);
    expect(zoomed.scale).toBeGreaterThan(viewport.scale);
    expect(layoutUnderCursor.x * zoomed.scale + zoomed.x).toBeCloseTo(cursor.x);
    expect(layoutUnderCursor.y * zoomed.scale + zoomed.y).toBeCloseTo(cursor.y);
  });

  it("clamps at both scale bounds", () => {
    const viewport = { x: 0, y: 0, scale: 1 };
    expect(zoomViewport(viewport, { x: 0, y: 0 }, 10_000).scale).toBe(
      MIN_SCALE,
    );
    expect(zoomViewport(viewport, { x: 0, y: 0 }, -10_000).scale).toBe(
      MAX_SCALE,
    );
  });
});

describe("visibleRegion and centerViewportOn", () => {
  it("round-trips: centring on a point puts it mid-region", () => {
    const centred = centerViewportOn(
      { x: 0, y: 0, scale: 0.5 },
      { x: 300, y: 200 },
      PANE,
    );
    const region = visibleRegion(centred, PANE);
    expect(region.x + region.width / 2).toBeCloseTo(300);
    expect(region.y + region.height / 2).toBeCloseTo(200);
  });

  it("panning shifts the visible region opposite to the drag", () => {
    const viewport = { x: 0, y: 0, scale: 1 };
    const region = visibleRegion(panViewport(viewport, 40, -30), PANE);
    expect(region.x).toBe(-40);
    expect(region.y).toBe(30);
  });
});
