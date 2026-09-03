import { describe, expect, it } from "vitest";

import {
  cancelledRunOutcome,
  completedRunResult,
  createFakeDetachedObjectiveRuns,
  distributionFrame,
  failedRunOutcome,
} from "../fake-detached-objective-runs.fixtures";
import {
  sirOptimizationInput,
  sirOptimizationMetric,
} from "../sir-optimization-input.fixtures";
import {
  buildOptimizationSurfaceAxes,
  optimizationAxisPositionFor,
  optimizationAxisValueAt,
} from "../surface-grid";
import {
  createConnectedStudy,
  type ConnectedStudyUpdate,
} from "./connected-study";

const metricId = sirOptimizationMetric.id;
const axes = buildOptimizationSurfaceAxes(sirOptimizationInput);
const axis = axes[0]!;

const setup = () => {
  const refinementRuns = createFakeDetachedObjectiveRuns();
  const trialRuns = createFakeDetachedObjectiveRuns();
  const updates: ConnectedStudyUpdate[] = [];
  const study = createConnectedStudy({
    optimizationId: "optimization-1",
    input: sirOptimizationInput,
    axes,
    computeBackend: "webgpu",
    runDetachedObjective: refinementRuns.runDetachedObjective,
    onUpdate: (update) => {
      updates.push(update);
    },
  });
  /** A trial's batch as the channel would hand it over. */
  const startTrial = (trial: number, infectedRatio: number) => {
    const entry = trialRuns.runDetachedObjective({
      cacheKey: "run-1",
      definition: sirOptimizationInput.model.definition,
      scenarioId: sirOptimizationInput.scenario.id,
      scenarioParameterValues: {
        population: 1_000,
        infected_ratio: infectedRatio,
      },
      metric: { id: metricId, label: "m", code: "" },
      seed: 1,
      runCount: 3,
      dt: 1,
      maxTime: 180,
      computeBackend: "webgpu",
    });
    study.trialStarted(trial, { infected_ratio: infectedRatio }, entry);
    return trialRuns.runs.at(-1)!;
  };
  return {
    refinementRuns,
    updates,
    study,
    startTrial,
    latest: () => updates.at(-1),
  };
};

