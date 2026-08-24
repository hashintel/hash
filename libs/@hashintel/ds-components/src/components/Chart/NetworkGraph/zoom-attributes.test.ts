import { describe, expect, it } from "vitest";

import { deriveZoomAttributes } from "./zoom-attributes";

/**
 * Zoom here is framing-normalised: `0` is the framed-out view and each `+1`
 * doubles the on-screen scale. The exact detail threshold is internal (rebased off a
 * fixed framing offset), so these tests assert the *shape* of each curve — clamps,
 * monotonicity, and the detail switch — rather than tuned values.
 */
describe("deriveZoomAttributes", () => {
  it("returns neutral defaults before the view is framed (null zoom)", () => {
    const attributes = deriveZoomAttributes(null, null);
    expect(attributes.radiusScale).toBe(1);
    expect(attributes.arrowGapPx).toBeGreaterThan(0);
    expect(attributes.isDetailZoom).toBe(false);
  });

  describe("isDetailZoom", () => {
    it("is false while no detail threshold is known", () => {
      expect(deriveZoomAttributes(100, null).isDetailZoom).toBe(false);
    });

    it("switches on at or above the detail threshold", () => {
      expect(deriveZoomAttributes(3, 4).isDetailZoom).toBe(false);
      expect(deriveZoomAttributes(4, 4).isDetailZoom).toBe(true);
      expect(deriveZoomAttributes(5, 4).isDetailZoom).toBe(true);
    });
  });

  describe("radiusScale", () => {
    it("floors at 0 when framed far out", () => {
      expect(deriveZoomAttributes(-100, null).radiusScale).toBe(0);
    });

    it("grows monotonically with zoom once off the floor", () => {
      const scales = [2, 3, 4, 5, 6].map(
        (zoom) => deriveZoomAttributes(zoom, null).radiusScale,
      );
      for (let index = 1; index < scales.length; index += 1) {
        expect(scales[index]!).toBeGreaterThan(scales[index - 1]!);
      }
    });
  });

  describe("arrowGapPx", () => {
    it("widens as the user zooms in", () => {
      const out = deriveZoomAttributes(-2, null).arrowGapPx;
      const mid = deriveZoomAttributes(0, null).arrowGapPx;
      const inn = deriveZoomAttributes(4, null).arrowGapPx;
      expect(mid).toBeGreaterThan(out);
      expect(inn).toBeGreaterThan(mid);
    });
  });
});
