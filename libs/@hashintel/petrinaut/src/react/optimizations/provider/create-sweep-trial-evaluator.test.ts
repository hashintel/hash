import { describe, expect, it, vi } from "vitest";

import { lowerConstraint } from "@hashintel/petrinaut-core/hir";
import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core/optimization";

import {
  sirConstrainedOptimizationInput,
  sirOptimizationInput,
  sirOptimizationMetric,
  sirOptimizationScenario,
} from "../sir-optimization-input.fixtures";
import {
  createSweepTrialEvaluator,
  snappedSweepValues,
  sweepPointFor,
} from "./create-sweep-trial-evaluator";

import type { ExperimentParameterAxis } from "../../experiments/parameter-grid";
import type {
  PetrinautOptimizationManifest,
  PetrinautOptimizationTrialRequest,
} from "@hashintel/petrinaut-core/optimization";

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
    manifest: {
      execution: { seedsPerTrial: 8 },
    } as PetrinautOptimizationTrialRequest["manifest"],
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
  it("navigates the sweep to the trial's point with the manifest's runs per trial and reads the metric there", async () => {
    const navigateSweep = vi.fn().mockResolvedValue({
      position: { rate: 25, days: 5 },
      runsCompleted: 8,
      means: { infected: 12.5, other: 1 },
      sampleCounts: { infected: 8, other: 8 },
    });
    const evaluator = createSweepTrialEvaluator({
      experimentId: "exp",
      axes: [RATE, DAYS],
      metricId: "infected",
      navigateSweep,
    });

    const outcome = await evaluator.evaluateTrial(
      request({ rate: 0.5, days: 7 }),
    );
    // An unconstrained manifest reports no constraints at all, not an empty set.
    expect(outcome).toEqual({ kind: "objective", objective: 12.5 });
    expect(outcome).not.toHaveProperty("constraints");
    expect(navigateSweep).toHaveBeenCalledWith(
      "exp",
      { rate: { from: 25, to: 25 }, days: { from: 5, to: 5 } },
      { runCap: 8 },
    );
  });

  it("lets a failed navigation fail the trial rather than prune it", async () => {
    const navigateSweep = vi.fn().mockRejectedValue(new Error("device lost"));
    const evaluator = createSweepTrialEvaluator({
      experimentId: "exp",
      axes: [RATE, DAYS],
      metricId: "infected",
      navigateSweep,
    });

    await expect(
      evaluator.evaluateTrial(request({ rate: 0.5, days: 7 })),
    ).rejects.toThrow("device lost");
  });

  it("prunes a trial the sweep moved past, one without the metric, and one after settling", async () => {
    const navigateSweep = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        position: { rate: 25, days: 5 },
        runsCompleted: 8,
        means: {},
        sampleCounts: {},
      })
      .mockResolvedValue(null);
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

  it("settles once, and swallows the navigation of a sweep that is gone", async () => {
    const navigateSweep = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValue(new Error("The sweep is no longer running"));
    const evaluator = createSweepTrialEvaluator({
      experimentId: "exp",
      axes: [RATE, DAYS],
      metricId: "infected",
      navigateSweep,
    });
    await evaluator.evaluateTrial(request({ rate: 0.5, days: 7 }));

    evaluator.settle(null);
    evaluator.settle(null);
    // The rejected park surfaces nowhere: an unhandled rejection would fail here.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(navigateSweep).toHaveBeenCalledTimes(2);
  });
});

/** The SIR sweep's axis over the infected ratio, 50 positions wide. */
const INFECTED_RATIO: ExperimentParameterAxis = {
  identifier: "infected_ratio",
  min: 0.001,
  max: 0.2,
  stepCount: 50,
  integer: false,
};

const constrainedRequest = (
  manifest: PetrinautOptimizationManifest,
  scenarioParameterValues: Record<string, number>,
): PetrinautOptimizationTrialRequest => ({
  runId: "run",
  trial: 3,
  manifest: {
    ...manifest,
    execution: { ...manifest.execution, seedsPerTrial: 8 },
  },
  suggestedValues: { infected_ratio: scenarioParameterValues.infected_ratio! },
  scenarioParameterValues,
  seeds: [42],
  signal: new AbortController().signal,
});

const sirEvaluator = (
  navigateSweep: Parameters<
    typeof createSweepTrialEvaluator
  >[0]["navigateSweep"],
) =>
  createSweepTrialEvaluator({
    experimentId: "exp",
    axes: [INFECTED_RATIO],
    metricId: sirOptimizationMetric.id,
    navigateSweep,
  });

describe("snappedSweepValues", () => {
  it("overlays each swept axis's value at its position on the request's values", () => {
    expect(
      snappedSweepValues(
        [INFECTED_RATIO],
        { infected_ratio: { from: 25, to: 25 } },
        { population: 1000, infected_ratio: 0.0999 },
      ),
    ).toEqual({ population: 1000, infected_ratio: 0.1005 });
  });
});

