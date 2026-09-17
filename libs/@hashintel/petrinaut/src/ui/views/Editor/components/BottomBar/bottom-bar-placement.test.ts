import { describe, expect, it } from "vitest";

import {
  type BottomBarBounds,
  fitsWithinBounds,
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
  it("leaves the bar width for CSS to resolve against both panel limits", () => {
    expect(
      getBottomBarOffset(bounds({ leftInset: 250, rightInset: 350 })),
    ).toBe("max(calc(-238px + 50%), min(0px, calc(138px - 50%)))");
  });

  it("keeps the left limit authoritative when the panels overlap", () => {
    expect(
      getBottomBarOffset(bounds({ leftInset: 400, rightInset: 700 })),
    ).toBe("max(calc(-88px + 50%), min(0px, calc(-212px - 50%)))");
  });

  it("stays centered until the container has been measured", () => {
    expect(getBottomBarOffset(bounds({ containerWidth: 0 }))).toBe("0px");
  });
});

describe("fitsWithinBounds", () => {
  it("counts both insets and both margins against the container", () => {
    // 1000 - 250 - 350 - 2 x 12
    const space = bounds({ leftInset: 250, rightInset: 350 });

    expect(fitsWithinBounds(space, 376)).toBe(true);
    expect(fitsWithinBounds(space, 377)).toBe(false);
  });

  it("imposes no limit before the container has been measured", () => {
    expect(fitsWithinBounds(bounds({ containerWidth: 0 }), 800)).toBe(true);
  });
});
