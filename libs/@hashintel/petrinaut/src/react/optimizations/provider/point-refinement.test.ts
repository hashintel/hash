import { describe, expect, it } from "vitest";

import { deriveRunSeed } from "@hashintel/petrinaut-core";

import { distributionStats } from "../../experiments/distribution-stats";
import {
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
  cannotBeatBestNote,
  createPointRefinement,
  type PointRefinementStudy,
} from "./point-refinement";

import type { OptimizationSelectionStream } from "../context";

const metricId = sirOptimizationMetric.id;

const study: PointRefinementStudy = {
  cacheKey: "study",
  definition: sirOptimizationInput.model.definition,
  scenarioId: sirOptimizationInput.scenario.id,
  metric: {
    id: metricId,
    label: sirOptimizationMetric.name,
    code: sirOptimizationMetric.code,
  },
  seed: 42,
  dt: 1,
  maxTime: 180,
  computeBackend: "cpu",
  direction: "minimize",
};

const target = (key: string, infectedRatio: number, isBest = false) => ({
  key,
  scenarioParameterValues: { population: 1_000, infected_ratio: infectedRatio },
  isBest,
});

const setup = ({
  maxRuns = 25,
  best = null,
}: { maxRuns?: number; best?: number | null } = {}) => {
  const fake = createFakeDetachedObjectiveRuns();
  const updates: OptimizationSelectionStream[] = [];
  const refinement = createPointRefinement({
    runDetachedObjective: fake.runDetachedObjective,
    study,
    bestObjective: () => best,
    maxRuns,
    onUpdate: (update) => {
      updates.push(update);
    },
  });
  return { fake, updates, refinement, latest: () => updates.at(-1) };
};

const settled = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

/** Eight runs whose values sit `spread` either side of `mean`. */
const spreadFrame = (mean: number, spread = 0.01) =>
  distributionFrame(metricId, 180, [
    [mean - spread, 4],
    [mean + spread, 4],
  ]);

