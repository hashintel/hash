import { describe, expect, it } from "vitest";

import { surfaceFieldKey } from "../../shared/surface-field";
import {
  computingSurfaceField,
  describeVisitedSurface,
  visitedSurfaceField,
} from "./visited-field";

import type { ExperimentParameterAxis } from "../../../../../../../react/experiments/parameter-grid";
import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

/** Fifty positions, so the plot samples eleven columns. */
const X: ExperimentParameterAxis = {
  identifier: "x",
  min: 0,
  max: 1,
  stepCount: 50,
  integer: false,
};
/** Ten positions, so the plot samples every one. */
const Y: ExperimentParameterAxis = {
  identifier: "y",
  min: 0,
  max: 10,
  stepCount: 10,
  integer: true,
};

const frame = (value: number): MonteCarloUserDefinedMetricFrame => ({
  metricId: "m",
  label: "M",
  outputType: "distribution",
  frameNumber: 1,
  time: 1,
  bins: [[value, 8]],
  value: null,
  frameValue: null,
  timeValue: null,
  runSampleCount: 8,
  timeSampleCount: 8,
});

describe("visitedSurfaceField", () => {
  it("places every visited point at its fractional grid coordinate, emphasizing the selected one", () => {
    const field = visitedSurfaceField({
      visited: [
        { position: { x: 25, y: 5 }, runsCompleted: 8, means: { m: 3 } },
        { position: { x: 50, y: 0 }, runsCompleted: 25, means: { m: 7 } },
        { position: { x: 0, y: 10 }, runsCompleted: 8, means: {} },
      ],
      xAxis: X,
      yAxis: Y,
      metricId: "m",
      selection: { x: { from: 50, to: 50 }, y: { from: 0, to: 0 } },
    });

    expect([...field.values]).toEqual([
      [surfaceFieldKey(5, 5), 3],
      [surfaceFieldKey(10, 0), 7],
    ]);
    expect(field.markers).toEqual([
      { x: 5, y: 5, kind: "dot", emphasis: false },
      { x: 10, y: 0, kind: "dot", emphasis: true },
      // A point that never measured the metric is a muted ring.
      { x: 0, y: 10, kind: "muted" },
    ]);
  });

  it("skips a point missing a shown axis", () => {
    const field = visitedSurfaceField({
      visited: [{ position: { x: 25 }, runsCompleted: 8, means: { m: 3 } }],
      xAxis: X,
      yAxis: Y,
      metricId: "m",
      selection: { x: { from: 0, to: 50 }, y: { from: 0, to: 10 } },
    });
    expect(field.values.size).toBe(0);
    expect(field.markers).toEqual([]);
  });
});

describe("computingSurfaceField", () => {
  it("rings the point being computed and feeds its running value into the field", () => {
    const field = computingSurfaceField({
      selection: { x: { from: 10, to: 10 }, y: { from: 2, to: 2 } },
      axes: [X, Y],
      xAxis: X,
      yAxis: Y,
      metricId: "m",
      computing: true,
      metricFrames: [frame(4)],
    });
    expect(field.markers).toEqual([{ x: 2, y: 2, kind: "point" }]);
    expect([...field.values]).toEqual([[surfaceFieldKey(2, 2), 4]]);
  });

  it("draws nothing for a range selection or an idle sweep", () => {
    const idle = computingSurfaceField({
      selection: { x: { from: 10, to: 10 }, y: { from: 2, to: 2 } },
      axes: [X, Y],
      xAxis: X,
      yAxis: Y,
      metricId: "m",
      computing: false,
      metricFrames: [frame(4)],
    });
    const range = computingSurfaceField({
      selection: { x: { from: 0, to: 50 }, y: { from: 2, to: 2 } },
      axes: [X, Y],
      xAxis: X,
      yAxis: Y,
      metricId: "m",
      computing: true,
      metricFrames: [frame(4)],
    });
    expect(idle.markers).toEqual([]);
    expect(range.markers).toEqual([]);
    expect(range.values.size).toBe(0);
  });
});

describe("describeVisitedSurface", () => {
  it("counts the points, says what computes and who picks the next point", () => {
    expect(
      describeVisitedSurface({
        visitedCount: 0,
        computing: false,
        runsCompleted: 0,
        runTarget: null,
        following: false,
      }),
    ).toBe("no points yet · drag or click to compute a point");
    expect(
      describeVisitedSurface({
        visitedCount: 3,
        computing: true,
        runsCompleted: 8,
        runTarget: 25,
        following: false,
      }),
    ).toBe(
      "3 points · computing the selected point: 8 of 25 runs · drag or click to compute a point",
    );
    expect(
      describeVisitedSurface({
        visitedCount: 1,
        computing: true,
        runsCompleted: 8,
        runTarget: 25,
        following: true,
      }),
    ).toBe("1 point · the optimizer is choosing the next point");
  });
});
