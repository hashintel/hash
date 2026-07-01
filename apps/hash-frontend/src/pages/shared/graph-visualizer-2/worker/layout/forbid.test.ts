// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { mulberry32 } from "../../math/random";
import { ForbidOverlapSolver } from "./forbid";

interface DiskSet {
  x: Float32Array;
  y: Float32Array;
  radii: Float32Array;
  count: number;
}

/** All disks stacked within `jitter` of the origin — the pathological hub case. */
function coincident(count: number, radius = 6, jitter = 0): DiskSet {
  const rng = mulberry32(count * 7 + 1);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const radii = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    x[index] = (rng() - 0.5) * jitter;
    y[index] = (rng() - 0.5) * jitter;
    radii[index] = radius;
  }
  return { x, y, radii, count };
}

/** A realistic mix: a spread-out cloud plus one tight near-coincident hub. */
function cloudWithHub(
  cloudCount: number,
  hubCount: number,
  seed: number,
): DiskSet {
  const rng = mulberry32(seed);
  const count = cloudCount + hubCount;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const radii = new Float32Array(count);
  const span = Math.sqrt(cloudCount) * 40;
  for (let index = 0; index < cloudCount; index++) {
    x[index] = (rng() - 0.5) * span;
    y[index] = (rng() - 0.5) * span;
    radii[index] = 3 + rng() * 6;
  }
  // The hub: hubCount leaves all ~40px from a shared centre, mutually overlapping.
  const hubX = (rng() - 0.5) * span;
  const hubY = (rng() - 0.5) * span;
  for (let index = cloudCount; index < count; index++) {
    const angle = rng() * Math.PI * 2;
    x[index] = hubX + Math.cos(angle) * 40 * rng();
    y[index] = hubY + Math.sin(angle) * 40 * rng();
    radii[index] = 4;
  }
  return { x, y, radii, count };
}

/** Direct O(n²) disk-overlap count (centres closer than `r_i + r_j`). */
function diskOverlaps(set: DiskSet, eps = 1e-3): number {
  const { x, y, radii, count } = set;
  let pairs = 0;
  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) {
      const minDist = radii[a]! + radii[b]!;
      const dx = x[a]! - x[b]!;
      const dy = y[a]! - y[b]!;
      if (Math.sqrt(dx * dx + dy * dy) < minDist - eps) {
        pairs += 1;
      }
    }
  }
  return pairs;
}

const MARGIN = 8;

describe("ForbidOverlapSolver", () => {
  it("removes overlaps from a random cloud", () => {
    const set = cloudWithHub(500, 0, 3);
    const solver = new ForbidOverlapSolver(set.count);
    solver.reset(set.x, set.y, set.radii, set.count, { margin: MARGIN });
    const result = solver.runToCompletion();

    expect(result.done).toBe(true);
    expect(result.overlaps).toBe(0);
    expect(diskOverlaps(set)).toBe(0);
  });

  it.each([120, 150, 300, 1000])(
    "separates a %i-disk exactly-coincident pile-up",
    (count) => {
      const set = coincident(count);
      const solver = new ForbidOverlapSolver(count);
      solver.reset(set.x, set.y, set.radii, count, { margin: MARGIN });
      const result = solver.runToCompletion();

      expect(result.done).toBe(true);
      expect(result.overlaps).toBe(0);
      expect(diskOverlaps(set)).toBe(0);
    },
  );

  it("separates a cloud with a tight near-coincident hub", () => {
    const set = cloudWithHub(1000, 150, 11);
    const solver = new ForbidOverlapSolver(set.count);
    solver.reset(set.x, set.y, set.radii, set.count, { margin: MARGIN });
    const result = solver.runToCompletion();

    expect(result.done).toBe(true);
    expect(diskOverlaps(set)).toBe(0);
  });

  it("is deterministic (same input ⇒ identical output)", () => {
    const first = coincident(200, 5, 2);
    const second = coincident(200, 5, 2);

    const solverA = new ForbidOverlapSolver(200);
    solverA.reset(first.x, first.y, first.radii, 200, { margin: MARGIN });
    solverA.runToCompletion();

    const solverB = new ForbidOverlapSolver(200);
    solverB.reset(second.x, second.y, second.radii, 200, { margin: MARGIN });
    solverB.runToCompletion();

    expect(Array.from(first.x)).toEqual(Array.from(second.x));
    expect(Array.from(first.y)).toEqual(Array.from(second.y));
  });

  it("keeps each epoch cheap on a 5000-node cloud with a coincident hub", () => {
    const set = cloudWithHub(4850, 150, 23);
    const solver = new ForbidOverlapSolver(set.count);
    solver.reset(set.x, set.y, set.radii, set.count, { margin: MARGIN });

    let worstEpochMs = 0;
    let epochs = 0;
    while (!solver.done) {
      const start = performance.now();
      solver.step();
      worstEpochMs = Math.max(worstEpochMs, performance.now() - start);
      epochs += 1;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[forbid] n=${set.count} epochs=${epochs} expansions=${solver.expansions} worstEpochMs=${worstEpochMs.toFixed(2)}`,
    );
    expect(diskOverlaps(set)).toBe(0);
    // No single epoch (⇒ no single tick's inner step) may approach a frozen frame.
    expect(worstEpochMs).toBeLessThan(50);
  });
});
