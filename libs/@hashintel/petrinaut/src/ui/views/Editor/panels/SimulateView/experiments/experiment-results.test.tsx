/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { formatNumber } from "../shared/format-value";
import {
  type ExperimentResultsDependencies,
  experimentMetricTiles,
  experimentResultsModel,
  useExperimentResultsModel,
} from "./experiment-results";
import {
  makeConstrainedSweepExperiment,
  makeExperiment,
  makeParameterSweepExperiment,
} from "./experiments-story-fixtures";
import {
  fakeConstrainedStudyInput,
  fakeConstrainedStudyTrials,
  fakeStudyInput,
  fakeStudyTrials,
  makeOptimizationRecord,
} from "./study-fixtures";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { OptimizationRecord } from "../../../../../../react/optimizations/context";

// uPlot reads `matchMedia` as it loads, which jsdom lacks; the model builds
// the tiles but never renders a timeline.
vi.mock("./experiment-metric-timeline", () => ({
  DEFAULT_METRIC_VIEW_SETTINGS: {},
  describeMetricView: () => "",
  ExperimentMetricTimeline: () => null,
  MetricViewMenu: () => null,
}));

// The strip draws through uPlot; the model hands it the study and no more.
vi.mock("./sweep-objective-strip", () => ({
  SweepObjectiveStrip: () => null,
}));

const idleOptimizer: ExperimentResultsDependencies["optimizer"] = {
  study: null,
  driving: null,
  stop: () => {},
  discard: () => {},
};

const dependencies: Omit<ExperimentResultsDependencies, "tiles"> = {
  actions: {
    cancelExperiment: vi.fn(),
    removeExperiment: vi.fn(),
    setSweepSelection: vi.fn(),
  },
  optimizer: idleOptimizer,
  onClose: () => {},
};

const model = (
  experiment: ExperimentRecord,
  overrides: Partial<ExperimentResultsDependencies> = {},
) =>
  experimentResultsModel(experiment, {
    tiles: experimentMetricTiles(
      experiment.metricFrames,
      experiment.metricSpecs,
    ),
    ...dependencies,
    ...overrides,
  });

const statTexts = (experiment: ExperimentRecord) =>
  Object.fromEntries(
    model(experiment).header.stats.map((stat) => [stat.label, stat.value.text]),
  );

/** The props of the element a model slot holds. */
const propsOf = <Props,>(node: ReactNode): Props =>
  (node as ReactElement<Props>).props;

/** The navigator's props inside the Parameters card. */
const navigatorOf = (result: ReturnType<typeof model>) =>
  propsOf<{
    status: { following: unknown; computing: boolean };
    disabled: boolean;
  }>(result.bands[0]!.content);

/** The surface's props. */
const surfaceOf = (result: ReturnType<typeof model>) =>
  propsOf<{ following: boolean; disabled: boolean; tone: string }>(
    result.surface,
  );

/** The footer's buttons: Cancel or null, then Close. */
const footerButtonsOf = (result: ReturnType<typeof model>) =>
  propsOf<{ children: ReactNode[] }>(result.footer).children;

/** The model with every element reduced to whether it is there: what must not change with a study's status. */
const shapeOf = (result: ReturnType<typeof model>) => ({
  title: result.header.title,
  headline: isValidElement(result.header.headline),
  stats: result.header.stats.map((stat) => stat.label),
  bands: result.bands.map(
    ({ more: _more, content, trailing, below, ...band }) => ({
      ...band,
      content: isValidElement(content),
      trailing: isValidElement(trailing),
      below: isValidElement(below),
    }),
  ),
  surface: isValidElement(result.surface),
  metrics: result.metrics && {
    ...result.metrics,
    tiles: result.metrics.tiles.length,
    cards: isValidElement(result.metrics.cards),
  },
  after: isValidElement(result.after),
});

const sweep = makeParameterSweepExperiment();