describe("createSweepTrialEvaluator with constraints", () => {
  it("prunes an infeasible draw naming the constraint, before the sweep moves", async () => {
    const navigateSweep = vi.fn();
    const evaluator = sirEvaluator(navigateSweep);

    await expect(
      evaluator.evaluateTrial(
        constrainedRequest(sirConstrainedOptimizationInput, {
          population: 1000,
          infected_ratio: 0.15,
        }),
      ),
    ).resolves.toEqual({
      kind: "pruned",
      reason: "Infeasible: Ratio under a tenth",
      constraints: {
        parameters: [
          { constraintId: "ratio-cap", margin: expect.any(Number) as number },
        ],
        state: [],
        infeasible: "ratio-cap",
      },
    });
    expect(navigateSweep).not.toHaveBeenCalled();

    // Nothing was tried, so a stop parks nowhere.
    evaluator.settle(null);
    expect(navigateSweep).not.toHaveBeenCalled();
  });

  it("judges the constraint at the snapped point: a draw just inside the bound that snaps across it is pruned", async () => {
    const navigateSweep = vi.fn();
    const evaluator = sirEvaluator(navigateSweep);

    // 0.0999 satisfies `infected_ratio <= 0.1`; its sweep position is 25,
    // whose value 0.1005 does not.
    await expect(
      evaluator.evaluateTrial(
        constrainedRequest(sirConstrainedOptimizationInput, {
          population: 1000,
          infected_ratio: 0.0999,
        }),
      ),
    ).resolves.toMatchObject({
      kind: "pruned",
      constraints: { infeasible: "ratio-cap" },
    });
    expect(navigateSweep).not.toHaveBeenCalled();
  });

  it("reports the parameter margins and each state constraint's runs passed from the cell's indicator mean", async () => {
    const navigateSweep = vi.fn().mockResolvedValue({
      position: { infected_ratio: 12 },
      runsCompleted: 8,
      means: {
        [sirOptimizationMetric.id]: 0.3,
        "constraint:infected-cap": 0.75,
      },
      sampleCounts: {
        [sirOptimizationMetric.id]: 8,
        "constraint:infected-cap": 8,
      },
    });
    const evaluator = sirEvaluator(navigateSweep);

    const outcome = await evaluator.evaluateTrial(
      constrainedRequest(sirConstrainedOptimizationInput, {
        population: 1000,
        infected_ratio: 0.05,
      }),
    );

    expect(outcome).toEqual({
      kind: "objective",
      objective: 0.3,
      constraints: {
        parameters: [
          { constraintId: "ratio-cap", margin: expect.any(Number) as number },
        ],
        state: [{ constraintId: "infected-cap", runsPassed: 6, runsTotal: 8 }],
      },
    });
    expect(navigateSweep).toHaveBeenCalledWith(
      "exp",
      { infected_ratio: { from: 12, to: 12 } },
      { runCap: 8 },
    );
  });

  it("prunes a trial whose point measured no verdict for a declared state constraint", async () => {
    const navigateSweep = vi.fn().mockResolvedValue({
      position: { infected_ratio: 12 },
      runsCompleted: 8,
      means: { [sirOptimizationMetric.id]: 0.3 },
      sampleCounts: { [sirOptimizationMetric.id]: 8 },
    });

    await expect(
      sirEvaluator(navigateSweep).evaluateTrial(
        constrainedRequest(sirConstrainedOptimizationInput, {
          population: 1000,
          infected_ratio: 0.05,
        }),
      ),
    ).resolves.toMatchObject({
      kind: "pruned",
      reason: /^The point measured no verdict for "/u,
    });
  });

  it("binds the request's fixed values for the interpreter: the same draw is feasible or not by the population it came with", async () => {
    const lowered = lowerConstraint(
      {
        space: "parameters",
        id: "initial-cases",
        name: "Under 100 initial cases",
        code: "scenario.infected_ratio * scenario.population <= 100",
      },
      {
        netParameters: sirOptimizationInput.model.definition.parameters,
        scenarioParameters: sirOptimizationScenario.scenarioParameters,
        sdcpn: sirOptimizationInput.model.definition,
      },
    );
    if (!lowered.ok) {
      throw new Error(lowered.diagnostics[0]?.message ?? "constraint");
    }
    const manifest = petrinautOptimizationInputSchema.parse({
      ...sirOptimizationInput,
      constraints: [lowered.constraint],
    });
    const navigateSweep = vi.fn().mockResolvedValue({
      position: { infected_ratio: 12 },
      runsCompleted: 8,
      means: { [sirOptimizationMetric.id]: 0.3 },
      sampleCounts: { [sirOptimizationMetric.id]: 8 },
    });
    const evaluator = sirEvaluator(navigateSweep);

    // Position 12 is a ratio of 0.04876: 48.76 cases of 1000, 243.8 of 5000.
    await expect(
      evaluator.evaluateTrial(
        constrainedRequest(manifest, {
          population: 1000,
          infected_ratio: 0.05,
        }),
      ),
    ).resolves.toMatchObject({ kind: "objective", objective: 0.3 });
    await expect(
      evaluator.evaluateTrial(
        constrainedRequest(manifest, {
          population: 5000,
          infected_ratio: 0.05,
        }),
      ),
    ).resolves.toMatchObject({
      kind: "pruned",
      reason: "Infeasible: Under 100 initial cases",
    });
    expect(navigateSweep).toHaveBeenCalledTimes(1);
  });
});
