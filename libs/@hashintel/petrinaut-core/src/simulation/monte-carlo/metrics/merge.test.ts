import { describe, expect, it } from "vitest";

import { createMonteCarloMetricShardMerger } from "./merge";

import type {
  MonteCarloUserDefinedMetricAggregation,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloUserDefinedMetricTimeAggregation,
} from "./types";

/** Builds a scalar shard frame as a worker would emit it for `values`. */
function scalarFrame(options: {
  frameNumber: number;
  values: readonly number[];
  aggregateRuns?: MonteCarloUserDefinedMetricAggregation;
  aggregateTime?: MonteCarloUserDefinedMetricTimeAggregation;
  metricId?: string;
}): MonteCarloUserDefinedMetricFrame {
  const {
    frameNumber,
    values,
    aggregateRuns = "mean",
    aggregateTime = "none",
    metricId = "m",
  } = options;

  const count = values.length;
  const sum = values.reduce((total, value) => total + value, 0);
  const frameValue =
    count === 0
      ? null
      : aggregateRuns === "mean"
        ? sum / count
        : aggregateRuns === "sum"
          ? sum
          : aggregateRuns === "min"
            ? Math.min(...values)
            : aggregateRuns === "max"
              ? Math.max(...values)
              : values.at(-1)!;

  return {
    metricId,
    label: metricId,
    outputType: "scalar",
    frameNumber,
    time: frameNumber * 0.1,
    value: frameValue,
    frameValue,
    timeValue: null,
    runSampleCount: count,
    timeSampleCount: 0,
    runAggregate: {
      count,
      sum,
      min: count === 0 ? null : Math.min(...values),
      max: count === 0 ? null : Math.max(...values),
      last: count === 0 ? null : values.at(-1)!,
    },
    aggregateRuns,
    aggregateTime,
  };
}

function distributionFrame(
  frameNumber: number,
  bins: readonly [number, number][],
): MonteCarloUserDefinedMetricFrame {
  return {
    metricId: "d",
    label: "d",
    outputType: "distribution",
    frameNumber,
    time: frameNumber * 0.1,
    value: null,
    frameValue: null,
    timeValue: null,
    bins,
    runSampleCount: bins.reduce((total, [, frequency]) => total + frequency, 0),
    timeSampleCount: bins.reduce(
      (total, [, frequency]) => total + frequency,
      0,
    ),
  };
}

