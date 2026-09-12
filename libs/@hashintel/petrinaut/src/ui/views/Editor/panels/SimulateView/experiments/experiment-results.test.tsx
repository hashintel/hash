import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  type ExperimentResultsDependencies,
  experimentResultsModel,
} from "./experiment-results";
import {
  makeExperiment,
  makeParameterSweepExperiment,
} from "./experiments-story-fixtures";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";

const dependencies: ExperimentResultsDependencies = {
  now: Date.now(),
  actions: {
    cancelExperiment: vi.fn(),
    removeExperiment: vi.fn(),
    setSweepSelection: vi.fn(),
  },
  onClose: () => {},
};

const model = (experiment: ExperimentRecord) =>
  experimentResultsModel(experiment, dependencies);

const statTexts = (experiment: ExperimentRecord) =>
  Object.fromEntries(
    model(experiment).header.stats.map((stat) => [stat.label, stat.value.text]),
  );

const sweep = makeParameterSweepExperiment();

/** The sweep once its selection is fully sampled and no batch publishes progress. */
const idleSweep: ExperimentRecord = {
  ...sweep,
  status: "idle",
  finishedAt: Date.now(),
  progress: null,
  sweep: {
    ...sweep.sweep!,
    computing: false,
    runsCompleted: sweep.runCount,
    runsSampled: sweep.runCount,
    runTarget: null,
  },
  sweepBatches: [],
};

describe("experimentResultsModel for a running sweep", () => {
  const result = model(sweep);

  it("titles the experiment in one line with no headline", () => {
    expect(result.header.title).toBe(
      "SIR transmission sweep · Seasonal Flu · 100 runs",
    );
    expect(result.header.headline).toBeNull();
  });

  it("reads Running with the runs, errors, time, elapsed and selection columns, the batches computing and the backend", () => {
    expect(result.header.status).toEqual({
      label: "Running",
      tone: "active",
      widest: "Initializing",
    });
    expect(Object.keys(statTexts(sweep))).toEqual([
      "Runs",
      "Errors",
      "Time",
      "Elapsed",
      "Selection",
    ]);
    expect(statTexts(sweep).Runs).toMatch(/^\d+ active, \d+ complete$/u);
    expect(statTexts(sweep).Time).toMatch(/ \/ 180$/u);
    expect(statTexts(sweep).Selection).toMatch(/^\d+ \/ 100 runs$/u);
    expect(result.header.activity?.length).toBe(sweep.sweepBatches.length);
    expect(result.header.compute).toBe(sweep);
    expect(result.header.note).toBeNull();
    expect(result.header.stats.every((stat) => stat.widest.length > 0)).toBe(
      true,
    );
    // Runs and Selection carry a short form for a narrow header.
    expect(
      result.header.stats.find((stat) => stat.id === "runs")?.short,
    ).toEqual({
      text: `${sweep.progress!.completedRuns} complete`,
      widest: "100 complete",
    });
    expect(
      result.header.stats.find((stat) => stat.id === "selection")?.short,
    ).toEqual({
      text: `${sweep.sweep!.runsSampled} / 100`,
      widest: "100 / 100",
    });
  });

  it("lays the Parameters card, the surface and one tile per metric out, with no steps", () => {
    expect(result.bands.map((band) => band.title)).toEqual(["Parameters"]);
    expect(result.bands[0]).toMatchObject({
      subtitle: `${sweep.parameterAxes.length} swept`,
      trailing: null,
      more: null,
    });
    expect(isValidElement(result.surface)).toBe(true);
    expect(result.metrics).toMatchObject({
      key: sweep.id,
      contentEpoch: JSON.stringify(sweep.sweep!.selection),
      plotHeight: 220,
      tone: "default",
      cards: null,
      timeDomain: [0, sweep.maxTime],
    });
    expect(result.metrics!.tiles.map((tile) => tile.title)).toEqual(
      sweep.metricSpecs.map((spec) => spec.label),
    );
    expect(
      result.metrics!.tiles.every((tile) => tile.metricName === null),
    ).toBe(true);
    expect(result.after).toBeNull();
    expect(isValidElement(result.footer)).toBe(true);
  });
});

describe("experimentResultsModel for an idle sweep", () => {
  const result = model(idleSweep);

  it("reads Idle with every run at the end of the simulated time and nothing computing", () => {
    expect(result.header.status).toMatchObject({
      label: "Idle",
      tone: "neutral",
    });
    expect(statTexts(idleSweep).Time).toBe("180 / 180");
    expect(statTexts(idleSweep).Selection).toBe("100 / 100 runs");
    expect(result.header.activity).toEqual([]);
    expect(result.header.progress).toBe(100);
  });

  it("puts the error in the note row when the sweep failed", () => {
    const failed = {
      ...idleSweep,
      status: "error" as const,
      error: "worker crashed",
    };
    expect(model(failed).header.note).toEqual({
      content: "worker crashed",
      tone: "error",
    });
    expect(model(failed).header.status.tone).toBe("error");
  });
});

describe("experimentResultsModel for a plain experiment", () => {
  it("shows the metric cards alone, with no band, no surface and no selection column", () => {
    const plain = makeExperiment(1, {
      metricSpecs: sweep.metricSpecs,
      metricFrames: sweep.metricFrames,
    });
    const result = model(plain);
    expect(result.bands).toEqual([]);
    expect(result.surface).toBeNull();
    expect(Object.keys(statTexts(plain))).toEqual([
      "Runs",
      "Errors",
      "Time",
      "Elapsed",
    ]);
    expect(result.metrics?.tiles).toHaveLength(sweep.metricSpecs.length);
    expect(result.metrics?.contentEpoch).toBe("null");
  });

  it("has no metrics grid without configured metrics", () => {
    expect(model(makeExperiment(1)).metrics).toBeNull();
  });
});
