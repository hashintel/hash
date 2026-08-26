import { describe, expect, it } from "vitest";

import {
  getInitialViewport,
  MAX_FIT_ZOOM,
  recenterToFitViewport,
} from "./viewport";

import type { NodeType } from "../views/SDCPN/reactflow-types";

/** Nodes are positioned by their center point (`nodeOrigin` [0.5, 0.5]). */
const makeNode = (
  centerX: number,
  centerY: number,
  width: number,
  height: number,
) =>
  ({
    id: `node-${centerX}-${centerY}`,
    position: { x: centerX, y: centerY },
    data: {},
    width,
    height,
    measured: { width, height },
  }) as NodeType;

const viewport = { x: 0, y: 0, width: 500, height: 400 };

describe("recenterToFitViewport", () => {
  it("returns undefined when nodes are fully inside viewport", () => {
    const nodes = [makeNode(100, 90, 100, 80)];
    expect(recenterToFitViewport(viewport, nodes)).toBeUndefined();
  });

  it("returns undefined when there are no nodes", () => {
    expect(recenterToFitViewport(viewport, [])).toBeUndefined();
  });

  it("returns adjustment when nodes overflow to the right", () => {
    const nodes = [makeNode(500, 90, 100, 80)];
    // Node right edge is 550, viewport right is 500 → overflow right by 50
    const result = recenterToFitViewport(viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(50);
    expect(result!.y).toBe(0);
  });

  it("returns adjustment when nodes overflow to the left", () => {
    const nodes = [makeNode(-20, 90, 20, 80)];
    // Node left edge is -30, viewport left is 0 → overflow left by 30
    const result = recenterToFitViewport(viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(-30);
    expect(result!.y).toBe(0);
  });

  it("returns adjustment when nodes overflow the bottom", () => {
    const nodes = [makeNode(90, 400, 80, 100)];
    // Node bottom edge is 450, viewport bottom is 400 → overflow bottom by 50
    const result = recenterToFitViewport(viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(0);
    expect(result!.y).toBe(50);
  });

  it("returns adjustment when nodes overflow the top", () => {
    const nodes = [makeNode(90, -30, 80, 20)];
    // Node top edge is -40, viewport top is 0 → overflow top by 40
    const result = recenterToFitViewport(viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(0);
    expect(result!.y).toBe(-40);
  });

  it("returns adjustment for diagonal overflow (right + bottom)", () => {
    const nodes = [makeNode(470, 380, 100, 100)];
    // Right overflow: 520-500=20, Bottom overflow: 430-400=30
    const result = recenterToFitViewport(viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(20);
    expect(result!.y).toBe(30);
  });

  it("returns undefined when nodes are too large to fit", () => {
    const nodes = [makeNode(300, 250, 600, 500)];
    // 600 > 500 width, 500 > 400 height — can't fit
    expect(recenterToFitViewport(viewport, nodes)).toBeUndefined();
  });

  it("returns undefined when nodes exactly match viewport size", () => {
    // canFitInViewport uses strict <, so equal size means it can't fit
    const nodes = [makeNode(240, 190, 500, 400)];
    expect(recenterToFitViewport(viewport, nodes)).toBeUndefined();
  });

  it("handles multiple nodes whose combined bounds overflow", () => {
    const nodes = [makeNode(0, 70, 40, 40), makeNode(495, 70, 30, 40)];
    // Combined bounds: x=-20..510, y=50..90 → width=530 > 500, won't fit
    expect(recenterToFitViewport(viewport, nodes)).toBeUndefined();
  });

  it("handles multiple nodes that fit but are partially offscreen", () => {
    const nodes = [makeNode(0, 70, 40, 40), makeNode(215, 70, 30, 40)];
    // Combined bounds: x=-20..230, y=50..90 → width=250, height=40 — fits
    // Left overflow: -20
    const result = recenterToFitViewport(viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(-20);
    expect(result!.y).toBe(0);
  });
});

describe("getInitialViewport", () => {
  const container = { width: 1000, height: 500 };

  it("falls back to the origin at zoom 1 when there is nothing to fit", () => {
    expect(getInitialViewport(null, container)).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
    expect(
      getInitialViewport({ x: 10, y: 10, width: 0, height: 0 }, container),
    ).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("centers the bounds in the container", () => {
    const bounds = { x: 100, y: 200, width: 4000, height: 1000 };
    const { x, y, zoom } = getInitialViewport(bounds, container);

    const boundsCenterX = bounds.x + bounds.width / 2;
    const boundsCenterY = bounds.y + bounds.height / 2;
    expect(boundsCenterX * zoom + x).toBeCloseTo(container.width / 2);
    expect(boundsCenterY * zoom + y).toBeCloseTo(container.height / 2);
  });

  it("caps the zoom for small nets", () => {
    const bounds = { x: 0, y: 0, width: 180, height: 50 };
    expect(getInitialViewport(bounds, container).zoom).toBe(MAX_FIT_ZOOM);
  });

  it("zooms out far enough to show a large net in full", () => {
    const bounds = { x: 0, y: 0, width: 10_000, height: 1000 };
    const { x, y, zoom } = getInitialViewport(bounds, container);

    // Every corner of the bounds lands inside the container.
    expect(bounds.x * zoom + x).toBeGreaterThanOrEqual(0);
    expect(bounds.y * zoom + y).toBeGreaterThanOrEqual(0);
    expect((bounds.x + bounds.width) * zoom + x).toBeLessThanOrEqual(
      container.width,
    );
    expect((bounds.y + bounds.height) * zoom + y).toBeLessThanOrEqual(
      container.height,
    );
  });
});
