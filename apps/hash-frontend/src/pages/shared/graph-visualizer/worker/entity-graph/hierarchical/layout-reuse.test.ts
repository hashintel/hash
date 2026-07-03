import { describe, expect, it } from "vitest";

import {
  GROWTH_RELAYOUT_TOLERANCE_FRAC,
  layoutNeedsRebuild,
  layoutOutgrown,
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
    // a: 40 -> 55 (nearly +40%). Edge-to-edge gap shrinks 20 -> 5 but there
    // is no overlap despite growth, so the layout must be kept (anti-churn case).
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

describe("layoutOutgrown", () => {
  const buildTime = [
    { id: "a", radius: 40 },
    { id: "b", radius: 40 },
  ] as const;

  it("re-warms once a child grows past the threshold", () => {
    const past = 40 * (1 + GROWTH_RELAYOUT_TOLERANCE_FRAC) + 1;
    expect(
      layoutOutgrown(buildTime, [
        { id: "a", radius: past },
        { id: "b", radius: 40 },
      ]),
    ).toBe(true);
  });

  it("keeps the layout while growth stays within the threshold", () => {
    const within = 40 * (1 + GROWTH_RELAYOUT_TOLERANCE_FRAC) - 1;
    expect(
      layoutOutgrown(buildTime, [
        { id: "a", radius: within },
        { id: "b", radius: within },
      ]),
    ).toBe(false);
  });

  it("never re-warms on a shrink", () => {
    expect(
      layoutOutgrown(buildTime, [
        { id: "a", radius: 10 },
        { id: "b", radius: 5 },
      ]),
    ).toBe(false);
  });

  it("ignores ids not present when the layout was built", () => {
    // A genuinely new cluster is layoutNeedsRebuild's job (count change), not
    // this growth check, so an unknown id alone must not trigger a re-warm.
    expect(layoutOutgrown(buildTime, [{ id: "z", radius: 9_999 }])).toBe(false);
  });
});
