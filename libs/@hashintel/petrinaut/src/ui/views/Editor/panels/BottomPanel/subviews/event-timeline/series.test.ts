import { describe, expect, it } from "vitest";

import {
  stackColumns,
  stackedBandAt,
  stackedBandValue,
  stackedSeriesOf,
} from "./series";

import type { TimelineSeriesMeta } from "../simulation-timeline/types";
import type uPlot from "uplot";

const series: TimelineSeriesMeta[] = [
  { seriesId: "a", seriesName: "A", color: "#a00" },
  { seriesId: "b", seriesName: "B", color: "#0b0" },
  { seriesId: "c", seriesName: "C", color: "#00c" },
];

const data = [
  [0, 1, 2],
  [1, 2, 3],
  [10, 20, null],
  [100, Number.NaN, 300],
] as unknown as uPlot.AlignedData;

describe("stacking a timeline", () => {
  it("draws the visible series, top band first", () => {
    expect(
      stackedSeriesOf(series, new Set()).map((entry) => entry.seriesId),
    ).toEqual(["c", "b", "a"]);
    expect(
      stackedSeriesOf(series, new Set(["b"])).map((entry) => entry.seriesId),
    ).toEqual(["c", "a"]);
  });

  it("returns the same list for the same series and hidden set, so the chart is not rebuilt as a run streams", () => {
    const hidden = new Set(["b"]);
    expect(stackedSeriesOf(series, hidden)).toBe(
      stackedSeriesOf(series, hidden),
    );
    expect(stackedSeriesOf(series, new Set(["b"]))).not.toBe(
      stackedSeriesOf(series, hidden),
    );
  });

  it("adds each series to those before it, counting a gap as nothing", () => {
    expect(stackColumns(data, series, new Set())).toEqual([
      [0, 1, 2],
      [111, 22, 303],
      [11, 22, 3],
      [1, 2, 3],
    ]);
  });

  it("leaves a hidden series out of the sums", () => {
    expect(stackColumns(data, series, new Set(["b"]))).toEqual([
      [0, 1, 2],
      [101, 2, 303],
      [1, 2, 3],
    ]);
  });

  it("reads a band's own value back off the stack", () => {
    const stacked = stackColumns(data, series, new Set());
    // Series 1 is the top band, C; series 3 the bottom one, A.
    expect(stackedBandValue(stacked, 1, 0)).toBe(100);
    expect(stackedBandValue(stacked, 2, 1)).toBe(20);
    expect(stackedBandValue(stacked, 3, 2)).toBe(3);
    expect(stackedBandValue(stacked, 4, 0)).toBeUndefined();
  });

  it("finds the band that holds a value, not the one whose edge is nearest", () => {
    // Bands at row 0, top first: c reaches 111, b reaches 11, a reaches 1.
    const stacked = stackColumns(data, series, new Set());
    expect(stackedBandAt(stacked, 0, 0.5)).toBe(3);
    expect(stackedBandAt(stacked, 0, 1.2)).toBe(2);
    expect(stackedBandAt(stacked, 0, 12)).toBe(1);
    expect(stackedBandAt(stacked, 0, 112)).toBeNull();
    expect(stackedBandAt(stacked, 0, -1)).toBeNull();
  });
});
