import { isValidElement } from "react";
import { describe, expect, it } from "vitest";

import {
  fakeConstrainedStudyInput,
  fakeConstrainedStudyTrials,
  makeConnectedStudyState,
  makeOptimizationInput,
  makeOptimizationRecord,
  makeSelectionStream,
  makeTrials,
  navigationAtTrial,
  optimizedBindingSets,
} from "./optimizations-story-fixtures";
import {
  describeStepProgress,
  OBJECTIVE_PLOT_HEIGHT,
  type StudyResultsDependencies,
  studyResultsModel,
} from "./study-results";

import type { OptimizationRecord } from "../../../../../../react/optimizations/context";

const input = makeOptimizationInput(optimizedBindingSets.base);
const { trials, best } = makeTrials(input, 5);
const navigation = navigationAtTrial(input, trials[2]!, true);

const dependencies: StudyResultsDependencies = {
  presentation: "drawer",
  onPresentationChange: () => {},
  onNavigationChange: () => {},
  enableOptimizationSurface: false,
  onClose: () => {},
};

const model = (
  optimization: OptimizationRecord,
  overrides: Partial<StudyResultsDependencies> = {},
) => studyResultsModel(optimization, { ...dependencies, ...overrides });

const running = makeOptimizationRecord({
  input,
  trials: trials.slice(0, 3),
  best: trials[2]!.best,
  status: "running",
  connected: makeConnectedStudyState(input, {
    navigation,
    selection: makeSelectionStream({
      input,
      navigation,
      followedTrial: 2,
      runsCompleted: 1,
      computing: true,
      frameCount: 4,
    }),
    activity: [
      { id: 3, kind: "trial", trial: 2, runCount: 1, completedRuns: 0 },
    ],
  }),
});

const paused = makeOptimizationRecord({
  input,
  trials: trials.slice(0, 3),
  best: trials[2]!.best,
  status: "paused",
  connected: makeConnectedStudyState(input, {
    navigation: navigationAtTrial(input, trials[2]!, false),
    selection: null,
    resumable: true,
  }),
});

const stopped = makeOptimizationRecord({
  input,
  trials: trials.slice(0, 3),
  best: trials[2]!.best,
  status: "cancelled",
  connected: makeConnectedStudyState(input, {
    navigation: { ...navigation, followTrials: false },
    selection: makeSelectionStream({ input, navigation, runsCompleted: 8 }),
    resumable: true,
  }),
});

const remote = makeOptimizationRecord({
  input,
  trials,
  best,
  status: "complete",
});

const statTexts = (record: OptimizationRecord) =>
  Object.fromEntries(
    model(record).header.stats.map((stat) => [stat.label, stat.value.text]),
  );

describe("studyResultsModel for a running connected study", () => {
  const result = model(running);

  it("titles the study in one line and puts the progress line beside it", () => {
    const metric = input.model.definition.metrics![0]!;
    const scenario = input.model.definition.scenarios!.find(
      (candidate) => candidate.id === input.scenario.id,
    )!;
    expect(result.header.title).toBe(
      `${input.name} · ${scenario.name} · Maximize ${metric.name}`,
    );
    expect(isValidElement(result.header.headline)).toBe(true);
  });

  it("reads Running with the steps, the best step and the batches computing", () => {
    expect(result.header.status).toEqual({
      label: "Running",
      tone: "active",
      widest: "Reconnecting",
    });
    expect(statTexts(running)).toEqual({
      Steps: "3 / 30",
      "Best step so far": trials[2]!.best!.objective.toPrecision(6),
    });
    expect(
      result.header.stats.find((stat) => stat.id === "best")?.value.tooltip,
    ).toContain("production_rate=");
    expect(result.header.activity).toHaveLength(1);
    expect(result.header.compute).toEqual({
      computeBackend: "cpu",
      computeBackendFallbackReason: null,
    });
    expect(result.header.progress).toBe(10);
    expect(result.header.note).toBeNull();
  });

  it("lays the Parameters band, the surface, the point's timeline, the study cards and the steps out", () => {
    expect(result.bands.map((band) => band.title)).toEqual(["Parameters"]);
    expect(result.bands[0]!.collapsible).toBe(true);
    expect(isValidElement(result.bands[0]!.trailing)).toBe(true);
    expect(isValidElement(result.surface)).toBe(true);
    expect(result.metrics).toMatchObject({
      key: running.id,
      contentEpoch: "trial:2",
      plotHeight: OBJECTIVE_PLOT_HEIGHT,
      tone: "default",
      timeDomain: [0, input.execution.maxTime],
    });
    expect(result.metrics!.tiles).toHaveLength(1);
    expect(result.metrics!.tiles[0]).toMatchObject({
      title: "Objective at the step in flight",
      metricName: input.model.definition.metrics![0]!.name,
      outputType: "distribution",
    });
    expect(result.metrics!.tiles[0]!.frames).toHaveLength(5);
    expect(isValidElement(result.metrics!.cards)).toBe(true);
    expect(isValidElement(result.after)).toBe(true);
    expect(isValidElement(result.footer)).toBe(true);
  });
});

