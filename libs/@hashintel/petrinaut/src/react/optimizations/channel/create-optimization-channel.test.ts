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
  sirNetConstrainedOptimizationInput,
  sirOptimizationInput,
  sirOptimizationMetric,
  sirSwitchConstrainedOptimizationInput,
} from "../sir-optimization-input.fixtures";
import {
  createOptimizationChannel,
  type OptimizationChannelStudy,
} from "./create-optimization-channel";

import type { DetachedObjectiveParametersRequest } from "../../experiments/context";

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

/**
 * Stands in for the sampler's scenario compile: the net's infection rate at
 * twenty times the trial's infected ratio, as the overriding fixture
 * scenario resolves it, and the recovery rate at the scenario's constant.
 */
const fakeResolveParameters = vi.fn(
  (request: DetachedObjectiveParametersRequest) => {
    const ratio = request.scenarioParameterValues.infected_ratio;
    return Promise.resolve({
      infection_rate: typeof ratio === "number" ? ratio * 20 : 3,
      recovery_rate: 0.8,
    });
  },
);

const setup = () => {
  const fake = createFakeDetachedObjectiveRuns();
  const study: OptimizationChannelStudy = {
    cacheKey: "run-1",
    computeBackend: "webgpu",
    trialStarted: vi.fn(),
    trialSettled: vi.fn(),
  };
  fakeResolveParameters.mockClear();
  const channel = createOptimizationChannel({
    runDetachedObjective: fake.runDetachedObjective,
    resolveDetachedObjectiveParameters: fakeResolveParameters,
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

  it("checks a constraint over a net parameter at the value the study's scenario resolves for the trial", async () => {
    const { fake, channel } = setup();
    const at = (ratio: number) => {
      const suggestedValues = { infected_ratio: ratio };
      return trialRequest({
        manifest: sirNetConstrainedOptimizationInput,
        suggestedValues,
        scenarioParameterValues: resolveTrialScenarioParameterValues(
          sirNetConstrainedOptimizationInput,
          suggestedValues,
        ),
      });
    };

    // Rate 3 at a ratio of 0.15: the draw is pruned without a batch.
    const infeasible = await channel.evaluateTrial(at(0.15));
    expect(infeasible).toMatchObject({
      kind: "pruned",
      reason: "Infeasible: Infection rate under two",
      constraints: { infeasible: "rate-cap" },
    });
    expect(infeasible.constraints?.parameters[0]?.margin).toBeCloseTo(-1);
    expect(fakeResolveParameters).toHaveBeenCalledWith({
      cacheKey: "run-1",
      definition: sirNetConstrainedOptimizationInput.model.definition,
      scenarioId: sirNetConstrainedOptimizationInput.scenario.id,
      scenarioParameterValues: { population: 1_000, infected_ratio: 0.15 },
      metric: {
        id: metricId,
        label: sirOptimizationMetric.name,
        code: sirOptimizationMetric.code,
      },
    });
    expect(fake.runs).toHaveLength(0);

    // Rate 1 at a ratio of 0.05: the batch runs, the margin riding along.
    const feasible = channel.evaluateTrial(at(0.05));
    await vi.waitFor(() => expect(fake.runs).toHaveLength(1));
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.3, 1]])],
        runValues: [0.3],
      }),
    );
    const settled = await feasible;
    expect(settled).toMatchObject({
      kind: "objective",
      objective: 0.3,
      constraints: { parameters: [{ constraintId: "rate-cap" }], state: [] },
    });
    expect(settled.constraints?.parameters[0]?.margin).toBeCloseTo(1);
  });

  it("binds a boolean scenario parameter by its type: a constraint over the switch holds for a true draw and prunes a false one", async () => {
    const { fake, channel } = setup();
    const at = (isolation: boolean) => {
      const suggestedValues = { infected_ratio: 0.05, isolation };
      return trialRequest({
        manifest: sirSwitchConstrainedOptimizationInput,
        suggestedValues,
        scenarioParameterValues: resolveTrialScenarioParameterValues(
          sirSwitchConstrainedOptimizationInput,
          suggestedValues,
        ),
      });
    };

    const infeasible = await channel.evaluateTrial(at(false));
    expect(infeasible).toMatchObject({
      kind: "pruned",
      reason: "Infeasible: Isolation on",
      constraints: { infeasible: "isolation-on" },
    });
    expect(infeasible.constraints?.parameters[0]?.margin).toBe(-1);
    expect(fake.runs).toHaveLength(0);

    const feasible = channel.evaluateTrial(at(true));
    await vi.waitFor(() => expect(fake.runs).toHaveLength(1));
    // The batch still compiles the scenario from the 0/1 transport.
    expect(fake.runs[0]?.request.scenarioParameterValues).toEqual({
      population: 1_000,
      infected_ratio: 0.05,
      isolation: 1,
    });
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 180, [[0.3, 1]])],
        runValues: [0.3],
      }),
    );
    await expect(feasible).resolves.toMatchObject({
      kind: "objective",
      objective: 0.3,
      constraints: {
        parameters: [{ constraintId: "isolation-on", margin: 0 }],
        state: [],
      },
    });
  });

  it("prunes a trial as failed to resolve when the scenario does not compile at its values", async () => {
    const { fake, channel } = setup();
    fakeResolveParameters.mockRejectedValueOnce(
      new Error('Scenario parameter "population" must be a finite number.'),
    );
    await expect(
      channel.evaluateTrial(
        trialRequest({ manifest: sirNetConstrainedOptimizationInput }),
      ),
    ).resolves.toEqual({
      kind: "pruned",
      reason: 'Scenario parameter "population" must be a finite number.',
    });
    expect(fake.runs).toHaveLength(0);
  });

  it("runs the state constraints as auxiliary metrics and reports their per-run verdicts with the plain mean objective", async () => {
    const { fake, channel } = setup();
    const outcome = channel.evaluateTrial(
      trialRequest({ manifest: sirConstrainedOptimizationInput }),
    );
    await vi.waitFor(() => expect(fake.runs).toHaveLength(1));
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
    await vi.waitFor(() => expect(fake.runs).toHaveLength(2));
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
      resolveDetachedObjectiveParameters: fakeResolveParameters,
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
