import { describe, expect, it } from "vitest";

import { deriveZoomAttributes } from "./zoom-attributes";

/**
 * Zoom here is framing-normalised: `0` is the framed-out view and each `+1`
 * doubles the on-screen scale. The exact opacity/detail thresholds are internal
 * (rebased off a fixed framing offset), so these tests assert the *shape* of each
 * curve — clamps, monotonicity, and the detail switch — rather than tuned values.
 */
describe("deriveZoomAttributes", () => {
  it("returns neutral defaults before the view is framed (null zoom)", () => {
    const attributes = deriveZoomAttributes(null, null);
    expect(attributes.radiusScale).toBe(1);
    expect(attributes.pointOpacity).toBe(1);
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

  describe("pointOpacity", () => {
    it("holds at full opacity across a mid-zoom plateau", () => {
      const peak = Array.from(
        { length: 261 },
        (_unused, step) =>
          deriveZoomAttributes(-10 + step * 0.1, null).pointOpacity,
      ).reduce((max, value) => Math.max(max, value), 0);
      expect(peak).toBeCloseTo(1);
    });

    it("bottoms out at the same floor when framed fully out or fully in", () => {
      const out = deriveZoomAttributes(-1_000, null).pointOpacity;
      const inn = deriveZoomAttributes(1_000, null).pointOpacity;
      expect(out).toBeCloseTo(inn);
      expect(out).toBeLessThan(1);
    });

    it("rises to the plateau then falls again (unimodal)", () => {
      const opacities = Array.from(
        { length: 261 },
        (_unused, step) =>
          deriveZoomAttributes(-10 + step * 0.1, null).pointOpacity,
      );
      let peakIndex = 0;
      for (let index = 1; index < opacities.length; index += 1) {
        if (opacities[index]! > opacities[peakIndex]!) {
          peakIndex = index;
        }
      }
      // Non-decreasing up to the peak, non-increasing after it.
      for (let index = 1; index <= peakIndex; index += 1) {
        expect(opacities[index]!).toBeGreaterThanOrEqual(opacities[index - 1]!);
      }
      for (let index = peakIndex + 1; index < opacities.length; index += 1) {
        expect(opacities[index]!).toBeLessThanOrEqual(opacities[index - 1]!);
      }
    });
  });
});
