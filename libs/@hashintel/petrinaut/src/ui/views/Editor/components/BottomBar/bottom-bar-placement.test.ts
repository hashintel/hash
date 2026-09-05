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

  it("keeps the left edge when the panels are lopsided too", () => {
    // The right inset alone leaves less than the bar needs, so neither edge
    // can be cleared and the left one wins. A symmetric pair would pass this
    // by arithmetic accident.
    const space = bounds({ leftInset: 120, rightInset: 700 });
    const offset = getBottomBarOffset(space, 400);

    expect((1000 - 400) / 2 + offset).toBe(132);
  });

  it("clears both panels for every width it says fits", () => {
    const space = bounds({ leftInset: 250, rightInset: 350 });
    /** Where the bar ends up, once the offset is applied. */
    const placed = (width: number) => {
      const left =
        (space.containerWidth - width) / 2 + getBottomBarOffset(space, width);
      return { left, right: left + width };
    };

    for (const width of [100, 300, 376]) {
      expect(fitsWithinBounds(space, width)).toBe(true);
      expect(placed(width).left).toBeGreaterThanOrEqual(262);
      expect(placed(width).right).toBeLessThanOrEqual(638);
    }

    // A pixel over, and no position clears both: the left edge is what the
    // offset holds on to.
    expect(fitsWithinBounds(space, 377)).toBe(false);
    expect(placed(377).left).toBe(262);
  });

  it("stays put until the container and the bar have been measured", () => {
    expect(getBottomBarOffset(bounds({ containerWidth: 0 }), 400)).toBe(0);
    expect(getBottomBarOffset(bounds(), 0)).toBe(0);
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
