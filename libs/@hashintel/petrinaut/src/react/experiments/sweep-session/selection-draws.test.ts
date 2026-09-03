import { describe, expect, it } from "vitest";

import { sweepRangeDraws } from "./selection-draws";

describe("sweepRangeDraws", () => {
  it("draws every value of an integer axis equally often", async () => {
    const axis = {
      identifier: "n",
      min: 0,
      max: 2,
      stepCount: 2,
      integer: true,
    };
    const draws = await sweepRangeDraws(
      1,
      [axis],
      { n: { from: 0, to: 2 } },
      0,
      3000,
    );

    if (draws === undefined) {
      throw new Error("a ranged axis must produce draws");
    }
    const counts = new Map<number, number>();
    for (const value of draws.values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    expect([...counts.keys()].sort((left, right) => left - right)).toEqual([
      0, 1, 2,
    ]);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(900);
      expect(count).toBeLessThan(1100);
    }
  });
});
