import { describe, expect, it } from "vitest";

import { contourSurfaceKey } from "../../../../../../components/contour-surface";
import {
  computingSurfaceField,
  describeVisitedSurface,
  visitedSurfaceField,
} from "./visited-field";

import type { ExperimentParameterAxis } from "../../../../../../../react/experiments/parameter-grid";

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

describe("visitedSurfaceField", () => {
  it("places every visited point at its fractional grid coordinate, emphasizing the selected one", () => {
    const field = visitedSurfaceField({
      visited: [
        {
          position: { x: 25, y: 5 },
          runsCompleted: 8,
          means: { m: 3 },
          sampleCounts: { m: 8 },
        },
        {
          position: { x: 50, y: 0 },
          runsCompleted: 25,
          means: { m: 7 },
          sampleCounts: { m: 25 },
        },
        {
          position: { x: 0, y: 10 },
          runsCompleted: 8,
          means: {},
          sampleCounts: {},
        },
      ],
      xAxis: X,
      yAxis: Y,
      metricId: "m",
      selection: { x: { from: 50, to: 50 }, y: { from: 0, to: 0 } },
    });

    expect([...field.values]).toEqual([
      [contourSurfaceKey(5, 5), 3],
      [contourSurfaceKey(10, 0), 7],
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
      visited: [
        {
          position: { x: 25 },
          runsCompleted: 8,
          means: { m: 3 },
          sampleCounts: { m: 8 },
        },
      ],
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
  it("rings the point being computed and adds no value: the fold supplies it", () => {
    const field = computingSurfaceField({
      selection: { x: { from: 10, to: 10 }, y: { from: 2, to: 2 } },
      axes: [X, Y],
      xAxis: X,
      yAxis: Y,
      computing: true,
    });
    expect(field.markers).toEqual([{ x: 2, y: 2, kind: "point" }]);
    expect(field.values.size).toBe(0);
  });

  it("draws nothing for a range selection or an idle sweep", () => {
    const idle = computingSurfaceField({
      selection: { x: { from: 10, to: 10 }, y: { from: 2, to: 2 } },
      axes: [X, Y],
      xAxis: X,
      yAxis: Y,
      computing: false,
    });
    const range = computingSurfaceField({
      selection: { x: { from: 0, to: 50 }, y: { from: 2, to: 2 } },
      axes: [X, Y],
      xAxis: X,
      yAxis: Y,
      computing: true,
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
        pointSelection: false,
        runsCompleted: 0,
        runTarget: null,
        following: false,
      }),
    ).toBe("no points yet · drag or click to compute a point");
    expect(
      describeVisitedSurface({
        visitedCount: 3,
        computing: true,
        pointSelection: true,
        runsCompleted: 8,
        runTarget: 25,
        following: false,
      }),
    ).toBe(
      "3 points · computing the selected point: 8 of 25 runs · drag or click to compute a point",
    );
  });

  it("words a range compute as the navigator does", () => {
    expect(
      describeVisitedSurface({
        visitedCount: 3,
        computing: true,
        pointSelection: false,
        runsCompleted: 8,
        runTarget: null,
        following: false,
      }),
    ).toBe(
      "3 points · sampling across the selected ranges: 8 runs · drag or click to compute a point",
    );
  });

  it("names the step's point computing while the optimizer drives, and the optimizer choosing between steps", () => {
    expect(
      describeVisitedSurface({
        visitedCount: 1,
        computing: true,
        pointSelection: true,
        runsCompleted: 5,
        runTarget: 8,
        following: true,
      }),
    ).toBe("1 point · computing the selected point: 5 of 8 runs");
    expect(
      describeVisitedSurface({
        visitedCount: 1,
        computing: false,
        pointSelection: true,
        runsCompleted: 8,
        runTarget: null,
        following: true,
      }),
    ).toBe("1 point · the optimizer is choosing the next point");
  });
});
