import { describe, expect, it } from "vitest";

import { selectStat, statOf } from "./measure-context";
import { computeStats } from "./stats";

import type { StepStats } from "./types";

describe("selectStat", () => {
  const stats: StepStats = {
    n: 4,
    mean: 12,
    median: 11,
    std: 1,
    min: 10,
    max: 14,
    p25: 10.5,
    p75: 12.5,
    p85: 13,
    p95: 13.8,
  };

  it("reads the requested measure off a stats block", () => {
    expect(selectStat(stats, "median")).toBe(11);
    expect(selectStat(stats, "mean")).toBe(12);
    expect(selectStat(stats, "p75")).toBe(12.5);
    expect(selectStat(stats, "p95")).toBe(13.8);
  });

  it("returns null for missing stats", () => {
    expect(selectStat(null, "median")).toBeNull();
    expect(selectStat(undefined, "p95")).toBeNull();
  });
});

describe("statOf", () => {
  it("computes mean/median/p75/p95 from a raw value list", () => {
    const values = [10, 20, 30];
    expect(statOf(values, "mean")).toBeCloseTo(20, 6);
    expect(statOf(values, "median")).toBeCloseTo(20, 6);
    expect(statOf(values, "p75")).toBeCloseTo(25, 6);
    expect(statOf(values, "p95")).toBeCloseTo(29, 6);
  });

  it("matches computeStats (modulo rounding) for the median", () => {
    const values = [4, 8, 15, 16, 23, 42];
    expect(statOf(values, "median")).toBeCloseTo(
      computeStats(values).median ?? 0,
      5,
    );
  });

  it("returns null on an empty list", () => {
    expect(statOf([], "median")).toBeNull();
    expect(statOf([], "p95")).toBeNull();
  });
});
