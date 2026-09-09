import { describe, expect, it, vi } from "vitest";

import {
  resolveTrialScenarioParameterValues,
  type PetrinautOptimizationTrialRequest,
} from "@hashintel/petrinaut-core/optimization";

import {
  completedRunResult,
  createFakeDetachedObjectiveRuns,
  distributionFrame,
  failedRunOutcome,
} from "../fake-detached-objective-runs.fixtures";
import {
  sirConstrainedOptimizationInput,
  sirOptimizationInput,
  sirOptimizationMetric,
} from "../sir-optimization-input.fixtures";
import {
  createOptimizationChannel,
  type OptimizationChannelStudy,
} from "./create-optimization-channel";

const metricId = sirOptimizationMetric.id;

const trialRequest = (
  overrides: Partial<PetrinautOptimizationTrialRequest> = {},
): PetrinautOptimizationTrialRequest => {
  const suggestedValues = { infected_ratio: 0.05 };
  return {
    runId: "run-1",
    trial: 0,
    manifest: sirOptimizationInput,
    suggestedValues,
    scenarioParameterValues: resolveTrialScenarioParameterValues(
      sirOptimizationInput,
      suggestedValues,
    ),
    seeds: [1, 2, 3],
    signal: new AbortController().signal,
    ...overrides,
  };
};

const setup = () => {
  const fake = createFakeDetachedObjectiveRuns();
  const study: OptimizationChannelStudy = {
    cacheKey: "run-1",
    computeBackend: "webgpu",
    trialStarted: vi.fn(),
    trialSettled: vi.fn(),
  };
  const channel = createOptimizationChannel({
    runDetachedObjective: fake.runDetachedObjective,
    resolveStudy: (runId) => (runId === "run-1" ? study : null),
  });
  return { fake, study, channel };
};

