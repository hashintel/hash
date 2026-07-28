import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  makeNode,
  obs,
  stepFrom,
  timingSeriesFrom,
} from "./observation-fixtures";
import {
  filterGraphNodeByDateRange,
  filterStepByDateRange,
} from "./range-filter";

describe("filterStepByDateRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const tightStep = () =>
    stepFrom([
      obs("2026-01", 10),
      obs("2026-02", 12),
      obs("2026-03", 11),
      obs("2026-04", 13),
    ]);

  it("windows observations to the cutoff and recomputes stats", () => {
    // now=2026-06 -> 3m cutoff = 2026-04; keep months >= 2026-04.
    const out = filterStepByDateRange(tightStep(), "3m", true);
    expect(out.observations.map((observation) => observation.value)).toEqual([
      13,
    ]);
    expect(out.durations).toEqual([13]);
    expect(out.stats.n).toBe(1);
    expect(out.stats.median).toBe(13);
  });

  it("keeps the full series for the 12m window", () => {
    const out = filterStepByDateRange(tightStep(), "12m", true);
    expect(out.observations.map((observation) => observation.value)).toEqual([
      10, 12, 11, 13,
    ]);
  });

  it("computes the mean fence over full history before windowing", () => {
    const step = stepFrom([
      obs("2026-01", 2),
      obs("2026-02", 2),
      obs("2026-03", 3),
      obs("2026-03", 4),
      obs("2026-03", 5),
      obs("2026-04", 1),
      obs("2026-05", 1),
      obs("2026-06", 1),
      obs("2026-06", 4),
    ]);
    const out = filterStepByDateRange(step, "3m", true);

    expect(out.observations).toHaveLength(4);
    expect(out.stats.mean).toBe(1.8);
    expect(out.stats.p95).toBe(3.5);
  });

  it("windows the secondary complete_timing series to the cutoff too", () => {
    const step = tightStep();
    step.complete_timing = timingSeriesFrom([
      obs("2026-01", 20),
      obs("2026-02", 22),
      obs("2026-03", 24),
      obs("2026-04", 26),
    ]);
    // now=2026-06 -> 3m cutoff = 2026-04; keep months >= 2026-04.
    const out = filterStepByDateRange(step, "3m", true);
    expect(
      out.complete_timing?.observations.map((observation) => observation.value),
    ).toEqual([26]);
    expect(out.complete_timing?.stats.n).toBe(1);
    expect(out.complete_timing?.stats.median).toBe(26);
  });
});

describe("filterGraphNodeByDateRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns the full series for the 12m window", () => {
    const out = filterGraphNodeByDateRange(makeNode(), "12m", true);
    expect(out.observations?.map((observation) => observation.value)).toEqual([
      10, 12, 11, 13,
    ]);
  });

  it("windows observations + monthly to the cutoff and recomputes stats", () => {
    // now=2026-06 -> 3m cutoff = 2026-04; keep months >= 2026-04.
    const out = filterGraphNodeByDateRange(makeNode(), "3m", true);
    expect(out.observations?.map((observation) => observation.value)).toEqual([
      13,
    ]);
    expect(out.monthly?.map((month) => month.month)).toEqual(["2026-04"]);
    expect(out.stats.n).toBe(1);
    expect(out.stats.median).toBe(13);
  });

  it("computes the node mean fence over full history before windowing", () => {
    const observations = [
      obs("2026-01", 2),
      obs("2026-02", 2),
      obs("2026-03", 3),
      obs("2026-03", 4),
      obs("2026-03", 5),
      obs("2026-04", 1),
      obs("2026-05", 1),
      obs("2026-06", 1),
      obs("2026-06", 4),
    ];
    const out = filterGraphNodeByDateRange(
      makeNode({
        observations,
        stats: stepFrom(observations).stats,
      }),
      "3m",
      true,
    );

    expect(out.observations).toHaveLength(4);
    expect(out.mean_observations).toBeUndefined();
    expect(out.stats.mean).toBe(1.8);
    expect(out.stats.p95).toBe(3.5);
  });
});
