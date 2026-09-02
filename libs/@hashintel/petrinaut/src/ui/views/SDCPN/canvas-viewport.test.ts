import { describe, expect, it } from "vitest";

import {
  fitViewportToBounds,
  getInitialViewport,
  MAX_FIT_ZOOM,
  recenterToFitViewport,
} from "./canvas-viewport";

/** Nodes are positioned by their centre point. */
const makeNode = (
  centerX: number,
  centerY: number,
  width: number,
  height: number,
) => ({
  position: { x: centerX, y: centerY },
  width,
  height,
});

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

  it("returns undefined when the nodes cannot fit in the viewport", () => {
    const nodes = [makeNode(0, 0, 100, 100), makeNode(1000, 1000, 100, 100)];
    expect(recenterToFitViewport(viewport, nodes)).toBeUndefined();
  });
});

describe("fitViewportToBounds", () => {
  it("centres the bounds and leaves the padding free", () => {
    const result = fitViewportToBounds(
      { x: 0, y: 0, width: 200, height: 100 },
      { width: 600, height: 600 },
      0.1,
      10,
      0.5,
    );
    // Width limits: 600 / (200 * 1.5) = 2
    expect(result.zoom).toBe(2);
    // Bounds centre (100, 50) lands on the container centre (300, 300)
    expect(result.x).toBe(300 - 100 * 2);
    expect(result.y).toBe(300 - 50 * 2);
  });

  it("clamps the zoom to the given range", () => {
    const bounds = { x: 0, y: 0, width: 10, height: 10 };
    const container = { width: 1000, height: 1000 };
    expect(fitViewportToBounds(bounds, container, 0.1, 1.5, 0).zoom).toBe(1.5);
    expect(
      fitViewportToBounds(
        { x: 0, y: 0, width: 10_000, height: 10_000 },
        container,
        0.3,
        1.5,
        0,
      ).zoom,
    ).toBe(0.3);
  });
});

describe("getInitialViewport", () => {
  it("returns the origin at zoom 1 when there is nothing to fit", () => {
    expect(getInitialViewport(null, { width: 500, height: 400 })).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
  });

  it("never zooms in past the fit ceiling", () => {
    const result = getInitialViewport(
      { x: 0, y: 0, width: 10, height: 10 },
      { width: 1000, height: 1000 },
    );
    expect(result.zoom).toBe(MAX_FIT_ZOOM);
  });
});
