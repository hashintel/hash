import { describe, expect, it, vi } from "vitest";

import {
  createSweepTrialEvaluator,
  SWEEP_TRIAL_RUNS,
  sweepPointFor,
} from "./create-sweep-trial-evaluator";

import type { ExperimentParameterAxis } from "../../experiments/parameter-grid";
import type { PetrinautOptimizationTrialRequest } from "@hashintel/petrinaut-core/optimization";

const RATE: ExperimentParameterAxis = {
  identifier: "rate",
  min: 0,
  max: 1,
  stepCount: 50,
  integer: false,
};
const DAYS: ExperimentParameterAxis = {
  identifier: "days",
  min: 2,
  max: 20,
  stepCount: 18,
  integer: true,
};

const request = (
  suggestedValues: Record<string, number | boolean>,
  aborted = false,
): PetrinautOptimizationTrialRequest =>
  ({
    runId: "run",
    trial: 3,
    manifest: {} as PetrinautOptimizationTrialRequest["manifest"],
    suggestedValues,
    scenarioParameterValues: {},
    seeds: [42],
    signal: { aborted } as AbortSignal,
  }) as PetrinautOptimizationTrialRequest;

describe("sweepPointFor", () => {
  it("quantizes a suggestion onto the sweep's positions", () => {
    expect(sweepPointFor([RATE, DAYS], { rate: 0.503, days: 7.4 })).toEqual({
      rate: { from: 25, to: 25 },
      days: { from: 5, to: 5 },
    });
  });

  it("refuses a suggestion missing an axis or with a boolean", () => {
    expect(sweepPointFor([RATE, DAYS], { rate: 0.5 })).toBeNull();
    expect(sweepPointFor([RATE, DAYS], { rate: 0.5, days: true })).toBeNull();
  });
});

describe("createSweepTrialEvaluator", () => {
  it("navigates the sweep to the trial's point with the trial cap and reads the metric there", async () => {
    const navigateSweep = vi.fn().mockResolvedValue({
      position: { rate: 25, days: 5 },
      runsCompleted: 8,
      means: { infected: 12.5, other: 1 },
    });
    const evaluator = createSweepTrialEvaluator({
      experimentId: "exp",
      axes: [RATE, DAYS],
      metricId: "infected",
      navigateSweep,
    });

    await expect(
      evaluator.evaluateTrial(request({ rate: 0.5, days: 7 })),
    ).resolves.toEqual({ kind: "objective", objective: 12.5 });
    expect(navigateSweep).toHaveBeenCalledWith(
      "exp",
      { rate: { from: 25, to: 25 }, days: { from: 5, to: 5 } },
      { runCap: SWEEP_TRIAL_RUNS },
    );
  });

  it("prunes a trial the sweep moved past, one without the metric, and one after settling", async () => {
    const navigateSweep = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        position: { rate: 25, days: 5 },
        runsCompleted: 8,
        means: {},
      });
    const evaluator = createSweepTrialEvaluator({
      experimentId: "exp",
      axes: [RATE, DAYS],
      metricId: "infected",
      navigateSweep,
    });

    await expect(
      evaluator.evaluateTrial(request({ rate: 0.5, days: 7 })),
    ).resolves.toMatchObject({ kind: "pruned", reason: /moved on/u });
    await expect(
      evaluator.evaluateTrial(request({ rate: 0.5, days: 7 })),
    ).resolves.toMatchObject({ kind: "pruned", reason: /no finite value/u });

    evaluator.settle({
      trial: 1,
      parameters: { rate: 0.2, days: 4 },
      objective: 3,
    });
    await expect(
      evaluator.evaluateTrial(request({ rate: 0.5, days: 7 })),
    ).resolves.toMatchObject({ kind: "pruned", reason: "cancelled" });
    // Settling parks the sweep on the best point with no cap.
    expect(navigateSweep).toHaveBeenLastCalledWith("exp", {
      rate: { from: 10, to: 10 },
      days: { from: 2, to: 2 },
    });
  });

  it("parks a stopped study's sweep on the point it was trying, with no cap", async () => {
    const navigateSweep = vi.fn().mockResolvedValue(null);
    const evaluator = createSweepTrialEvaluator({
      experimentId: "exp",
      axes: [RATE, DAYS],
      metricId: "infected",
      navigateSweep,
    });

    await evaluator.evaluateTrial(request({ rate: 0.5, days: 7 }));
    evaluator.settle(null);

    expect(navigateSweep).toHaveBeenCalledTimes(2);
    expect(navigateSweep).toHaveBeenLastCalledWith("exp", {
      rate: { from: 25, to: 25 },
      days: { from: 5, to: 5 },
    });
  });

  it("re-parks a stopped study's sweep on the best step when the completion lands after the stop", async () => {
    const navigateSweep = vi.fn().mockResolvedValue(null);
    const evaluator = createSweepTrialEvaluator({
      experimentId: "exp",
      axes: [RATE, DAYS],
      metricId: "infected",
      navigateSweep,
    });

    await evaluator.evaluateTrial(request({ rate: 0.5, days: 7 }));
    // Stop parks on the point being tried; the worker's complete event,
    // carrying the best, arrives afterwards.
    evaluator.settle(null);
    evaluator.settle({
      trial: 1,
      parameters: { rate: 0.2, days: 4 },
      objective: 3,
    });

    expect(navigateSweep).toHaveBeenCalledTimes(3);
    expect(navigateSweep).toHaveBeenLastCalledWith("exp", {
      rate: { from: 10, to: 10 },
      days: { from: 2, to: 2 },
    });

    // Once parked on the best, further settles change nothing.
    evaluator.settle(null);
    evaluator.settle({
      trial: 2,
      parameters: { rate: 0.9, days: 19 },
      objective: 4,
    });
    expect(navigateSweep).toHaveBeenCalledTimes(3);
  });

  it("parks a stopped study's sweep once, however many settles carry no best", async () => {
    const navigateSweep = vi.fn().mockResolvedValue(null);
    const evaluator = createSweepTrialEvaluator({
      experimentId: "exp",
      axes: [RATE, DAYS],
      metricId: "infected",
      navigateSweep,
    });

    await evaluator.evaluateTrial(request({ rate: 0.5, days: 7 }));
    evaluator.settle(null);
    evaluator.settle(undefined);

    expect(navigateSweep).toHaveBeenCalledTimes(2);
  });

  it("leaves the sweep alone when a study settles before any trial", () => {
    const navigateSweep = vi.fn();
    createSweepTrialEvaluator({
      experimentId: "exp",
      axes: [RATE, DAYS],
      metricId: "infected",
      navigateSweep,
    }).settle(undefined);
    expect(navigateSweep).not.toHaveBeenCalled();
  });
});
