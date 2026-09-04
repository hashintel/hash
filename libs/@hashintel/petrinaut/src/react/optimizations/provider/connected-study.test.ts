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

import type { PetrinautOptimizationTrialEvent } from "@hashintel/petrinaut-core";

const metricId = sirOptimizationMetric.id;
const axes = buildOptimizationSurfaceAxes(sirOptimizationInput);
const axis = axes[0]!;

const trialEvent = (
  trial: number,
  infectedRatio: number,
  objective: number | null,
): PetrinautOptimizationTrialEvent => ({
  type: "trial",
  trial,
  parameters: { infected_ratio: infectedRatio },
  objective,
  state: objective === null ? "pruned" : "complete",
  best: null,
  seq: trial + 2,
});

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
    study.trialStarted(trial, { infected_ratio: infectedRatio }, entry, 3);
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
      note: null,
    });
    expect(latest()?.activity).toEqual([
      {
        id: "step-1",
        kind: "step",
        label: "Step 1",
        runCount: 3,
        completedRuns: 0,
      },
    ]);
    expect(latest()?.inFlight).toEqual([
      { trial: 0, parameters: { infected_ratio: 0.05 }, objective: null },
    ]);

    const frame = distributionFrame(metricId, 1, [[0.2, 2]]);
    trial.frames.set([frame]);
    expect(latest()?.selection).toMatchObject({
      key: "trial:0",
      metricFrames: [frame],
      computing: true,
    });
    expect(latest()?.inFlight[0]?.objective).toBeCloseTo(0.2);

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
      note: null,
    });
    expect(latest()?.activity).toEqual([]);
    expect(latest()?.inFlight).toEqual([]);
    expect(refinementRuns.runs).toHaveLength(0);
  });

  it("follows the most recently started of several trials in flight, then the next when it settles", () => {
    const { study, startTrial, latest } = setup();

    startTrial(0, 0.05);
    const second = startTrial(1, 0.02);
    expect(latest()?.selection?.key).toBe("trial:1");
    expect(latest()?.navigation?.positions).toEqual({
      infected_ratio: optimizationAxisPositionFor(axis, 0.02),
    });
    expect(latest()?.activity.map((batch) => batch.label)).toEqual([
      "Step 1",
      "Step 2",
    ]);
    expect(latest()?.inFlight.map((step) => step.trial)).toEqual([0, 1]);

    // The unfollowed trial's frames still reach the record as its running value.
    const frame = distributionFrame(metricId, 1, [[0.4, 3]]);
    second.frames.set([frame]);
    expect(latest()?.inFlight[1]?.objective).toBeCloseTo(0.4);

    study.trialSettled(
      1,
      completedRunResult({ metricId, frames: [frame], runValues: [0.4] }),
    );
    expect(latest()?.selection).toMatchObject({
      key: "trial:0",
      computing: true,
    });
    expect(latest()?.navigation?.positions).toEqual({
      infected_ratio: optimizationAxisPositionFor(axis, 0.05),
    });
    expect(latest()?.inFlight.map((step) => step.trial)).toEqual([0]);
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
      note: null,
    });
    expect(refinementRuns.runs).toHaveLength(0);
  });

  it("a user move stops following and refines the new point on the study's backend, listing the rung", () => {
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
    expect(latest()?.activity).toEqual([
      expect.objectContaining({ kind: "step", label: "Step 1", runCount: 3 }),
      expect.objectContaining({
        kind: "refine",
        label: `Refining infected_ratio ${optimizationAxisValueAt(axis, 10)
          .toPrecision(3)
          .replace(/\.?0+$/, "")}`,
        runCount: 8,
      }),
    ]);

    // Later trials no longer move the navigation or replace the selection.
    startTrial(1, 0.02);
    expect(latest()?.navigation?.positions).toEqual({ infected_ratio: 10 });
    expect(latest()?.selection?.key).toBe("infected_ratio=10");
  });

  it("settles on the best trial's point and refines it there, once the followed trial has settled", () => {
    const { study, startTrial, latest, refinementRuns } = setup();
    study.trialReported(trialEvent(0, 0.05, 0.3));
    study.trialReported(trialEvent(1, 0.02, 0.1));
    const trial = startTrial(2, 0.15);

    study.settle("complete");
    expect(refinementRuns.runs).toHaveLength(0);

    const failed = failedRunOutcome("1 of 3 runs failed");
    study.trialSettled(2, failed);
    trial.settle(failed);
    const bestPosition = optimizationAxisPositionFor(axis, 0.02);
    expect(latest()?.navigation).toEqual({
      positions: { infected_ratio: bestPosition },
      booleans: {},
      followTrials: false,
    });
    expect(refinementRuns.runs[0]?.request).toMatchObject({
      scenarioParameterValues: {
        infected_ratio: optimizationAxisValueAt(axis, bestPosition),
      },
    });
    expect(latest()?.selection?.key).toBe(`infected_ratio=${bestPosition}`);
  });

  it("takes the best the terminal event carries, and stays at the midpoint without any", () => {
    const { study, latest, refinementRuns } = setup();

    study.settle("complete", {
      trial: 4,
      parameters: { infected_ratio: 0.01 },
      objective: 0.05,
    });
    const bestPosition = optimizationAxisPositionFor(axis, 0.01);
    expect(latest()?.navigation?.positions).toEqual({
      infected_ratio: bestPosition,
    });
    expect(refinementRuns.runs[0]?.request.scenarioParameterValues).toEqual({
      population: 1_000,
      infected_ratio: optimizationAxisValueAt(axis, bestPosition),
    });

    const empty = setup();
    empty.study.settle("cancelled");
    expect(empty.latest()?.navigation).toEqual({
      positions: { infected_ratio: 25 },
      booleans: {},
      followTrials: false,
    });
    expect(empty.refinementRuns.runs).toHaveLength(1);
  });

  it("a stop settles on the best too; a navigation the user moved earlier stays where it is", () => {
    const { study, startTrial, latest, refinementRuns } = setup();
    study.trialReported(trialEvent(0, 0.05, 0.3));
    const trial = startTrial(1, 0.02);
    const frame = distributionFrame(metricId, 1, [[0.2, 1]]);
    trial.frames.set([frame]);

    study.settle("cancelled");
    trial.run.cancel();
    study.trialSettled(1, cancelledRunOutcome);
    const bestPosition = optimizationAxisPositionFor(axis, 0.05);
    expect(latest()?.navigation?.positions).toEqual({
      infected_ratio: bestPosition,
    });
    expect(refinementRuns.runs).toHaveLength(1);
    expect(latest()?.selection?.key).toBe(`infected_ratio=${bestPosition}`);

    const moved = setup();
    moved.startTrial(0, 0.05);
    moved.study.setNavigation({ positions: { infected_ratio: 10 } });
    moved.study.settle("complete", {
      trial: 0,
      parameters: { infected_ratio: 0.05 },
      objective: 0.3,
    });
    expect(moved.latest()?.navigation?.positions).toEqual({
      infected_ratio: 10,
    });
    expect(moved.refinementRuns.runs).toHaveLength(1);
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

  it("resuming a settled study stops the refinement and follows the next trial", () => {
    const { study, startTrial, latest, refinementRuns } = setup();
    study.settle("complete", {
      trial: 0,
      parameters: { infected_ratio: 0.05 },
      objective: 0.3,
    });
    expect(refinementRuns.runs).toHaveLength(1);

    study.resume();
    expect(refinementRuns.runs[0]!.cancelled).toBe(true);
    expect(latest()?.navigation?.followTrials).toBe(true);

    startTrial(1, 0.02);
    expect(latest()?.selection?.key).toBe("trial:1");
    expect(latest()?.navigation?.positions).toEqual({
      infected_ratio: optimizationAxisPositionFor(axis, 0.02),
    });
  });

  it("dispose cancels the refinement, clears the activity and publishes nothing further", () => {
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