describe("createMonteCarloMetricShardMerger", () => {
  it("withholds a frame until every running shard has reported it", () => {
    const merger = createMonteCarloMetricShardMerger(2);

    expect(
      merger.accept(0, [scalarFrame({ frameNumber: 0, values: [1] })]),
    ).toHaveLength(0);

    const released = merger.accept(1, [
      scalarFrame({ frameNumber: 0, values: [3] }),
    ]);

    expect(released).toHaveLength(1);
    expect(released[0]!.frameValue).toBe(2);
  });

  it("means across shards by weight, not by averaging means", () => {
    const merger = createMonteCarloMetricShardMerger(2);

    // Shard 0 has three runs averaging 10; shard 1 has one run at 100.
    // A mean of means would give 55; the correct pooled mean is 32.5.
    merger.accept(0, [scalarFrame({ frameNumber: 0, values: [5, 10, 15] })]);
    const released = merger.accept(1, [
      scalarFrame({ frameNumber: 0, values: [100] }),
    ]);

    expect(released[0]!.frameValue).toBe(32.5);
    expect(released[0]!.runSampleCount).toBe(4);
  });

  it.each([
    ["sum", 130],
    ["min", 5],
    ["max", 100],
  ] as const)("merges the %s aggregation across shards", (method, expected) => {
    const merger = createMonteCarloMetricShardMerger(2);

    merger.accept(0, [
      scalarFrame({
        frameNumber: 0,
        values: [5, 10, 15],
        aggregateRuns: method,
      }),
    ]);
    const released = merger.accept(1, [
      scalarFrame({ frameNumber: 0, values: [100], aggregateRuns: method }),
    ]);

    expect(released[0]!.frameValue).toBe(expected);
  });

  it("resolves `last` by shard order even when shards reply out of order", () => {
    const merger = createMonteCarloMetricShardMerger(2);

    // Shard 1 owns the higher global run indices, so its last value wins —
    // regardless of which shard's message arrives first.
    merger.accept(1, [
      scalarFrame({ frameNumber: 0, values: [100], aggregateRuns: "last" }),
    ]);
    const released = merger.accept(0, [
      scalarFrame({ frameNumber: 0, values: [5], aggregateRuns: "last" }),
    ]);

    expect(released[0]!.frameValue).toBe(100);
  });

  it("sums distribution bins and keeps them sorted", () => {
    const merger = createMonteCarloMetricShardMerger(2);

    merger.accept(0, [
      distributionFrame(0, [
        [5, 2],
        [1, 1],
      ]),
    ]);
    const released = merger.accept(1, [
      distributionFrame(0, [
        [5, 3],
        [9, 1],
      ]),
    ]);

    expect(released[0]!.outputType).toBe("distribution");
    expect(
      (released[0] as { bins: readonly (readonly number[])[] }).bins,
    ).toStrictEqual([
      [1, 1],
      [5, 5],
      [9, 1],
    ]);
    expect(released[0]!.runSampleCount).toBe(7);
  });

  it("recomputes time aggregation from merged frame values", () => {
    const merger = createMonteCarloMetricShardMerger(2);
    const frames: MonteCarloUserDefinedMetricFrame[] = [];

    // Merged frame values are 2 then 20, so the running mean is 2 then 11.
    for (const [frameNumber, left, right] of [
      [0, 1, 3],
      [1, 10, 30],
    ] as const) {
      merger.accept(0, [
        scalarFrame({ frameNumber, values: [left], aggregateTime: "mean" }),
      ]);
      frames.push(
        ...merger.accept(1, [
          scalarFrame({ frameNumber, values: [right], aggregateTime: "mean" }),
        ]),
      );
    }

    expect(frames.map((frame) => frame.frameValue)).toStrictEqual([2, 20]);
    expect(frames.map((frame) => frame.timeValue)).toStrictEqual([2, 11]);
    // `value` follows the time aggregate when one is configured.
    expect(frames.map((frame) => frame.value)).toStrictEqual([2, 11]);
    expect(frames.map((frame) => frame.timeSampleCount)).toStrictEqual([1, 2]);
  });

  it("stops waiting on a shard once it finishes", () => {
    const merger = createMonteCarloMetricShardMerger(2);

    // Shard 1 completes early; shard 0 keeps producing frames and must not
    // stall waiting for a shard that will never report again.
    merger.accept(1, [scalarFrame({ frameNumber: 0, values: [3] })]);
    merger.accept(0, [scalarFrame({ frameNumber: 0, values: [1] })]);
    expect(merger.finishShard(1)).toHaveLength(0);

    const released = merger.accept(0, [
      scalarFrame({ frameNumber: 1, values: [7] }),
    ]);

    expect(released).toHaveLength(1);
    expect(released[0]!.frameNumber).toBe(1);
    // Only shard 0 still has active runs, so only its sample counts.
    expect(released[0]!.frameValue).toBe(7);
    expect(released[0]!.runSampleCount).toBe(1);
  });

  it("releases frames in ascending frame order across metrics", () => {
    const merger = createMonteCarloMetricShardMerger(1);

    const released = merger.accept(0, [
      scalarFrame({ frameNumber: 1, values: [1], metricId: "b" }),
      scalarFrame({ frameNumber: 0, values: [1], metricId: "a" }),
      scalarFrame({ frameNumber: 1, values: [1], metricId: "a" }),
      scalarFrame({ frameNumber: 0, values: [1], metricId: "b" }),
    ]);

    expect(released.map((frame) => frame.frameNumber)).toStrictEqual([
      0, 0, 1, 1,
    ]);
  });

  it("flushes buffered frames that no shard will complete", () => {
    const merger = createMonteCarloMetricShardMerger(2);

    merger.accept(0, [scalarFrame({ frameNumber: 0, values: [1] })]);

    expect(merger.flush().map((frame) => frame.frameNumber)).toStrictEqual([0]);
    expect(merger.flush()).toHaveLength(0);
  });

  it("rejects invalid shard counts and indices", () => {
    expect(() => createMonteCarloMetricShardMerger(0)).toThrow(
      /positive shard count/,
    );
    expect(() => createMonteCarloMetricShardMerger(1).accept(1, [])).toThrow(
      /Unknown metric shard index/,
    );
  });
});
