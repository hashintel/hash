import { describe, expect, it } from "vitest";

import {
  describeSweepObjective,
  EMPTY_SWEEP_OBJECTIVE,
  resolveObjectiveMetricId,
  sweepObjectiveError,
  sweepObjectiveFor,
  type SweepObjectiveDraft,
} from "./sweep-objective";

const metrics = [{ id: "peak" }, { id: "cost" }];

/** The drawer's defaults: 1,800 simulation steps per run, 8 runs a step. */
const execution = { dt: 0.1, maxTime: 180, runsPerStep: 8 };

describe("resolveObjectiveMetricId", () => {
  it("resolves the chosen draft while it exists", () => {
    expect(
      resolveObjectiveMetricId(
        { ...EMPTY_SWEEP_OBJECTIVE, metricId: "cost" },
        metrics,
      ),
    ).toBe("cost");
  });

  it("falls back to the first draft when the chosen one is gone, or none was chosen", () => {
    expect(
      resolveObjectiveMetricId(
        { ...EMPTY_SWEEP_OBJECTIVE, metricId: "removed" },
        metrics,
      ),
    ).toBe("peak");
    expect(resolveObjectiveMetricId(EMPTY_SWEEP_OBJECTIVE, metrics)).toBe(
      "peak",
    );
  });

  it("resolves to nothing without drafts", () => {
    expect(
      resolveObjectiveMetricId(
        { ...EMPTY_SWEEP_OBJECTIVE, metricId: "peak" },
        [],
      ),
    ).toBeNull();
  });
});

describe("sweepObjectiveError", () => {
  const draft = (steps: number | null): SweepObjectiveDraft => ({
    ...EMPTY_SWEEP_OBJECTIVE,
    steps,
  });

  it("asks for a metric first", () => {
    expect(sweepObjectiveError(draft(30), null, execution)).toBe(
      "Add a metric to optimize",
    );
  });

  it("asks for 1 to 1,000 steps for a blank, zero or over-cap count", () => {
    const message = "Ask for 1 to 1,000 steps";
    expect(sweepObjectiveError(draft(null), "peak", execution)).toBe(message);
    expect(sweepObjectiveError(draft(0), "peak", execution)).toBe(message);
    expect(sweepObjectiveError(draft(1_001), "peak", execution)).toBe(message);
    expect(sweepObjectiveError(draft(2.5), "peak", execution)).toBe(message);
  });

  it("names the per-run cap when one run alone is over it", () => {
    expect(
      sweepObjectiveError(draft(30), "peak", {
        dt: 0.001,
        maxTime: 200,
        runsPerStep: 8,
      }),
    ).toBe("Each run would take 200,000 steps; the optimizer allows 100,000");
  });

  it("names the total budget when the steps together are over it", () => {
    expect(
      sweepObjectiveError(draft(1_000), "peak", {
        dt: 0.1,
        maxTime: 1_000,
        runsPerStep: 8,
      }),
    ).toBe(
      "1,000 steps × 8 runs × 10,000 simulation steps is over the optimizer's 5,000,000 budget",
    );
  });

  it("is clean at the defaults", () => {
    expect(sweepObjectiveError(draft(30), "peak", execution)).toBeNull();
  });

  it("leaves a time step that makes no run to the experiment's own validation", () => {
    expect(
      sweepObjectiveError(draft(30), "peak", {
        dt: 0,
        maxTime: 180,
        runsPerStep: 8,
      }),
    ).toBeNull();
  });
});

describe("sweepObjectiveFor", () => {
  it("is the objective exactly when there is no error", () => {
    const clean: SweepObjectiveDraft = {
      metricId: "cost",
      direction: "minimize",
      steps: 12,
    };
    expect(sweepObjectiveFor(clean, "cost", execution)).toEqual({
      metricId: "cost",
      direction: "minimize",
      steps: 12,
    });
    expect(sweepObjectiveFor(clean, null, execution)).toBeNull();
    expect(
      sweepObjectiveFor({ ...clean, steps: 1_001 }, "cost", execution),
    ).toBeNull();
    expect(
      sweepObjectiveFor(clean, "cost", {
        dt: 0.001,
        maxTime: 200,
        runsPerStep: 8,
      }),
    ).toBeNull();
  });

  it("reads the resolved metric, not the draft's stale choice", () => {
    expect(
      sweepObjectiveFor(
        { ...EMPTY_SWEEP_OBJECTIVE, metricId: "removed" },
        "peak",
        execution,
      ),
    ).toMatchObject({ metricId: "peak" });
  });
});

describe("describeSweepObjective", () => {
  it("counts the steps and the runs each computes", () => {
    expect(describeSweepObjective(30, 8)).toBe(
      "30 steps · 8 runs each — the best point then refines to your run budget",
    );
    expect(describeSweepObjective(1, 8)).toBe(
      "1 step · 8 runs each — the best point then refines to your run budget",
    );
  });
});
