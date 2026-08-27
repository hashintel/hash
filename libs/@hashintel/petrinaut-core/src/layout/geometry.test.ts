import { describe, expect, it } from "vitest";

import {
  getBoundsOfCenteredBoxes,
  getMinZoomForBounds,
  ZOOM_PADDING,
} from "./geometry";

describe("getBoundsOfCenteredBoxes", () => {
  it("returns null for no boxes", () => {
    expect(getBoundsOfCenteredBoxes([])).toBeNull();
  });

  it("spans a single box around its center", () => {
    expect(
      getBoundsOfCenteredBoxes([
        { position: { x: 100, y: 40 }, width: 180, height: 50 },
      ]),
    ).toEqual({ x: 10, y: 15, width: 180, height: 50 });
  });

  it("spans multiple boxes", () => {
    expect(
      getBoundsOfCenteredBoxes([
        { position: { x: 0, y: 0 }, width: 100, height: 20 },
        { position: { x: 200, y: 100 }, width: 40, height: 40 },
      ]),
    ).toEqual({ x: -50, y: -10, width: 270, height: 130 });
  });

  it("treats boxes with unknown size as points", () => {
    expect(
      getBoundsOfCenteredBoxes([
        { position: { x: -5, y: 5 } },
        { position: { x: 5, y: -5 } },
      ]),
    ).toEqual({ x: -5, y: -5, width: 10, height: 10 });
  });
});

describe("getMinZoomForBounds", () => {
  const viewport = { width: 1000, height: 500 };

  it("scales the fit zoom by the padding factor on the limiting axis", () => {
    const bounds = { x: 0, y: 0, width: 4000, height: 1000 };
    // Width is limiting: 1000 / 4000 = 0.25, then * ZOOM_PADDING.
    expect(getMinZoomForBounds(bounds, viewport)).toBeCloseTo(
      0.25 * ZOOM_PADDING,
    );
  });

  it("defaults to 0.5 when there are no bounds", () => {
    expect(getMinZoomForBounds(null, viewport)).toBe(0.5);
  });

  it("defaults to 0.5 when the bounds have no area", () => {
    expect(
      getMinZoomForBounds({ x: 0, y: 0, width: 0, height: 0 }, viewport),
    ).toBe(0.5);
  });

  it("caps the result so small nets still allow zooming out", () => {
    const bounds = { x: 0, y: 0, width: 180, height: 50 };
    expect(getMinZoomForBounds(bounds, viewport)).toBe(0.75);
  });
});
