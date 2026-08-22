import { describe, expect, it, vi } from "vitest";

import {
  getDefaultMonteCarloShardCount,
  planMonteCarloShards,
} from "./shard-plan";

describe("planMonteCarloShards", () => {
  it("splits runs evenly when they divide exactly", () => {
    expect(planMonteCarloShards(1000, 4)).toStrictEqual([
      { runIndexOffset: 0, runCount: 250 },
      { runIndexOffset: 250, runCount: 250 },
      { runIndexOffset: 500, runCount: 250 },
      { runIndexOffset: 750, runCount: 250 },
    ]);
  });

  it("spreads the remainder across leading shards instead of one straggler", () => {
    const plan = planMonteCarloShards(1003, 4);

    expect(plan.map((shard) => shard.runCount)).toStrictEqual([
      251, 251, 251, 250,
    ]);
    // Slice sizes differ by at most one, so no shard becomes the run everyone
    // else waits on.
    expect(Math.max(...plan.map((shard) => shard.runCount))).toBe(251);
  });

  it("covers every run exactly once, contiguously", () => {
    for (const [runCount, shardCount] of [
      [1000, 7],
      [13, 5],
      [100, 3],
    ] as const) {
      const plan = planMonteCarloShards(runCount, shardCount);

      let expectedOffset = 0;
      for (const shard of plan) {
        expect(shard.runIndexOffset).toBe(expectedOffset);
        expect(shard.runCount).toBeGreaterThan(0);
        expectedOffset += shard.runCount;
      }
      expect(expectedOffset).toBe(runCount);
    }
  });

  it("never creates an empty shard when runs are scarcer than shards", () => {
    const plan = planMonteCarloShards(3, 16);

    expect(plan).toHaveLength(3);
    expect(plan.every((shard) => shard.runCount === 1)).toBe(true);
  });

  it("produces a single full slice for one shard", () => {
    expect(planMonteCarloShards(500, 1)).toStrictEqual([
      { runIndexOffset: 0, runCount: 500 },
    ]);
  });

  it.each([
    [0, 4],
    [-1, 4],
    [1.5, 4],
    [10, 0],
    [10, -2],
  ])("rejects runCount %s with shardCount %s", (runCount, shardCount) => {
    expect(() => planMonteCarloShards(runCount, shardCount)).toThrow(
      /requires a positive/,
    );
  });
});

describe("getDefaultMonteCarloShardCount", () => {
  // `navigator` is getter-only in Node, so it has to be stubbed rather than
  // assigned.
  const withHardwareConcurrency = (
    value: number | undefined,
    body: () => void,
  ) => {
    vi.stubGlobal(
      "navigator",
      value === undefined ? {} : { hardwareConcurrency: value },
    );
    try {
      body();
    } finally {
      vi.unstubAllGlobals();
    }
  };

  it("leaves one core for the main thread", () => {
    withHardwareConcurrency(10, () => {
      expect(getDefaultMonteCarloShardCount(1000)).toBe(9);
    });
  });

  it("never exceeds the run count", () => {
    withHardwareConcurrency(10, () => {
      expect(getDefaultMonteCarloShardCount(3)).toBe(3);
    });
  });

  it("still yields one shard on a single-core host", () => {
    withHardwareConcurrency(1, () => {
      expect(getDefaultMonteCarloShardCount(1000)).toBe(1);
    });
  });

  it("falls back to one shard when the host reports no core count", () => {
    withHardwareConcurrency(undefined, () => {
      expect(getDefaultMonteCarloShardCount(1000)).toBe(1);
    });
  });
});
