import { describe, expect, it, vi } from "vitest";

import {
  clampPanTarget,
  iconAtlasKey,
  iconAtlasSource,
} from "./network-graph-util";

// `network-graph-util` pulls in the ds `Icon`, which statically imports hundreds
// of `.svg` files through `vite-plugin-svgr`. Stub `Icon` so these pure-logic
// tests never load that SVG-transform chain — its rolldown/oxc branch calls a
// `transformWithOxc` export that plain (non-rolldown) Vite lacks, which crashes
// the suite under Vitest's runner. The rasterised markup is exercised by the
// snapshot tests; here we only assert the data-URL shape.
vi.mock("../../Icon/icon", async () => {
  const { createElement } = await import("react");
  return { Icon: () => createElement("svg") };
});

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

describe("iconAtlasKey", () => {
  it("keys a ds icon by its registry name", () => {
    expect(iconAtlasKey("cube")).toBe("cube");
  });

  it("keys an SVG icon by its URL", () => {
    expect(iconAtlasKey({ svgUrl: "/icons/types/box.svg" })).toBe(
      "/icons/types/box.svg",
    );
  });
});

describe("iconAtlasSource", () => {
  it("rasterises a ds icon to an inline data URL", () => {
    expect(iconAtlasSource("cube")).toMatch(/^data:image\/svg\+xml/u);
  });

  it("loads an SVG icon straight from its URL", () => {
    expect(iconAtlasSource({ svgUrl: "/icons/types/box.svg" })).toBe(
      "/icons/types/box.svg",
    );
  });
});