/** The sweep once its selection is fully sampled and no batch publishes progress. */
const idleSweep: ExperimentRecord = {
  ...sweep,
  status: "idle",
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

  it("reads Running with the selection, errors and time columns, the batches computing and the backend", () => {
    expect(result.header.status).toEqual({
      label: "Running",
      tone: "active",
      widest: "Initializing",
    });
    // A sweep never finishes and its runs are per batch: no Runs, no Elapsed.
    expect(Object.keys(statTexts(sweep))).toEqual([
      "Selection",
      "Errors",
      "Time",
    ]);
    expect(statTexts(sweep).Time).toMatch(/ \/ 180$/u);
    expect(statTexts(sweep).Selection).toMatch(/^\d+ \/ 100 runs$/u);
    expect(result.header.activity?.length).toBe(sweep.sweepBatches.length);
    expect(result.header.compute).toBe(sweep);
    expect(result.header.note).toBeNull();
    expect(result.header.stats.every((stat) => stat.widest.length > 0)).toBe(
      true,
    );
    // Selection carries a short form for a narrow header.
    expect(
      result.header.stats.find((stat) => stat.id === "selection")?.short,
    ).toEqual({
      text: `${sweep.sweep!.runsSampled} / 100`,
      widest: "100 / 100",
    });
  });

  it("labels the selection's batch Selection and lets the sliders move", () => {
    const computing = model({
      ...sweep,
      sweepBatches: [
        { id: 1, kind: "selection", runCount: 8, completedRuns: 3 },
      ],
    });
    expect(computing.header.activity).toEqual([
      {
        id: "1",
        label: "Selection",
        tone: "priority",
        runCount: 8,
        completedRuns: 3,
      },
    ]);
    expect(navigatorOf(computing)).toMatchObject({
      status: { following: null, computing: true },
      disabled: false,
    });
    expect(isValidElement(footerButtonsOf(computing)[0])).toBe(true);
  });

  it("lays the Parameters card, the surface and one tile per metric out, with no steps", () => {
    expect(result.bands.map((band) => band.title)).toEqual(["Parameters"]);
    expect(result.bands[0]).toMatchObject({
      subtitle: `${sweep.parameterAxes.length} swept`,
      trailing: null,
      more: null,
      tone: "default",
    });
    expect(result.bands[0]!.below).toBeNull();
    expect(isValidElement(result.surface)).toBe(true);
    expect(result.metrics).toMatchObject({
      key: sweep.id,
      contentEpoch: sweep.sweep!.selectionKey,
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
    expect(isValidElement(footerButtonsOf(result)[0])).toBe(false);
  });

  it("keeps the simulated time at zero for a sweep that has computed nothing", () => {
    const fresh: ExperimentRecord = {
      ...idleSweep,
      finishedAt: null,
      sweep: { ...idleSweep.sweep!, runsCompleted: 0, runsSampled: 0 },
    };
    expect(statTexts(fresh).Time).toBe("0 / 180");
    expect(statTexts(fresh).Selection).toBe("0 / 100 runs");
    expect(model(fresh).header.progress).toBe(0);
  });

  it("keeps every run at the end of the simulated time once the sweep is cancelled, and at zero when it computed nothing", () => {
    expect(statTexts({ ...idleSweep, status: "cancelled" }).Time).toBe(
      "180 / 180",
    );
    const fresh: ExperimentRecord = {
      ...idleSweep,
      status: "cancelled",
      finishedAt: null,
      sweep: { ...idleSweep.sweep!, runsCompleted: 0, runsSampled: 0 },
    };
    expect(statTexts(fresh).Time).toBe("0 / 180");
  });

  it("locks the sliders and the surface once the sweep is cancelled, not after a failed selection", () => {
    const cancelled = model({ ...idleSweep, status: "cancelled" });
    expect(navigatorOf(cancelled).disabled).toBe(true);
    expect(surfaceOf(cancelled)).toMatchObject({
      following: false,
      disabled: true,
    });
    // A failure belongs to the selection that failed: the next move computes.
    const failed = model({
      ...idleSweep,
      status: "error",
      error: "device lost",
    });
    expect(navigatorOf(failed).disabled).toBe(false);
    expect(surfaceOf(failed).disabled).toBe(false);
    expect(navigatorOf(result).disabled).toBe(false);
    expect(surfaceOf(result).disabled).toBe(false);
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
    expect(statTexts(plain).Runs).toMatch(/^\d+ active, \d+ complete$/u);
    // The clock ticks in a leaf of its own, so the model is not rebuilt with it.
    expect(isValidElement(statTexts(plain).Elapsed)).toBe(true);
    // Runs carries a short form for a narrow header.
    expect(
      result.header.stats.find((stat) => stat.id === "runs")?.short,
    ).toEqual({
      text: `${plain.progress!.completedRuns} complete`,
      widest: "1,000 complete",
    });
    expect(result.metrics?.tiles).toHaveLength(sweep.metricSpecs.length);
    expect(result.metrics?.contentEpoch).toBe("");
  });

  it("has no metrics grid without configured metrics", () => {
    expect(model(makeExperiment(1)).metrics).toBeNull();
  });
});

describe("useExperimentResultsModel", () => {
  it("hands every tile the same frames across a publish that keeps the frames array", () => {
    const { result, rerender } = renderHook(
      ({ experiment }: { experiment: ExperimentRecord }) =>
        useExperimentResultsModel(experiment, () => {}),
      { initialProps: { experiment: sweep } },
    );
    const before = result.current.metrics!.tiles;
    expect(before[0]!.frames.length).toBeGreaterThan(0);

    // A progress-only publish: a new record whose frames are the same array.
    rerender({
      experiment: {
        ...sweep,
        progress: {
          ...sweep.progress!,
          completedRuns: sweep.progress!.completedRuns + 1,
        },
      },
    });

    const after = result.current.metrics!.tiles;
    expect(after).toBe(before);
    expect(after[0]!.frames).toBe(before[0]!.frames);
  });
});

/** A study started from the sweep: four steps landed, one of them pruned, the third the best. */
const sweepStudy = (
  status: OptimizationRecord["status"],
  input = fakeStudyInput,
  trials = fakeStudyTrials.trials,
): OptimizationRecord => ({
  ...makeOptimizationRecord({
    input,
    status,
    trials: trials.slice(0, 4),
    best: { trial: 2, parameters: {}, objective: 650.5 },
  }),
  id: "study",
  origin: { kind: "sweep", experimentId: sweep.id },
  completedTrials: 3,
  prunedTrials: 1,
  failedTrials: 0,
});

/** The optimizer with `study` as the sweep's study. */
const withStudy = (
  study: OptimizationRecord,
  driving: ExperimentResultsDependencies["optimizer"]["driving"] = null,
): ExperimentResultsDependencies["optimizer"] => ({
  ...idleOptimizer,
  study,
  driving,
});

describe("experimentResultsModel with the optimizer", () => {
  const study = sweepStudy("running");
  const driving = { step: 5, total: 30 };
  /** The record between two steps: the session idles until the next point. */
  const betweenSteps = model(idleSweep, {
    optimizer: withStudy(study, driving),
  });

  it("puts Stop on the Parameters card only while the study drives the sweep", () => {
    expect(model(sweep).bands[0]!.trailing).toBeNull();
    const stop = vi.fn();
    const drivingCard = model(sweep, {
      optimizer: { ...withStudy(study, driving), stop },
    }).bands[0]!;
    expect(
      propsOf<{ children: string; onClick: () => void }>(drivingCard.trailing),
    ).toMatchObject({ children: "Stop", "data-sweep-optimizing": true });
    propsOf<{ onClick: () => void }>(drivingCard.trailing).onClick();
    expect(stop).toHaveBeenCalledOnce();
    expect(
      model(idleSweep, {
        optimizer: withStudy({ ...study, status: "complete" }),
      }).bands[0]!.trailing,
    ).toBeNull();
  });

  it("turns the Parameters card and the surface purple while a study drives the sweep", () => {
    const result = model(sweep, { optimizer: withStudy(study, driving) });
    expect(result.bands[0]!.tone).toBe("optimizing");
    expect(surfaceOf(result)).toMatchObject({
      following: true,
      disabled: true,
      tone: "optimizing",
    });
  });

  it("reads Optimizing from the study across the gap between steps, with Cancel offered", () => {
    expect(betweenSteps.header.status).toEqual({
      label: "Optimizing",
      tone: "active",
      widest: "Initializing",
    });
    expect(isValidElement(footerButtonsOf(betweenSteps)[0])).toBe(true);
  });

  it("fills the progress bar with the steps finished, not the step's runs", () => {
    expect(betweenSteps.header.progress).toBeCloseTo((4 / 30) * 100);
  });

  it("names the step on the computing batch and the navigator, whose sliders lock", () => {
    const result = model(
      {
        ...sweep,
        sweepBatches: [
          { id: 7, kind: "selection", runCount: 8, completedRuns: 3 },
        ],
      },
      { optimizer: withStudy(study, driving) },
    );
    expect(result.header.activity?.map((batch) => batch.label)).toEqual([
      "Step 5",
    ]);
    expect(navigatorOf(result)).toMatchObject({
      status: { following: { kind: "following", step: 5, total: 30 } },
      disabled: true,
    });
  });

  it("puts the objective strip under the sliders whenever the sweep has a study, driving or settled", () => {
    expect(model(sweep).bands[0]!.below).toBeNull();
    const strip = propsOf<{ study: unknown; driving: boolean }>(
      betweenSteps.bands[0]!.below,
    );
    expect(isValidElement(betweenSteps.bands[0]!.below)).toBe(true);
    expect(strip.study).toBe(study);
    expect(strip.driving).toBe(true);
    const settled = { ...study, status: "complete" as const };
    expect(
      propsOf<{ driving: boolean }>(
        model(idleSweep, { optimizer: withStudy(settled) }).bands[0]!.below,
      ).driving,
    ).toBe(false);
  });

  it("stops the study before cancelling the sweep", () => {
    const stop = vi.fn();
    const cancelExperiment = vi.fn();
    const result = model(sweep, {
      actions: { ...dependencies.actions, cancelExperiment },
      optimizer: { ...withStudy(study, driving), stop },
    });
    propsOf<{ onClick: () => void }>(footerButtonsOf(result)[0]).onClick();
    expect(stop).toHaveBeenCalledOnce();
    expect(cancelExperiment).toHaveBeenCalledWith(sweep.id);
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(
      cancelExperiment.mock.invocationCallOrder[0]!,
    );
  });

  it("discards the study with the experiment from Remove", () => {
    const discard = vi.fn();
    const removeExperiment = vi.fn();
    const onClose = vi.fn();
    const result = model(idleSweep, {
      actions: { ...dependencies.actions, removeExperiment },
      optimizer: { ...withStudy({ ...study, status: "complete" }), discard },
      onClose,
    });
    propsOf<{ onClick: () => void }>(result.footerSecondary).onClick();
    expect(discard).toHaveBeenCalledOnce();
    expect(removeExperiment).toHaveBeenCalledWith(sweep.id);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps a settled study's outcome on the navigator's status line and frees the sliders", () => {
    const finished = {
      ...study,
      status: "complete" as const,
      completedTrials: 29,
    };
    const result = model(idleSweep, { optimizer: withStudy(finished) });
    expect(result.header.status.label).toBe("Idle");
    expect(result.bands[0]!.tone).toBe("default");
    expect(navigatorOf(result)).toMatchObject({
      status: {
        following: {
          kind: "settled",
          summary: `Finished 30 steps · best step so far: step 3 (${formatNumber(650.5)})`,
        },
      },
      disabled: false,
    });
  });

  it("puts a failed study's error in the note row, after the experiment's own", () => {
    const failed = {
      ...study,
      status: "error" as const,
      error: "The in-browser optimizer could not start",
    };
    const result = model(idleSweep, { optimizer: withStudy(failed) });
    expect(result.header.note).toEqual({
      content: "The in-browser optimizer could not start",
      tone: "error",
    });
    expect(
      model(
        { ...idleSweep, error: "worker crashed" },
        { optimizer: withStudy(failed) },
      ).header.note?.content,
    ).toBe("worker crashed");
  });
});

describe("experimentResultsModel with constraints", () => {
  const constrained = makeConstrainedSweepExperiment();

  it("gives the Parameters card no fold without constraints", () => {
    expect(model(sweep).bands[0]!.more).toBeNull();
  });

  it("folds the constraints behind the Parameters card's footer from creation on", () => {
    const more = model(constrained).bands[0]!.more;
    expect(more).toMatchObject({
      show: "Show 2 constraints",
      hide: "Hide constraints",
    });
    expect(isValidElement(more!.content)).toBe(true);
    expect(
      model({
        ...constrained,
        constraints: constrained.constraints.slice(0, 1),
      }).bands[0]!.more?.show,
    ).toBe("Show 1 constraint");
  });

  it("changes nothing else about the model", () => {
    const shape = (result: ReturnType<typeof model>) => ({
      ...shapeOf(result),
      status: result.header.status,
    });
    expect(shape(model(constrained))).toEqual(shape(model(sweep)));
  });
});

describe("experimentResultsModel with a study", () => {
  const driving = { step: 5, total: 30 };
  const runningStudy = sweepStudy("running");
  const running = model(idleSweep, {
    optimizer: withStudy(runningStudy, driving),
  });

  it("shows nothing of a study for a sweep created without one", () => {
    const result = model(sweep);
    expect(result.header.headline).toBeNull();
    expect(Object.keys(statTexts(sweep))).toEqual([
      "Selection",
      "Errors",
      "Time",
    ]);
    expect(result.metrics?.cards).toBeNull();
    expect(result.after).toBeNull();
  });

  it("fills the headline, the Steps column, the Sensitivity card and the steps table from the study", () => {
    expect(isValidElement(running.header.headline)).toBe(true);
    expect(running.header.stats.map((stat) => stat.label)).toEqual([
      "Selection",
      "Errors",
      "Time",
      "Steps",
    ]);
    const steps = running.header.stats.find((stat) => stat.id === "steps")!;
    expect(steps.value.text).toBe("4 / 30");
    expect(steps.widest).toBe("30 / 30");
    expect(steps.short).toEqual({ text: "4 / 30", widest: "30 / 30" });
    expect(running.header.stats.some((stat) => stat.id === "best")).toBe(false);
    const cards = propsOf<{ children: ReactNode[] }>(
      running.metrics!.cards,
    ).children;
    expect(cards[0]).toBeNull();
    expect(propsOf<{ plotHeight: number }>(cards[1]).plotHeight).toBe(220);
    expect(
      propsOf<{ bestTrial: number | null; optimization: OptimizationRecord }>(
        running.after,
      ),
    ).toMatchObject({ bestTrial: 2, optimization: { id: "study" } });
  });

  it("keeps the objective strip under the sliders beside the study's cards", () => {
    expect(isValidElement(running.bands[0]!.below)).toBe(true);
    expect(propsOf<{ study: unknown }>(running.bands[0]!.below).study).toBe(
      runningStudy,
    );
  });

  it("adds Steps clear and the Constraints card only for a constrained study, in the card's tone", () => {
    const constrained = model(makeConstrainedSweepExperiment(), {
      optimizer: withStudy(
        sweepStudy(
          "running",
          fakeConstrainedStudyInput,
          fakeConstrainedStudyTrials.trials,
        ),
        driving,
      ),
    });
    expect(constrained.header.stats.map((stat) => stat.label)).toEqual([
      "Selection",
      "Errors",
      "Time",
      "Steps",
      "Steps clear",
    ]);
    const stepsClear = constrained.header.stats.find(
      (stat) => stat.id === "steps-clear",
    )!;
    expect(stepsClear.value.text).toMatch(/^\d+ \/ \d+ · \d+%$/u);
    expect(stepsClear.widest).toBe("30 / 30 · 100%");
    expect(
      constrained.header.stats.find((stat) => stat.id === "steps")?.value.text,
    ).toBe("4 / 30 · 60 runs each");
    const cards = propsOf<{ children: ReactNode[] }>(
      constrained.metrics!.cards,
    ).children;
    expect(
      propsOf<{ tone: string; plotHeight: number }>(cards[0]),
    ).toMatchObject({ tone: "optimizing", plotHeight: 220 });
    // The experiment's own constraints do not add the column; the study's do.
    expect(
      model(makeConstrainedSweepExperiment(), {
        optimizer: withStudy(sweepStudy("running"), driving),
      }).header.stats.some((stat) => stat.id === "steps-clear"),
    ).toBe(false);
  });

  it("keeps every slot but Stop and the tone once the study settles, stopped or failed", () => {
    const runningShape = shapeOf(running);
    for (const status of ["cancelled", "error"] as const) {
      const settled = model(idleSweep, {
        optimizer: withStudy({
          ...sweepStudy(status),
          error: status === "error" ? "worker crashed" : null,
        }),
      });
      expect(settled.bands[0]!.tone).toBe("default");
      expect(shapeOf(settled)).toEqual({
        ...runningShape,
        bands: runningShape.bands.map((band) => ({
          ...band,
          tone: "default",
          trailing: false,
        })),
      });
    }
  });

  it("gives two renders of a sweep created without a study one shape", () => {
    expect(shapeOf(model(idleSweep))).toEqual(
      shapeOf(model({ ...idleSweep, status: "cancelled" })),
    );
  });
});
