/* eslint-disable id-length */
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { INF_DIST, SparseStressSeeder } from "./sparse-stress-seed";

const finiteCoords = (x: Float32Array, y: Float32Array) => {
  for (let i = 0; i < x.length; i++) {
    expect(Number.isFinite(x[i])).toBe(true);
    expect(Number.isFinite(y[i])).toBe(true);
  }
};

const runWithTinyTicks = (seeder: SparseStressSeeder) => {
  let previousProgress = 0;
  let last = seeder.tick({ maxWork: 1 });
  for (let i = 0; i < 100_000 && !last.done; i++) {
    expect(last.progress).toBeGreaterThanOrEqual(previousProgress);
    expect(last.progress).toBeGreaterThanOrEqual(0);
    expect(last.progress).toBeLessThanOrEqual(1);
    previousProgress = last.progress;
    last = seeder.tick({ maxWork: 1 });
  }
  expect(last.done).toBe(true);
  expect(last.progress).toBe(1);
  expect(last.result).toBeDefined();
  return last.result!;
};

describe("SparseStressSeeder", () => {
  it("discovers weak components and fills component nodes", () => {
    const seeder = new SparseStressSeeder(
      {
        n: 5,
        src: new Uint32Array([0, 2]),
        dst: new Uint32Array([1, 3]),
      },
      { epochs: 0, pivotCount: 3, jitter: 0, packComponents: false },
    );

    const result = seeder.run();
    expect(result.components.count).toBe(3);
    expect(Array.from(result.components.sizes)).toEqual([2, 2, 1]);
    expect(Array.from(result.components.nodes).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(Array.from(result.components.labels)).toEqual([0, 0, 1, 1, 2]);
  });

  it("run() drives all phases to completion", () => {
    const seeder = new SparseStressSeeder(
      {
        n: 4,
        src: new Uint32Array([0, 1, 2]),
        dst: new Uint32Array([1, 2, 3]),
      },
      { epochs: 2, pivotCount: 2, jitter: 0 },
    );

    const result = seeder.run();
    expect(seeder.phase).toBe("stress-done");
    expect(result.x.length).toBe(4);
    expect(result.y.length).toBe(4);
    finiteCoords(result.x, result.y);
  });

  it("can be advanced with tiny tick budgets and reports monotonic progress", () => {
    const seeder = new SparseStressSeeder(
      {
        n: 8,
        src: new Uint32Array([0, 1, 2, 3, 4, 5, 6]),
        dst: new Uint32Array([1, 2, 3, 4, 5, 6, 7]),
      },
      { epochs: 2, pivotCount: 3, jitter: 0, pivotsPerEpoch: 2 },
    );

    const result = runWithTinyTicks(seeder);
    finiteCoords(result.x, result.y);
  });

  it("uses pivot row indices during coordinate initialization", () => {
    const n = 20;
    const src = new Uint32Array(n - 1);
    const dst = new Uint32Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      src[i] = i;
      dst[i] = i + 1;
    }

    const result = new SparseStressSeeder(
      { n, src, dst },
      { epochs: 0, pivotCount: 4, jitter: 0, packComponents: false },
    ).run();

    finiteCoords(result.x, result.y);
  });

  it("keeps initial positions when keepInitialPositions is true", () => {
    const x = new Float32Array([10, 20]);
    const y = new Float32Array([5, 9]);

    const result = new SparseStressSeeder(
      { n: 2, src: new Uint32Array([0]), dst: new Uint32Array([1]), x, y },
      {
        epochs: 0,
        pivotCount: 0,
        jitter: 0,
        keepInitialPositions: true,
        packComponents: false,
      },
    ).run();

    expect(result.x[1]! - result.x[0]!).toBeCloseTo(10, 5);
    expect(result.y[1]! - result.y[0]!).toBeCloseTo(4, 5);
  });

  it("wires directedFlow into the stress phase", () => {
    const x = new Float32Array([0, 0]);
    const y = new Float32Array([0, 0]);

    const result = new SparseStressSeeder(
      { n: 2, src: new Uint32Array([0]), dst: new Uint32Array([1]), x, y },
      {
        epochs: 1,
        pivotCount: 0,
        jitter: 0,
        edgeWeight: 0,
        keepInitialPositions: true,
        packComponents: false,
        directedFlow: { enabled: true, separation: 4, alpha: 1 },
      },
    ).run();

    expect(result.y[1]! - result.y[0]!).toBeGreaterThanOrEqual(4 - 1e-5);
  });

  it("omits pivot distances from the result unless requested", () => {
    const input = {
      n: 4,
      src: new Uint32Array([0, 1, 2]),
      dst: new Uint32Array([1, 2, 3]),
    };

    const stripped = new SparseStressSeeder(input, {
      epochs: 0,
      pivotCount: 2,
      returnPivotDistances: false,
    }).run();
    expect(stripped.pivots.distances.length).toBe(0);

    const retained = new SparseStressSeeder(input, {
      epochs: 0,
      pivotCount: 2,
      returnPivotDistances: true,
    }).run();
    expect(retained.pivots.distances.length).toBeGreaterThan(0);
    expect(retained.pivots.distances.some((d) => d !== INF_DIST)).toBe(true);
  });
});
