// eslint-disable-next-line import/no-extraneous-dependencies -- vitest is provided by the monorepo; the frontend's own test runner is not yet wired up.
import { describe, expect, it } from "vitest";

import {
  layoutNeedsRebuild,
  OVERLAP_REBUILD_TOLERANCE_FRAC,
} from "./layout-reuse";

/** Two bubbles 100 apart on the x-axis; radii supplied per case. */
const pairAt = (radiusA: number, radiusB: number) =>
  ({
    previous: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
    ],
    current: [
      { id: "a", radius: radiusA },
      { id: "b", radius: radiusB },
    ],
  }) as const;

describe("layoutNeedsRebuild", () => {
  it("reuses a layout whose children still fit", () => {
    const { previous, current } = pairAt(40, 40); // gap of 20
    expect(layoutNeedsRebuild(previous, current)).toBe(false);
  });

  it("rebuilds when the child count changes", () => {
    expect(
      layoutNeedsRebuild(
        [{ id: "a", x: 0, y: 0 }],
        [
          { id: "a", radius: 10 },
          { id: "b", radius: 10 },
        ],
      ),
    ).toBe(true);
  });

  it("rebuilds when a child id is swapped (same count)", () => {
    expect(
      layoutNeedsRebuild([{ id: "a", x: 0, y: 0 }], [{ id: "b", radius: 10 }]),
    ).toBe(true);
  });

  it("reuses a big growth that still has slack (no churn)", () => {
    // a: 40 -> 55 (nearly +40%). Edge-to-edge gap shrinks 20 -> 5 but they do
    // NOT overlap, so the layout must be kept — this is the anti-churn case.
    const { previous, current } = pairAt(55, 40);
    expect(layoutNeedsRebuild(previous, current)).toBe(false);
  });

  it("rebuilds on the reported bug: growth that overlaps a neighbour", () => {
    // a balloons to 224 (the 70 -> 2000 case); it now buries b at distance 100.
    const { previous, current } = pairAt(224, 12);
    expect(layoutNeedsRebuild(previous, current)).toBe(true);
  });

  it("does NOT rebuild on a shrink (it only frees space)", () => {
    const { previous, current } = pairAt(10, 10); // far smaller than the gap
    expect(layoutNeedsRebuild(previous, current)).toBe(false);
  });

  it("tolerates a penetration within the dead-band, rebuilds just past it", () => {
    // minDist = rA + rB; penetration = minDist - 100. Tolerance is a fraction of
    // the smaller radius. With rB = 50, tolerance = 0.05 * 50 = 2.5.
    const tol = OVERLAP_REBUILD_TOLERANCE_FRAC * 50;
    expect(tol).toBeCloseTo(2.5);
    // penetration = (52 + 50) - 100 = 2 (< 2.5) -> reuse.
    const within = pairAt(52, 50);
    expect(layoutNeedsRebuild(within.previous, within.current)).toBe(false);
    // penetration = (53 + 50) - 100 = 3 (> 2.5) -> rebuild.
    const past = pairAt(53, 50);
    expect(layoutNeedsRebuild(past.previous, past.current)).toBe(true);
  });

  it("rebuilds when only ONE of many children grows into a neighbour", () => {
    expect(
      layoutNeedsRebuild(
        [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 100, y: 0 },
          { id: "c", x: 0, y: 100 },
        ],
        [
          { id: "a", radius: 20 },
          { id: "b", radius: 90 }, // reaches back across the 100 gap into a
          { id: "c", radius: 20 },
        ],
      ),
    ).toBe(true);
  });
});