describe("createConnectedStudy", () => {
  it("starts at the axis midpoints, following trials, computing nothing", () => {
    const { study, refinementRuns, updates } = setup();
    expect(study.initialNavigation).toEqual({
      positions: { infected_ratio: 25 },
      booleans: {},
      followTrials: true,
    });
    expect(study.computeBackend).toBe("webgpu");
    expect(refinementRuns.runs).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("follows a trial: the navigation moves to its values and its batch streams as the selection", () => {
    const { study, startTrial, latest, refinementRuns } = setup();

    const trial = startTrial(0, 0.05);
    expect(latest()?.navigation).toEqual({
      positions: { infected_ratio: optimizationAxisPositionFor(axis, 0.05) },
      booleans: {},
      followTrials: true,
    });
    expect(latest()?.selection).toEqual({
      key: "trial:0",
      metricFrames: [],
      runsCompleted: 0,
      runTarget: null,
      computing: true,
      error: null,
    });

    const frame = distributionFrame(metricId, 1, [[0.2, 2]]);
    trial.frames.set([frame]);
    expect(latest()?.selection).toMatchObject({
      key: "trial:0",
      metricFrames: [frame],
      computing: true,
    });

    const result = completedRunResult({
      metricId,
      frames: [frame],
      runValues: [0.2, 0.2, 0.2],
    });
    study.trialSettled(0, result);
    expect(latest()?.selection).toEqual({
      key: "trial:0",
      metricFrames: [frame],
      runsCompleted: 3,
      runTarget: null,
      computing: false,
      error: null,
    });
    expect(refinementRuns.runs).toHaveLength(0);
  });

  it("a followed trial's failure lands on the selection with its reason", () => {
    const { study, startTrial, latest, refinementRuns } = setup();
    startTrial(0, 0.05);

    study.trialSettled(0, failedRunOutcome(`${metricId}: Unexpected token`));
    expect(latest()?.selection).toEqual({
      key: "trial:0",
      metricFrames: [],
      runsCompleted: 0,
      runTarget: null,
      computing: false,
      error: `${metricId}: Unexpected token`,
    });
    expect(refinementRuns.runs).toHaveLength(0);
  });

  it("a user move stops following and refines the new point on the study's backend", () => {
    const { study, startTrial, latest, refinementRuns } = setup();
    startTrial(0, 0.05);

    study.setNavigation({ positions: { infected_ratio: 10 } });
    expect(latest()?.navigation).toEqual({
      positions: { infected_ratio: 10 },
      booleans: {},
      followTrials: false,
    });
    expect(refinementRuns.runs[0]?.request).toMatchObject({
      cacheKey: "optimization-1",
      computeBackend: "webgpu",
      seed: 1,
      runCount: 8,
      scenarioParameterValues: {
        population: 1_000,
        infected_ratio: optimizationAxisValueAt(axis, 10),
      },
    });
    expect(latest()?.selection).toMatchObject({
      key: "infected_ratio=10",
      runTarget: 8,
      computing: true,
    });

    // Later trials no longer move the navigation or replace the selection.
    startTrial(1, 0.02);
    expect(latest()?.navigation?.positions).toEqual({ infected_ratio: 10 });
    expect(latest()?.selection?.key).toBe("infected_ratio=10");
  });

  it("settling refines wherever the navigation points, once the followed trial has settled", () => {
    const { study, startTrial, latest, refinementRuns } = setup();
    const trial = startTrial(0, 0.05);

    study.settle("complete");
    expect(refinementRuns.runs).toHaveLength(0);

    const failed = failedRunOutcome("1 of 3 runs failed");
    study.trialSettled(0, failed);
    trial.settle(failed);
    const position = optimizationAxisPositionFor(axis, 0.05);
    expect(refinementRuns.runs[0]?.request).toMatchObject({
      scenarioParameterValues: {
        infected_ratio: optimizationAxisValueAt(axis, position),
      },
    });
    expect(latest()?.selection?.key).toBe(`infected_ratio=${position}`);
    expect(latest()?.navigation?.followTrials).toBe(true);
  });

  it("a cancellation stops following without refining; a later move still refines", () => {
    const { study, startTrial, latest, refinementRuns } = setup();
    const trial = startTrial(0, 0.05);
    const frame = distributionFrame(metricId, 1, [[0.2, 1]]);
    trial.frames.set([frame]);

    study.settle("cancelled");
    trial.run.cancel();
    study.trialSettled(0, cancelledRunOutcome);
    expect(refinementRuns.runs).toHaveLength(0);
    expect(latest()?.selection).toEqual({
      key: "trial:0",
      metricFrames: [frame],
      runsCompleted: 0,
      runTarget: null,
      computing: false,
      error: null,
    });

    study.setNavigation({ positions: { infected_ratio: 10 } });
    expect(refinementRuns.runs).toHaveLength(1);
    expect(latest()?.selection?.key).toBe("infected_ratio=10");
  });

  it("turning following back on attaches to the trial being evaluated", () => {
    const { study, startTrial, latest, refinementRuns } = setup();
    study.setNavigation({ positions: { infected_ratio: 10 } });
    startTrial(1, 0.02);
    expect(latest()?.selection?.key).toBe("infected_ratio=10");

    study.setNavigation({ followTrials: true });
    expect(refinementRuns.runs[0]!.cancelled).toBe(true);
    expect(latest()?.navigation).toEqual({
      positions: { infected_ratio: optimizationAxisPositionFor(axis, 0.02) },
      booleans: {},
      followTrials: true,
    });
    expect(latest()?.selection?.key).toBe("trial:1");
  });

  it("dispose cancels the refinement and publishes nothing further", () => {
    const { study, latest, refinementRuns, updates } = setup();
    study.setNavigation({ positions: { infected_ratio: 3 } });
    const published = updates.length;

    study.dispose();
    expect(refinementRuns.runs[0]!.cancelled).toBe(true);
    study.setNavigation({ positions: { infected_ratio: 4 } });
    expect(updates).toHaveLength(published);
    expect(latest()?.navigation?.positions).toEqual({ infected_ratio: 3 });
  });
});
