import { afterEach, describe, expect, it, vi } from "vitest";

import { sweepRangeDraws } from "./selection-draws";

describe("sweepRangeDraws", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws a batch shorter than one stride in one task, however slow the clock says it was", async () => {
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      clock += 1000;
      return clock;
    });
    const axis = {
      identifier: "x",
      min: 0,
      max: 2,
      stepCount: 2,
      integer: false,
    };
    let drawn = false;
    void sweepRangeDraws(1, [axis], { x: { from: 0, to: 2 } }, 0, 8).then(
      () => {
        drawn = true;
      },
    );

    await Promise.resolve();

    expect(drawn).toBe(true);
  });

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
