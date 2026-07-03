import { describe, expect, it } from "vitest";

import {
  countOverlaps,
  overlapRelaxPass,
  OverlapSweep,
  relaxOverlaps,
} from "./overlap-relax";

/** Grid of `side × side` points spaced `spacing` apart, all radius `radius`. */
function grid(
  side: number,
  spacing: number,
  radius: number,
): { x: Float32Array; y: Float32Array; radii: Float32Array; count: number } {
  const count = side * side;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const radii = new Float32Array(count).fill(radius);
  for (let index = 0; index < count; index++) {
    x[index] = (index % side) * spacing;
    y[index] = Math.floor(index / side) * spacing;
  }
  return { x, y, radii, count };
}

describe("overlapRelaxPass", () => {
  it("resolves all overlaps given enough passes (no-overlap invariant)", () => {
    // 6×6 dots of radius 5 spaced only 4 apart: every neighbour overlaps.
    const { x, y, radii, count } = grid(6, 4, 5);
    expect(countOverlaps({ x, y, radii, count, padding: 0 })).toBeGreaterThan(
      0,
    );

    // Asymptotic convergence: a padding-0 check passes only once separation
    // exceeds r_i + r_j by a margin, since relaxation approaches the padded
    // target from below.
    relaxOverlaps(x, y, radii, count, {
      padding: 2,
      strength: 0.8,
      maxPasses: 200,
      minMove: 1e-3,
    });

    expect(countOverlaps({ x, y, radii, count, padding: 0 })).toBe(0);
  });

  it("leaves well-separated nodes untouched (returns zero move)", () => {
    const { x, y, radii, count } = grid(5, 100, 5);
    const beforeX = Float32Array.from(x);
    const beforeY = Float32Array.from(y);

    const { maxMove, overlapsFound } = overlapRelaxPass({
      x,
      y,
      radii,
      count,
      padding: 0,
      strength: 0.5,
    });

    expect(maxMove).toBe(0);
    expect(overlapsFound).toBe(0);
    expect([...x]).toEqual([...beforeX]);
    expect([...y]).toEqual([...beforeY]);
  });

  it("produces bitwise-identical results when run in budget slices", () => {
    const oneShot = grid(8, 4, 5);
    const sliced = grid(8, 4, 5);

    const oneShotResult = overlapRelaxPass({
      ...oneShot,
      padding: 2,
      strength: 0.7,
    });

    const sweep = new OverlapSweep();
    sweep.reset({ ...sliced, padding: 2, strength: 0.7 });
    sweep.buildGrid();
    let steps = 0;
    while (!sweep.run(7)) {
      steps += 1;
    }

    expect(steps).toBeGreaterThan(2);
    expect(sweep.result).toEqual(oneShotResult);
    expect([...sliced.x]).toEqual([...oneShot.x]);
    expect([...sliced.y]).toEqual([...oneShot.y]);
  });

  it("reports the pass's overlap count (counting pass at strength 0)", () => {
    const { x, y, radii, count } = grid(4, 4, 5);
    const strict = countOverlaps({ x, y, radii, count, padding: 0 });
    const viaPass = overlapRelaxPass({
      x,
      y,
      radii,
      count,
      padding: 0,
      strength: 0,
    });
    expect(viaPass.overlapsFound).toBe(strict);
    expect(viaPass.maxMove).toBe(0);
  });

  it("separates exactly-coincident nodes deterministically", () => {
    const x = new Float32Array([0, 0, 0]);
    const y = new Float32Array([0, 0, 0]);
    const radii = new Float32Array([5, 5, 5]);

    relaxOverlaps(x, y, radii, 3, {
      padding: 2,
      strength: 0.8,
      maxPasses: 200,
      minMove: 1e-3,
    });

    expect(countOverlaps({ x, y, radii, count: 3, padding: 0 })).toBe(0);
    for (let index = 0; index < 3; index++) {
      expect(Number.isFinite(x[index]!)).toBe(true);
      expect(Number.isFinite(y[index]!)).toBe(true);
    }
  });

  it("is deterministic for identical inputs", () => {
    const first = grid(6, 4, 5);
    const second = grid(6, 4, 5);
    relaxOverlaps(first.x, first.y, first.radii, first.count, {
      strength: 0.7,
    });
    relaxOverlaps(second.x, second.y, second.radii, second.count, {
      strength: 0.7,
    });
    expect([...first.x]).toEqual([...second.x]);
    expect([...first.y]).toEqual([...second.y]);
  });

  it("honours padding (enforces a gap beyond the radii)", () => {
    const x = new Float32Array([0, 6]);
    const y = new Float32Array([0, 0]);
    const radii = new Float32Array([2, 2]);
    // radii sum 4, but padding 6 ⇒ required centre distance 10.
    relaxOverlaps(x, y, radii, 2, {
      padding: 6,
      strength: 0.8,
      maxPasses: 200,
      minMove: 1e-4,
    });
    const distance = Math.hypot(x[1]! - x[0]!, y[1]! - y[0]!);
    expect(distance).toBeGreaterThan(10 - 0.1);
  });
});