describe("createPointRefinement", () => {
  it("climbs the ladder from the point's first rung, seeding each batch from its first run index", async () => {
    const { fake, refinement, latest } = setup();

    refinement.refine(target("a", 0.05));
    expect(latest()).toEqual({
      key: "a",
      metricFrames: [],
      runsCompleted: 0,
      runTarget: 8,
      computing: true,
      error: null,
      note: null,
    });
    expect(fake.runs[0]?.request).toMatchObject({
      cacheKey: "study",
      seed: 42,
      runCount: 8,
      computeBackend: "cpu",
      scenarioParameterValues: { population: 1_000, infected_ratio: 0.05 },
    });

    const first = distributionFrame(metricId, 1, [[0.1, 8]]);
    fake.runs[0]!.settle(
      completedRunResult({ metricId, frames: [first], runsCompleted: 8 }),
    );
    await settled();
    expect(latest()).toEqual({
      key: "a",
      metricFrames: [first],
      runsCompleted: 8,
      runTarget: 25,
      computing: true,
      error: null,
      note: null,
    });
    expect(fake.runs[1]?.request).toMatchObject({
      seed: deriveRunSeed(42, 8),
      runCount: 17,
    });

    // The in-flight batch streams merged with the finished rungs.
    const second = distributionFrame(metricId, 1, [[0.3, 17]]);
    fake.runs[1]!.frames.set([second]);
    expect(latest()).toMatchObject({
      runsCompleted: 8,
      runTarget: 25,
      computing: true,
    });
    expect(distributionStats(latest()!.metricFrames, metricId)).toMatchObject({
      runs: 25,
      mean: (0.1 * 8 + 0.3 * 17) / 25,
    });

    fake.runs[1]!.settle(
      completedRunResult({ metricId, frames: [second], runsCompleted: 17 }),
    );
    await settled();
    expect(latest()).toMatchObject({
      runsCompleted: 25,
      runTarget: null,
      computing: false,
      note: null,
    });
    expect(fake.runs).toHaveLength(2);
  });

  it("a new key cancels the batch in flight, and a refined key resumes from its cached rungs", async () => {
    const { fake, refinement, latest } = setup();

    refinement.refine(target("a", 0.05));
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 1, [[0.1, 8]])],
        runsCompleted: 8,
      }),
    );
    await settled();
    expect(fake.runs).toHaveLength(2);

    refinement.refine(target("b", 0.01));
    expect(fake.runs[1]!.cancelled).toBe(true);
    expect(fake.runs[2]?.request).toMatchObject({
      seed: 42,
      runCount: 8,
      scenarioParameterValues: { infected_ratio: 0.01 },
    });
    expect(latest()).toMatchObject({
      key: "b",
      runsCompleted: 0,
      runTarget: 8,
    });

    refinement.refine(target("a", 0.05));
    expect(fake.runs[2]!.cancelled).toBe(true);
    expect(latest()).toMatchObject({
      key: "a",
      runsCompleted: 8,
      runTarget: 25,
    });
    expect(fake.runs[3]?.request).toMatchObject({
      seed: deriveRunSeed(42, 8),
      runCount: 17,
      scenarioParameterValues: { infected_ratio: 0.05 },
    });
  });

  it("refining the active key again changes nothing; stop cancels and keeps the cache", async () => {
    const { fake, refinement, latest } = setup();

    refinement.refine(target("a", 0.05));
    refinement.refine(target("a", 0.05));
    expect(fake.runs).toHaveLength(1);

    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [distributionFrame(metricId, 1, [[0.1, 8]])],
        runsCompleted: 8,
      }),
    );
    await settled();
    refinement.stop();
    expect(fake.runs[1]!.cancelled).toBe(true);

    refinement.refine(target("a", 0.05));
    expect(latest()).toMatchObject({
      key: "a",
      runsCompleted: 8,
      runTarget: 25,
    });
    expect(fake.runs[2]?.request).toMatchObject({ runCount: 17 });
  });

  it("a failed rung stops the ladder with its reason, and refining the key again retries it", async () => {
    const { fake, refinement, latest } = setup();

    refinement.refine(target("a", 0.05));
    fake.runs[0]!.settle(failedRunOutcome("cpu: unsupported net"));
    await settled();
    expect(latest()).toEqual({
      key: "a",
      metricFrames: [],
      runsCompleted: 0,
      runTarget: null,
      computing: false,
      error: "cpu: unsupported net",
      note: null,
    });
    expect(fake.runs).toHaveLength(1);

    refinement.refine(target("a", 0.05));
    expect(fake.runs).toHaveLength(2);
    expect(latest()).toMatchObject({
      key: "a",
      runTarget: 8,
      computing: true,
      error: null,
      note: null,
    });
  });

  it("a batch cancelled from beneath stops the ladder without an error", async () => {
    const { fake, refinement, latest } = setup();

    refinement.refine(target("a", 0.05));
    fake.runs[0]!.run.cancel();
    await settled();
    expect(latest()).toEqual({
      key: "a",
      metricFrames: [],
      runsCompleted: 0,
      runTarget: null,
      computing: false,
      error: null,
      note: null,
    });
    expect(fake.runs).toHaveLength(1);
  });

  it("stops after the first rung, with a note, at a point that cannot beat the best", async () => {
    // Minimizing, with a best of 0.1: a point around 0.3 is hopeless.
    const { fake, refinement, latest } = setup({ best: 0.1 });

    refinement.refine(target("a", 0.05));
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [spreadFrame(0.3)],
        runsCompleted: 8,
      }),
    );
    await settled();

    expect(latest()).toMatchObject({
      key: "a",
      runsCompleted: 8,
      runTarget: null,
      computing: false,
      error: null,
      note: cannotBeatBestNote(8),
    });
    expect(latest()?.note).toBe("8 runs · cannot beat the best");
    expect(fake.runs).toHaveLength(1);

    // Returning to the point later changes nothing: the verdict stands.
    refinement.refine(target("b", 0.01));
    refinement.refine(target("a", 0.05));
    expect(fake.runs).toHaveLength(2);
    expect(latest()).toMatchObject({ key: "a", note: cannotBeatBestNote(8) });
  });

  it("keeps climbing at a point that might beat the best, and at the best trial's own point", async () => {
    const { fake, refinement, latest } = setup({ best: 0.1 });

    // Within reach: a mean of 0.11 whose eight runs spread 0.05 either side,
    // so 2.5 standard errors reach below the best.
    refinement.refine(target("a", 0.05));
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [spreadFrame(0.11, 0.05)],
        runsCompleted: 8,
      }),
    );
    await settled();
    expect(latest()).toMatchObject({
      runTarget: 25,
      computing: true,
      note: null,
    });
    expect(fake.runs).toHaveLength(2);

    // The best trial's point: hopeless by its estimate, refined regardless.
    refinement.refine(target("best", 0.02, true));
    fake.runs[2]!.settle(
      completedRunResult({
        metricId,
        frames: [spreadFrame(0.3)],
        runsCompleted: 8,
      }),
    );
    await settled();
    expect(latest()).toMatchObject({
      key: "best",
      runTarget: 25,
      computing: true,
      note: null,
    });
    expect(fake.runs).toHaveLength(4);
  });

  it("refines as before while the study has no best", async () => {
    const { fake, refinement, latest } = setup();

    refinement.refine(target("a", 0.05));
    fake.runs[0]!.settle(
      completedRunResult({
        metricId,
        frames: [spreadFrame(0.3)],
        runsCompleted: 8,
      }),
    );
    await settled();
    expect(latest()).toMatchObject({
      runTarget: 25,
      computing: true,
      note: null,
    });
  });
});
