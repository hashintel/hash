import { describe, expect, it } from "vitest";

import { enclosingRadius } from "./cluster-tree";

// Top-level minimum radius (`TOP_LEVEL_MIN_RADIUS` = 15) for a count-6 leaf-sized bubble.
const TOP_LEVEL_FLOOR = 15;

describe("enclosingRadius", () => {
  it("is 0 for no children", () => {
    expect(enclosingRadius([], 2)).toBe(0);
  });

  it("is the child radius for a single child", () => {
    expect(enclosingRadius([10], 2)).toBe(10);
  });

  it("sums the radii (+gap) for two children placed side by side", () => {
    expect(enclosingRadius([8, 8], 2)).toBe(18);
    expect(enclosingRadius([11, 8], 2)).toBe(21);
  });

  it("ignores child order (uses the two largest)", () => {
    expect(enclosingRadius([8, 11], 2)).toBe(enclosingRadius([11, 8], 2));
  });

  it("regression: two r=8 children need MORE than a count-6 leaf radius (15)", () => {
    // The Company family was sized 15 by count but had to hold two r=8 children
    // → overlap. The enclosing radius must exceed 15 so the container grows.
    expect(enclosingRadius([8, 8], 2)).toBeGreaterThan(TOP_LEVEL_FLOOR);
  });

  it("places 3+ children on a ring (radius = ring + largest child)", () => {
    const expected = (5 + 5 + 2) / (2 * Math.sin(Math.PI / 3)) + 5;
    expect(enclosingRadius([5, 5, 5], 2)).toBeCloseTo(expected, 6);
  });

  it("grows as more equal children are added", () => {
    expect(enclosingRadius([6, 6, 6, 6], 2)).toBeGreaterThan(
      enclosingRadius([6, 6], 2),
    );
  });
});