describe("createOptimizationChannel", () => {
  it("runs a trial on the study's backend with its seeds pinned, and reports the mean of the per-seed finals", async () => {
    const { fake, study, channel } = setup();

    const outcome = channel.evaluateTrial(trialRequest());
    expect(fake.runs[0]?.request).toMatchObject({
      cacheKey: "run-1",
      scenarioId: sirOptimizationInput.scenario.id,
      scenarioParameterValues: { population: 1_000, infected_ratio: 0.05 },
      metric: { id: metricId, label: sirOptimizationMetric.name },
      seed: 1,
      runCount: 3,
      runSeeds: [1, 2, 3],
      dt: 1,
      maxTime: 180,
      computeBackend: "webgpu",
    });
    expect(study.trialStarted).toHaveBeenCalledWith(
      0,
      { infected_ratio: 0.05 },
      fake.runs[0]!.run,
      3,
    );
    expect(fake.runs[0]?.request.queueKey).toBe("run-1:trial:0");

    const result = completedRunResult({
      metricId,
      frames: [distributionFrame(metricId, 180, [[0.25, 3]])],
      runValues: [0.5, 0.25, 0],
    });
    fake.runs[0]!.settle(result);
    await expect(outcome).resolves.toEqual({
      kind: "objective",
      objective: 0.25,
    });
    expect(study.trialSettled).toHaveBeenCalledWith(0, result);
  });

  it("reads the objective off the last sampled frame when the backend reports no run axis", async () => {
    const { fake, channel } = setup();

    const outcome = channel.evaluateTrial(trialRequest());
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [
          distributionFrame(metricId, 1, [[0.9, 3]]),
          distributionFrame(metricId, 180, [
            [0.1, 1],
            [0.3, 1],
          ]),
        ],
        runsCompleted: 3,
        computeBackend: "webgpu",
      }),
    );
    await expect(outcome).resolves.toEqual({
      kind: "objective",
      objective: 0.2,
    });
  });

  it("prunes a batch that did not complete with the batch's own reason, cancellation included", async () => {
    const { fake, channel } = setup();

    const failed = channel.evaluateTrial(trialRequest());
    fake.runs[0]!.settle(failedRunOutcome("2 of 3 runs failed"));
    await expect(failed).resolves.toEqual({
      kind: "pruned",
      reason: "2 of 3 runs failed",
    });

    const controller = new AbortController();
    const cancelled = channel.evaluateTrial(
      trialRequest({ trial: 1, signal: controller.signal }),
    );
    controller.abort();
    await expect(cancelled).resolves.toEqual({
      kind: "pruned",
      reason: "cancelled",
    });
    expect(fake.runs[1]!.cancelled).toBe(true);

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      channel.evaluateTrial(trialRequest({ trial: 2, signal: aborted.signal })),
    ).resolves.toEqual({ kind: "pruned", reason: "cancelled" });
    expect(fake.runs).toHaveLength(2);
  });

  it("prunes a trial whose objective is not finite", async () => {
    const { fake, channel } = setup();

    const outcome = channel.evaluateTrial(trialRequest());
    fake.runs[0]!.settle(
      completedRunResult({ metricId, frames: [], runsCompleted: 3 }),
    );
    await expect(outcome).resolves.toEqual({
      kind: "pruned",
      reason: `The objective metric "${metricId}" did not produce a finite value`,
    });
  });

  it("evaluates a run the provider does not know on the CPU, unwatched", async () => {
    const { fake, study, channel } = setup();

    const outcome = channel.evaluateTrial(trialRequest({ runId: "unknown" }));
    expect(fake.runs[0]?.request.computeBackend).toBe("cpu");
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.3, 1]])],
        runValues: [0.3],
      }),
    );
    await expect(outcome).resolves.toMatchObject({
      kind: "objective",
      objective: 0.3,
    });
    expect(study.trialStarted).not.toHaveBeenCalled();
  });

  it("prunes an infeasible draw before any simulation, naming the constraint it broke", async () => {
    const { fake, study, channel } = setup();
    const suggestedValues = { infected_ratio: 0.15 };

    const outcome = await channel.evaluateTrial(
      trialRequest({
        manifest: sirConstrainedOptimizationInput,
        suggestedValues,
        scenarioParameterValues: resolveTrialScenarioParameterValues(
          sirConstrainedOptimizationInput,
          suggestedValues,
        ),
      }),
    );
    expect(outcome).toMatchObject({
      kind: "pruned",
      reason: "Infeasible: Ratio under a tenth",
      constraints: {
        parameters: [{ constraintId: "ratio-cap" }],
        state: [],
        infeasible: "ratio-cap",
      },
    });
    expect(outcome.constraints?.parameters[0]?.margin).toBeCloseTo(-0.05);
    expect(fake.runs).toHaveLength(0);
    expect(study.trialStarted).not.toHaveBeenCalled();
  });

  it("runs the state constraints as auxiliary metrics and reports their per-run verdicts with the plain mean objective", async () => {
    const { fake, channel } = setup();
    const outcome = channel.evaluateTrial(
      trialRequest({ manifest: sirConstrainedOptimizationInput }),
    );
    const request = fake.runs[0]?.request;
    expect(request?.auxiliaryMetrics).toHaveLength(1);
    expect(request?.auxiliaryMetrics?.[0]).toMatchObject({
      id: "infected-cap",
      aggregateTime: "min",
    });

    fake.runs[0]!.settle({
      ...completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.25, 3]])],
        runValues: [0.5, 0.25, 0],
      }),
      runResults: new Map([
        [0, { [metricId]: 0.5, "infected-cap": 1 }],
        [1, { [metricId]: 0.25, "infected-cap": 0 }],
        [2, { [metricId]: 0, "infected-cap": 1 }],
      ]),
    });
    const settled = await outcome;
    expect(settled).toMatchObject({
      kind: "objective",
      objective: 0.25,
      constraints: {
        parameters: [{ constraintId: "ratio-cap" }],
        state: [{ constraintId: "infected-cap", runsPassed: 2, runsTotal: 3 }],
      },
    });
    expect(settled.constraints?.parameters[0]?.margin).toBeCloseTo(0.05);

    // The indicators are emitted once per run id.
    const second = channel.evaluateTrial(
      trialRequest({ manifest: sirConstrainedOptimizationInput, trial: 1 }),
    );
    expect(fake.runs[1]?.request.auxiliaryMetrics?.[0]?.artifact).toBe(
      request?.auxiliaryMetrics?.[0]?.artifact,
    );
    fake.runs[1]!.settle(failedRunOutcome("2 of 3 runs failed"));
    await expect(second).resolves.toEqual({
      kind: "pruned",
      reason: "2 of 3 runs failed",
    });
  });

  it("attaches no constraints and runs no auxiliary metrics for a study without any", async () => {
    const { fake, channel } = setup();
    const outcome = channel.evaluateTrial(trialRequest());
    expect(fake.runs[0]?.request.auxiliaryMetrics).toBeUndefined();
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.3, 1]])],
        runValues: [0.3],
      }),
    );
    await expect(outcome).resolves.toEqual({
      kind: "objective",
      objective: 0.3,
    });
  });

  it("never throws: a failing run request becomes a pruned trial, and dispose cancels runs in flight", async () => {
    const throwing = createOptimizationChannel({
      runDetachedObjective: () => {
        throw new Error("no compute");
      },
      resolveStudy: () => null,
    });
    await expect(throwing.evaluateTrial(trialRequest())).resolves.toEqual({
      kind: "pruned",
      reason: "no compute",
    });

    const { fake, channel } = setup();
    const outcome = channel.evaluateTrial(trialRequest());
    channel.dispose();
    expect(fake.runs[0]!.cancelled).toBe(true);
    await expect(outcome).resolves.toEqual({
      kind: "pruned",
      reason: "cancelled",
    });
  });
});
