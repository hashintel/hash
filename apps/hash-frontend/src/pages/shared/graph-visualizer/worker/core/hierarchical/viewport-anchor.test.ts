import { describe, expect, it } from "vitest";

import { VIEWPORT_ANCHOR_FLOOR, viewportAnchorWeight } from "./viewport-anchor";

import type { ViewportState } from "../../hierarchy/lod";

/** A 1000x1000 viewport centred on the origin at the given zoom. */
const viewportAt = (zoom: number): ViewportState => ({
  zoom,
  centerX: 0,
  centerY: 0,
  width: 1000,
  height: 1000,
});

describe("viewportAnchorWeight", () => {
  it("pins the viewport centre (~1) and frees the far field (~floor)", () => {
    const viewport = viewportAt(0);
    expect(viewportAnchorWeight(0, 0, viewport)).toBeCloseTo(1, 5);
    expect(viewportAnchorWeight(100_000, 0, viewport)).toBeCloseTo(
      VIEWPORT_ANCHOR_FLOOR,
      5,
    );
  });

  it("decreases monotonically with distance from the centre", () => {
    const viewport = viewportAt(2);
    const w0 = viewportAnchorWeight(0, 0, viewport);
    const w1 = viewportAnchorWeight(50, 0, viewport);
    const w2 = viewportAnchorWeight(150, 0, viewport);
    const w3 = viewportAnchorWeight(400, 0, viewport);
    expect(w0).toBeGreaterThan(w1);
    expect(w1).toBeGreaterThan(w2);
    expect(w2).toBeGreaterThan(w3);
  });

  it("strengthens the centre pin as you zoom in (the fix)", () => {
    // Same bubble, dead centre, viewed at increasing zoom: it must be pinned
    // harder so its SCREEN movement doesn't balloon.
    const atZoom0 = viewportAnchorWeight(0, 0, viewportAt(0));
    const atZoom4 = viewportAnchorWeight(0, 0, viewportAt(4));
    expect(atZoom4).toBeGreaterThan(atZoom0 * 8);
  });

  it("holds the centre's SCREEN movement ~constant across zoom-in", () => {
    // World wobble ~ 1/weight, screen wobble ~ scale/weight. With the zoom
    // amplification this proxy stays ~flat; WITHOUT it (weight capped at 1) it
    // would grow with scale (1, 4, 16, ...). Assert it barely varies.
    const proxies = [0, 1, 2, 3, 4, 5].map((zoom) => {
      const scale = 2 ** zoom;
      return scale / viewportAnchorWeight(0, 0, viewportAt(zoom));
    });
    const max = Math.max(...proxies);
    const min = Math.min(...proxies);
    expect(max / min).toBeLessThan(1.1);
  });

  it("does NOT amplify off-screen bubbles when zoomed in", () => {
    // A bubble far outside the view stays at the floor regardless of zoom, so it
    // remains free to reflow where the user can't see it.
    const far = 100_000;
    expect(viewportAnchorWeight(far, 0, viewportAt(0))).toBeCloseTo(
      VIEWPORT_ANCHOR_FLOOR,
      5,
    );
    expect(viewportAnchorWeight(far, 0, viewportAt(5))).toBeCloseTo(
      VIEWPORT_ANCHOR_FLOOR,
      5,
    );
  });

  it("keeps the baseline when zoomed OUT (no de-pinning below 1x)", () => {
    // Zooming out must not loosen the anchor below its zoom-0 baseline.
    const centreZoom0 = viewportAnchorWeight(0, 0, viewportAt(0));
    const centreZoomOut = viewportAnchorWeight(0, 0, viewportAt(-3));
    expect(centreZoomOut).toBeCloseTo(centreZoom0, 5);
  });
});
