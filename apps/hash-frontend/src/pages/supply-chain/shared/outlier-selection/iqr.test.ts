import { describe, expect, it } from "vitest";

import { IQR_K, computeIqrFences, partitionByFences } from "./iqr";

import type { Observation } from "../types";

function obs(value: number): Observation {
  return { date: "2026-01-15", value };
}

describe("computeIqrFences", () => {
  it("computes Tukey 1.5x fences from quartiles", () => {
    // [10..17, 100]: Q1=12, Q3=16, IQR=4 -> [12 - 6, 16 + 6] = [6, 22]
    const fences = computeIqrFences([10, 11, 12, 13, 14, 15, 16, 17, 100]);
    expect(fences).not.toBeNull();
    expect(fences!.lower).toBeCloseTo(6, 6);
    expect(fences!.upper).toBeCloseTo(22, 6);
  });

  it("honours a custom k multiplier", () => {
    const fences = computeIqrFences([10, 11, 12, 13, 14, 15, 16, 17, 100], 3);
    // IQR=4 -> [12 - 12, 16 + 12] = [0, 28]
    expect(fences!.lower).toBeCloseTo(0, 6);
    expect(fences!.upper).toBeCloseTo(28, 6);
  });

  it("returns null for fewer than 4 points", () => {
    expect(computeIqrFences([1, 2, 3])).toBeNull();
    expect(IQR_K).toBe(1.5);
  });
});

describe("partitionByFences", () => {
  it("splits observations on the fences", () => {
    const fences = computeIqrFences([10, 11, 12, 13, 14, 15, 16, 17, 100]);
    const { kept, excluded } = partitionByFences(
      [10, 11, 12, 13, 14, 15, 16, 17, 100].map(obs),
      fences,
    );
    expect(kept.map((observation) => observation.value)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17,
    ]);
    expect(excluded.map((observation) => observation.value)).toEqual([100]);
  });

  it("keeps everything for a tight distribution (no points beyond fences)", () => {
    const values = [10, 11, 12, 13];
    const { kept, excluded } = partitionByFences(
      values.map(obs),
      computeIqrFences(values),
    );
    expect(kept).toHaveLength(4);
    expect(excluded).toHaveLength(0);
  });

  it("keeps everything when fences are null", () => {
    const { kept, excluded } = partitionByFences([obs(1), obs(2)], null);
    expect(kept).toHaveLength(2);
    expect(excluded).toHaveLength(0);
  });
});
