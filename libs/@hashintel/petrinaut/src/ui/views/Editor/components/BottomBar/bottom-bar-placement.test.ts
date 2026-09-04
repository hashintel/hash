import { describe, expect, it } from "vitest";

import {
  type BottomBarBounds,
  fitsWithinBounds,
  getAvailableWidth,
  getBottomBarOffset,
} from "./bottom-bar-placement";

const bounds = (overrides: Partial<BottomBarBounds> = {}): BottomBarBounds => ({
  containerWidth: 1000,
  leftInset: 0,
  rightInset: 0,
  margin: 12,
  ...overrides,
});

describe("getBottomBarOffset", () => {
  it("leaves a bar that clears both panels centred", () => {
    expect(
      getBottomBarOffset(bounds({ leftInset: 200, rightInset: 200 }), 400),
    ).toBe(0);
  });

  it("pushes a bar clear of the left panel", () => {
    // Centred, the 600px bar starts at 200px, 62px inside the panel and its margin.
    expect(getBottomBarOffset(bounds({ leftInset: 250 }), 600)).toBe(62);
  });

  it("pushes a bar clear of the right panel", () => {
    expect(getBottomBarOffset(bounds({ rightInset: 250 }), 600)).toBe(-62);
  });

  it("pushes clear of the wider side when both panels are open", () => {
    const space = bounds({
      containerWidth: 1200,
      leftInset: 100,
      rightInset: 400,
    });

    expect(getBottomBarOffset(space, 500)).toBe(-62);
  });

  it("keeps the left edge when the bar is wider than the space between the panels", () => {
    const space = bounds({ leftInset: 400, rightInset: 400 });
    const offset = getBottomBarOffset(space, 400);

    // 1000 - 400 = 600, and the left edge lands on the panel edge plus margin.
    expect(offset).toBe(112);
    expect((1000 - 400) / 2 + offset).toBe(412);
  });

  it("stays put until the container and the bar have been measured", () => {
    expect(getBottomBarOffset(bounds({ containerWidth: 0 }), 400)).toBe(0);
    expect(getBottomBarOffset(bounds(), 0)).toBe(0);
  });
});

describe("fitsWithinBounds", () => {
  it("counts both insets and both margins against the container", () => {
    expect(getAvailableWidth(bounds({ leftInset: 250, rightInset: 350 }))).toBe(
      376,
    );
    expect(
      fitsWithinBounds(bounds({ leftInset: 250, rightInset: 350 }), 376),
    ).toBe(true);
    expect(
      fitsWithinBounds(bounds({ leftInset: 250, rightInset: 350 }), 377),
    ).toBe(false);
  });

  it("imposes no limit before the container has been measured", () => {
    expect(fitsWithinBounds(bounds({ containerWidth: 0 }), 800)).toBe(true);
  });
});
