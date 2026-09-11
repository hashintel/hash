import { describe, expect, it } from "vitest";

import { buildSweepObjectiveHistory } from "./sweep-objective-history";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";
import type {
  PetrinautOptimizationDirection,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";

const trial = (
  index: number,
  objective: number | null,
): PetrinautOptimizationTrialEvent => ({
  type: "trial",
  trial: index,
  seq: index + 1,
  parameters: {},
  objective,
  state: objective === null ? "pruned" : "complete",
  best: null,
});

/** A study over `objectives`, one trial each in order, asked for `requestedTrials`. */
const study = (
  objectives: readonly (number | null)[],
  {
    direction = "maximize",
    requestedTrials = objectives.length,
    best = null,
  }: {
    direction?: PetrinautOptimizationDirection;
    requestedTrials?: number;
    best?: number | null;
  } = {},
): Pick<
  OptimizationRecord,
  "trials" | "input" | "requestedTrials" | "best"
> => ({
  trials: objectives.map((objective, index) => trial(index, objective)),
  input: {
    objective: { metricId: "infected", direction },
    model: {
      title: "SIR",
      definition: {
        metrics: [{ id: "infected", name: "Infected peak", code: "" }],
      },
    },
  } as OptimizationRecord["input"],
  requestedTrials,
  best: best === null ? null : { trial: 0, parameters: {}, objective: best },
});

describe("buildSweepObjectiveHistory", () => {
  it("numbers a second study's steps after the first's and divides where it began", () => {
    const history = buildSweepObjectiveHistory([
      study([10, 12, 11]),
      study([5, 9], { requestedTrials: 20, best: 9 }),
    ]);

    expect(history.points.map((point) => point.step)).toEqual([1, 2, 3, 4, 5]);
    expect(history.dividers).toEqual([4]);
    expect(history.xMax).toBe(3 + 20);
    expect(history.metricName).toBe("Infected peak");
    expect(history.best).toBe(9);
  });

  it("restarts the best so far with each study", () => {
    const history = buildSweepObjectiveHistory([
      study([10, 12, 11]),
      study([5, 9]),
    ]);

    expect(history.points.map((point) => point.bestSoFar)).toEqual([
      10, 12, 12, 5, 9,
    ]);
  });

  it("follows a minimized study downwards after a maximized one", () => {
    const history = buildSweepObjectiveHistory([
      study([3, 8]),
      study([7, 4, 6], { direction: "minimize" }),
    ]);

    expect(history.points.map((point) => point.bestSoFar)).toEqual([
      3, 8, 7, 4, 4,
    ]);
  });

  it("offsets by the steps a stopped study ran, not the steps it asked for", () => {
    const history = buildSweepObjectiveHistory([
      study([1, 2], { requestedTrials: 30 }),
      study([3], { requestedTrials: 30 }),
    ]);

    expect(history.points.map((point) => point.step)).toEqual([1, 2, 3]);
    expect(history.dividers).toEqual([3]);
    expect(history.xMax).toBe(2 + 30);
  });

  it("pins the axis to one study's requested steps while it runs, and never short of its points", () => {
    expect(
      buildSweepObjectiveHistory([study([1, 2], { requestedTrials: 30 })]).xMax,
    ).toBe(30);
    expect(
      buildSweepObjectiveHistory([study([1, 2, 3], { requestedTrials: 2 })])
        .xMax,
    ).toBe(3);
  });

  it("keeps a pruned step in the numbering without a dot", () => {
    const history = buildSweepObjectiveHistory([study([4, null, 6])]);

    expect(history.points.map((point) => point.objective)).toEqual([
      4,
      null,
      6,
    ]);
    expect(history.points.map((point) => point.step)).toEqual([1, 2, 3]);
  });

  it("is empty without a study", () => {
    expect(buildSweepObjectiveHistory([])).toEqual({
      points: [],
      xMax: 0,
      dividers: [],
      metricName: "",
      best: null,
    });
  });
});