describe("studyResultsModel for a paused study", () => {
  const result = model(paused);

  it("keeps the running layout in the paused tone, with the resume note in the reserved row", () => {
    expect(result.header.status.label).toBe("Paused");
    expect(result.header.status.tone).toBe("neutral");
    expect(result.header.note?.tone).toBe("muted");
    expect(result.header.activity).toEqual([]);
    expect(result.bands.map((band) => band.title)).toEqual(["Parameters"]);
    expect(result.metrics?.tone).toBe("paused");
    expect(result.metrics?.tiles[0]?.title).toBe(
      "Objective at the selected point",
    );
    expect(result.metrics?.tiles[0]?.frames).toEqual([]);
    expect(result.metrics?.contentEpoch).toBe("");
    expect(isValidElement(result.after)).toBe(true);
  });
});

describe("studyResultsModel for a stopped connected study", () => {
  const result = model(stopped);

  it("reads Stopped, titles the point's timeline for the selection and keeps the surface", () => {
    expect(result.header.status.label).toBe("Stopped");
    expect(result.metrics?.tiles[0]?.title).toBe(
      "Objective at the selected point",
    );
    expect(result.metrics?.tiles[0]?.frames.length).toBeGreaterThan(0);
    expect(result.metrics?.contentEpoch).toBe(
      stopped.connected!.selection!.key,
    );
    expect(isValidElement(result.surface)).toBe(true);
    expect(result.metrics?.tone).toBe("default");
  });

  it("puts the error in the note row when the study failed", () => {
    const failed = { ...stopped, status: "error" as const, error: "boom" };
    expect(model(failed).header.note).toEqual({
      content: "boom",
      tone: "error",
    });
    expect(model(failed).header.status).toMatchObject({
      label: "Error",
      tone: "error",
    });
  });
});

describe("studyResultsModel for a remote study", () => {
  const result = model(remote);

  it("shows the strip without activity or compute, the best parameters band, no timeline, the objective by step and the steps", () => {
    expect(result.header.status.label).toBe("Complete");
    expect(statTexts(remote)).toEqual({
      Steps: "5 / 30",
      "Best step so far": best!.objective.toPrecision(6),
    });
    expect(result.header.activity).toBeNull();
    expect(result.header.compute).toBeNull();
    expect(result.header.headline).not.toBeNull();
    expect(result.bands.map((band) => band.title)).toEqual(["Best parameters"]);
    expect(result.bands[0]!.collapsible).toBe(false);
    expect(result.surface).toBeNull();
    expect(result.metrics?.tiles).toEqual([]);
    expect(isValidElement(result.metrics?.cards)).toBe(true);
    expect(isValidElement(result.after)).toBe(true);
  });

  it("shows the self-navigating surface in a band behind the setting", () => {
    expect(
      isValidElement(
        model(remote, { enableOptimizationSurface: true }).surface,
      ),
    ).toBe(true);
  });

  it("leaves the steps out before any trial, and Cancelled reads as such", () => {
    const empty = makeOptimizationRecord({ input, status: "cancelled" });
    expect(model(empty).after).toBeNull();
    expect(model(empty).bands).toEqual([]);
    expect(model(empty).header.status.label).toBe("Cancelled");
    expect(
      model(empty).header.stats.find((stat) => stat.id === "best")?.value,
    ).toEqual({ text: "—" });
  });
});

describe("studyResultsModel for a constrained study", () => {
  it("adds the Steps clear column", () => {
    const constrainedNavigation = navigationAtTrial(
      fakeConstrainedStudyInput,
      fakeConstrainedStudyTrials.trials.at(-1)!,
      false,
    );
    const constrained = makeOptimizationRecord({
      input: fakeConstrainedStudyInput,
      trials: fakeConstrainedStudyTrials.trials,
      best: fakeConstrainedStudyTrials.best,
      status: "complete",
      connected: makeConnectedStudyState(fakeConstrainedStudyInput, {
        navigation: constrainedNavigation,
        resumable: true,
      }),
    });
    expect(model(constrained).header.stats.map((stat) => stat.label)).toEqual([
      "Steps",
      "Steps clear",
      "Best step so far",
    ]);
    expect(statTexts(constrained)["Steps clear"]).toMatch(
      /^\d+ \/ \d+ · \d+%$/u,
    );
  });
});

describe("describeStepProgress", () => {
  it("counts the finished steps of every state over the requested ones", () => {
    expect(
      describeStepProgress({
        ...makeOptimizationRecord({ input }),
        completedTrials: 3,
        prunedTrials: 1,
        failedTrials: 2,
      }),
    ).toBe("6 / 30");
  });

  it("names the runs per step and the steps at once only above one", () => {
    expect(
      describeStepProgress({
        ...makeOptimizationRecord({
          input,
          connected: makeConnectedStudyState(input, { parallelism: 2 }),
        }),
        completedTrials: 3,
        prunedTrials: 1,
        failedTrials: 0,
        input: {
          ...input,
          execution: { ...input.execution, seedsPerTrial: 3 },
        },
      }),
    ).toBe("4 / 30 · 3 runs each · 2 at once");
  });

  it("names the runs per step alone when steps run one at a time", () => {
    expect(
      describeStepProgress({
        ...makeOptimizationRecord({ input }),
        input: {
          ...input,
          execution: { ...input.execution, seedsPerTrial: 6 },
        },
      }),
    ).toBe("0 / 30 · 6 runs each");
  });
});
