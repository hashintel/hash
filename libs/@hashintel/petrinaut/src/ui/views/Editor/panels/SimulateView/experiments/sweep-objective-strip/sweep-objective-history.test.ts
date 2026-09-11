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

/** A study over `objectives`, one trial each in order, asked for `requestedTrials`; complete unless a `status` says otherwise. */
const study = (
  objectives: readonly (number | null)[],
  {
    direction = "maximize",
    requestedTrials = objectives.length,
    best = null,
    status = "complete",
    metricName = "Infected peak",
  }: {
    direction?: PetrinautOptimizationDirection;
    requestedTrials?: number;
    best?: number | null;
    status?: OptimizationRecord["status"];
    metricName?: string;
  } = {},
): Pick<
  OptimizationRecord,
  "trials" | "input" | "requestedTrials" | "best" | "status"
> => ({
  status,
  trials: objectives.map((objective, index) => trial(index, objective)),
  input: {
    objective: { metricId: "infected", direction },
    model: {
      title: "SIR",
      definition: {
        metrics: [{ id: "infected", name: metricName, code: "" }],
      },
    },
  } as OptimizationRecord["input"],
  requestedTrials,
  best: best === null ? null : { trial: 0, parameters: {}, objective: best },
});

describe("buildSweepObjectiveHistory", () => {
  it("numbers the steps from 1 and names the metric and the best found", () => {
    const history = buildSweepObjectiveHistory(
      study([10, 12, 11, 9], {
        requestedTrials: 30,
        best: 12,
        status: "running",
      }),
    );

    expect(history.points.map((point) => point.step)).toEqual([1, 2, 3, 4]);
    expect(history.points.map((point) => point.bestSoFar)).toEqual([
      10, 12, 12, 12,
    ]);
    expect(history.metricName).toBe("Infected peak");
    expect(history.best).toBe(12);
  });

  it("follows a minimized study downwards", () => {
    const history = buildSweepObjectiveHistory(
      study([7, 4, 6], { direction: "minimize" }),
    );

    expect(history.points.map((point) => point.bestSoFar)).toEqual([7, 4, 4]);
  });

  it("pins the axis to the requested steps while the study runs, and never short of its points", () => {
    expect(
      buildSweepObjectiveHistory(
        study([1, 2], { requestedTrials: 30, status: "running" }),
      ).xMax,
    ).toBe(30);
    expect(
      buildSweepObjectiveHistory(
        study([1, 2, 3], { requestedTrials: 2, status: "running" }),
      ).xMax,
    ).toBe(3);
  });

  it("reaches the requested steps for a study that has just started, with no point yet", () => {
    expect(
      buildSweepObjectiveHistory(
        study([], { requestedTrials: 30, status: "initializing" }),
      ),
    ).toEqual({
      points: [],
      xMax: 30,
      metricName: "Infected peak",
      best: null,
    });
  });

  it("ends the axis at the last step run once the study is stopped or done", () => {
    expect(
      buildSweepObjectiveHistory(
        study([1, 2], { requestedTrials: 30, status: "cancelled" }),
      ).xMax,
    ).toBe(2);
    expect(
      buildSweepObjectiveHistory(
        study([1, 2, 3], { requestedTrials: 3, status: "complete" }),
      ).xMax,
    ).toBe(3);
  });

  it("summarises nothing, not even the metric, for a study that failed before its first step", () => {
    expect(
      buildSweepObjectiveHistory(
        study([], { requestedTrials: 30, status: "error", best: null }),
      ),
    ).toEqual({
      points: [],
      xMax: 0,
      metricName: "",
      best: null,
    });
  });

  it("keeps a pruned step in the numbering without a dot", () => {
    const history = buildSweepObjectiveHistory(study([4, null, 6]));

    expect(history.points.map((point) => point.objective)).toEqual([
      4,
      null,
      6,
    ]);
    expect(history.points.map((point) => point.step)).toEqual([1, 2, 3]);
  });
});
