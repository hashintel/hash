import { describe, expect, it } from "vitest";

import { clampPanTarget } from "./network-graph-util";

/**
 * The pan clamp keeps the network in view, working off the node-*centre* bounds it
 * is given. A node is drawn as a disc extending past its centre, so the clamp takes
 * a `marginPx` (the node radius) and must let the view pan far enough that an edge
 * node's whole disc — not just its centre — comes on screen.
 */
describe("clampPanTarget", () => {
  const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 500 };
  // A zoomed-in view: the network (1000 world wide) is far larger than the 400px
  // viewport, so the pan clamp — not the framing — governs how far you can pan.
  const scale = 2;
  const width = 400;
  const height = 300;

  it("lets the far edge node's full radius be panned into view", () => {
    const radiusPx = 20;
    const [clampedX] = clampPanTarget(
      [1_000_000, 250, 0],
      scale,
      width,
      height,
      bounds,
      radiusPx,
    );
    const viewportRightEdge = clampedX + width / (2 * scale);
    const nodeRightRim = bounds.maxX + radiusPx / scale;
    expect(viewportRightEdge).toBeGreaterThanOrEqual(nodeRightRim);
  });

  it("clips the edge node when no margin is reserved", () => {
    // The pre-fix behaviour (margin 0) only brought the node *centre* to the edge,
    // so a disc wider than the flat padding spilled off screen.
    const radiusPx = 20;
    const [clampedX] = clampPanTarget(
      [1_000_000, 250, 0],
      scale,
      width,
      height,
      bounds,
      0,
    );
    const viewportRightEdge = clampedX + width / (2 * scale);
    const nodeRightRim = bounds.maxX + radiusPx / scale;
    expect(viewportRightEdge).toBeLessThan(nodeRightRim);
  });

  it("applies the same reservation on the left edge", () => {
    const radiusPx = 20;
    const [clampedX] = clampPanTarget(
      [-1_000_000, 250, 0],
      scale,
      width,
      height,
      bounds,
      radiusPx,
    );
    const viewportLeftEdge = clampedX - width / (2 * scale);
    const nodeLeftRim = bounds.minX - radiusPx / scale;
    expect(viewportLeftEdge).toBeLessThanOrEqual(nodeLeftRim);
  });
});
