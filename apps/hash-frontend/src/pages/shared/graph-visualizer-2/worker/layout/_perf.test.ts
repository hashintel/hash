// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";
import { Rectangle, removeOverlaps as colaRemoveOverlaps } from "webcola";

import { mulberry32 } from "../../math/random";
import { VpscOverlapRemover } from "./overlap-removal";

interface RectSet {
  x: Float32Array;
  y: Float32Array;
  halfW: Float32Array;
  halfH: Float32Array;
  count: number;
}

function coincident(count: number, jitter: number): RectSet {
  const rng = mulberry32(7);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const halfW = new Float32Array(count).fill(6);
  const halfH = new Float32Array(count).fill(6);
  for (let i = 0; i < count; i++) {
    x[i] = (rng() - 0.5) * jitter;
    y[i] = (rng() - 0.5) * jitter;
  }
  return { x, y, halfW, halfH, count };
}

function ring(count: number, radius: number, half: number): RectSet {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const halfW = new Float32Array(count).fill(half);
  const halfH = new Float32Array(count).fill(half);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    x[i] = Math.cos(angle) * radius;
    y[i] = Math.sin(angle) * radius;
  }
  return { x, y, halfW, halfH, count };
}

function hubRing(count: number, radius: number): RectSet {
  const set = ring(count - 1, radius, 5);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const halfW = new Float32Array(count);
  const halfH = new Float32Array(count);
  x[0] = 0;
  y[0] = 0;
  halfW[0] = 10;
  halfH[0] = 10;
  for (let i = 1; i < count; i++) {
    x[i] = set.x[i - 1]!;
    y[i] = set.y[i - 1]!;
    halfW[i] = 5;
    halfH[i] = 5;
  }
  return { x, y, halfW, halfH, count };
}

function clustered(count: number): RectSet {
  const rng = mulberry32(11);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const halfW = new Float32Array(count).fill(6);
  const halfH = new Float32Array(count).fill(6);
  const clusterCount = Math.max(1, Math.round(count / 150));
  for (let i = 0; i < count; i++) {
    const cluster = i % clusterCount;
    const cx = (cluster % 40) * 400;
    const cy = Math.floor(cluster / 40) * 400;
    x[i] = cx + (rng() - 0.5) * 20;
    y[i] = cy + (rng() - 0.5) * 20;
  }
  return { x, y, halfW, halfH, count };
}

function overlappingPairs(set: RectSet, eps = 1e-2): number {
  const { x, y, halfW, halfH, count } = set;
  let pairs = 0;
  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) {
      const penX = halfW[a]! + halfW[b]! - Math.abs(x[a]! - x[b]!);
      const penY = halfH[a]! + halfH[b]! - Math.abs(y[a]! - y[b]!);
      if (penX > eps && penY > eps) {
        pairs += 1;
      }
    }
  }
  return pairs;
}

function timeMine(set: RectSet): string {
  const remover = new VpscOverlapRemover(set.count);
  const start = performance.now();
  remover.removeOverlaps(set.x, set.y, set.halfW, set.halfH, set.count);
  const ms = performance.now() - start;
  return `mine ms=${ms.toFixed(0)} overlaps=${overlappingPairs(set)} outer=${remover.statOuter} inner=${remover.statSatisfyInner} numCon=${remover.statMaxNumCon} cleanup=${remover.statCleanupRounds}`;
}

function timeCola(set: RectSet): string {
  const rects = new Array<Rectangle>(set.count);
  for (let i = 0; i < set.count; i++) {
    rects[i] = new Rectangle(
      set.x[i]! - set.halfW[i]!,
      set.x[i]! + set.halfW[i]!,
      set.y[i]! - set.halfH[i]!,
      set.y[i]! + set.halfH[i]!,
    );
  }
  const start = performance.now();
  colaRemoveOverlaps(rects);
  const ms = performance.now() - start;
  return `cola ms=${ms.toFixed(0)}`;
}

describe("perf probe", () => {
  it("adversarial", () => {
    const lines: string[] = [];
    const cases: [string, RectSet][] = [
      ["150-exact", coincident(150, 0)],
      ["1000-exact", coincident(1000, 0)],
      ["1000-jit1", coincident(1000, 1)],
      ["2000-exact", coincident(2000, 0)],
      ["5000-exact", coincident(5000, 0)],
      ["5000-clustered", clustered(5000)],
      ["150-hubRing40", hubRing(150, 40)],
    ];
    for (const [name, set] of cases) {
      const before = overlappingPairs(set);
      if (name.endsWith("cola")) {
        lines.push(`${name}: ${timeCola(set)}`);
      } else {
        lines.push(`${name}(pre=${before}): ${timeMine(set)}`);
      }
    }
    expect(lines.join("\n")).toBe("");
  }, 60000);
});
