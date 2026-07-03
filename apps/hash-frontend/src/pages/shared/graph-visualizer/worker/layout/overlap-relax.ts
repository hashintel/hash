/**
 * Node-size overlap resolution for the stress-based layout.
 *
 * Stress / MDS layouts place nodes to match graph-theoretic distances and carry no
 * notion of a node's drawn radius, so dots can overlap. This is a uniform-grid
 * relaxation that pushes overlapping pairs apart, run as its own pass between
 * solver iterations (the majorization engine's projection step) so the stress
 * solve itself stays untouched. `countOverlaps` is the zero-overlap oracle the
 * engine's settle verification and the test gates share.
 *
 * Deterministic: nodes are visited in index order, each unordered pair is resolved
 * once, and coincident nodes separate along a hash-derived direction, so a seeded
 * layout stays reproducible.
 *
 * Execution model: the heavy lifting lives in {@link OverlapSweep}, a
 * resumable single pass over a {@link UniformGrid} snapshot. The layout engine
 * drives it in bounded slices (`run(pairBudget)`) so one pass over 10⁵ nodes
 * never freezes a worker tick; slicing changes only when the sweep yields,
 * never the visit order, so sliced and one-shot runs produce bitwise-identical
 * positions. The one-shot helpers ({@link overlapRelaxPass},
 * {@link countOverlaps}, {@link relaxOverlaps}) wrap a module-level sweep for
 * callers without a budget (tests, batch use).
 */

import { UniformGrid } from "../collections/uniform-grid";

const EPS = 1e-6;

/* eslint-disable no-bitwise */
/** Deterministic angle in [0, 2π) used to separate exactly-coincident nodes. */
function coincidentAngle(nodeA: number, nodeB: number): number {
  let hash =
    (Math.imul(nodeA + 1, 2654435761) ^ Math.imul(nodeB + 1, 40503)) >>> 0;
  hash ^= hash >>> 15;
  return (hash / 0x1_0000_0000) * Math.PI * 2;
}
/* eslint-enable no-bitwise */

export interface OverlapGridInput {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radii: ArrayLike<number>;
  readonly count: number;
  /** Extra gap enforced beyond `radius_i + radius_j` (world units). */
  readonly padding: number;
}

export interface OverlapPassInput extends OverlapGridInput {
  /**
   * Fraction of each overlap corrected per pass, in [0, 1]. Lower = gentler;
   * 0 turns the sweep into a pure counting pass (nothing moves).
   */
  readonly strength: number;
  /**
   * Hysteresis: extra clearance (world units) inserted beyond
   * `r_i + r_j + padding` when a violated pair is corrected. The trigger
   * threshold stays at `padding`, so a pass over a jammed just-touching
   * packing only moves genuine violators, while corrected pairs land with
   * headroom that float noise and neighbour knock-on cannot immediately
   * re-trip (placing pairs exactly at the trigger distance makes the trigger
   * metastable: ε-below re-counts as violated forever). @defaultValue 0
   */
  readonly overshoot?: number;
}

export interface OverlapPassResult {
  /** Largest single-node displacement of the pass (0 ⇒ nothing moved). */
  readonly maxMove: number;
  /**
   * Pairs whose centres were closer than `r_i + r_j + padding` when the
   * sweep visited them (pre-correction), i.e. the pass's overlap count.
   */
  readonly overlapsFound: number;
}

/**
 * One resumable overlap pass: build a grid snapshot over the current
 * positions, then sweep nodes in index order pushing every overlapping pair
 * apart symmetrically by `strength · overlap / 2`.
 *
 * Lifecycle: `reset(input)` → `buildGrid()` (one bounded unit) → `run(budget)`
 * until it returns true → read {@link result}. Positions mutate in place
 * mid-pass; the grid snapshot is deliberately NOT re-binned (pass semantics:
 * every pair is adjudicated against the positions current when it is
 * visited, but membership comes from the pass's start-of-pass geometry).
 *
 * Instances retain their grid buffers across passes; the layout engine owns
 * long-lived instances, and the module-level one-shot helpers share one.
 */
export class OverlapSweep {
  readonly #grid = new UniformGrid();

  #x: Float32Array = new Float32Array(0);
  #y: Float32Array = new Float32Array(0);
  #radii: ArrayLike<number> = [];
  #count = 0;
  #padding = 0;
  #strength = 0;
  #overshoot = 0;

  #cursor = 0;
  #maxMove = 0;
  #overlapsFound = 0;

  /** Arm the sweep for a new pass over `input` (no work done yet). */
  reset(input: OverlapPassInput): void {
    this.#x = input.x;
    this.#y = input.y;
    this.#radii = input.radii;
    this.#count = input.count;
    this.#padding = input.padding;
    this.#strength = input.strength;
    this.#overshoot = input.overshoot ?? 0;
    this.#cursor = 0;
    this.#maxMove = 0;
    this.#overlapsFound = 0;
  }

  /**
   * Snapshot the grid over the current positions: one O(n) unit. Cell size is
   * `2·maxRadius + padding` so any overlapping pair lands within one cell of
   * each other and the 3×3 scan in {@link run} finds every overlap.
   */
  buildGrid(): void {
    let maxRadius = 0;
    for (let index = 0; index < this.#count; index++) {
      const radius = this.#radii[index]!;
      if (radius > maxRadius) {
        maxRadius = radius;
      }
    }
    const cellSize = Math.max(EPS, 2 * maxRadius + Math.max(0, this.#padding));
    this.#grid.build(this.#x, this.#y, this.#count, cellSize);
  }

  /**
   * Advance the sweep by roughly `pairBudget` candidate-pair visits (checked
   * at node granularity so the deterministic visit order is unaffected).
   * Returns true once the pass is complete.
   */
  run(pairBudget: number): boolean {
    const x = this.#x;
    const y = this.#y;
    const radii = this.#radii;
    const count = this.#count;
    const padding = this.#padding;
    const strength = this.#strength;
    const overshoot = this.#overshoot;
    const grid = this.#grid;
    const starts = grid.starts;
    const order = grid.order;

    let visits = 0;
    let maxMove = this.#maxMove;
    let found = this.#overlapsFound;

    let nodeA = this.#cursor;
    for (; nodeA < count && visits < pairBudget; nodeA++) {
      const radiusA = radii[nodeA]!;
      const baseCellX = grid.cellXOf(nodeA);
      const baseCellY = grid.cellYOf(nodeA);

      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          const bucket = grid.bucketAt(
            baseCellX + offsetX,
            baseCellY + offsetY,
          );
          if (bucket < 0) {
            continue;
          }

          const end = starts[bucket + 1]!;
          for (let member = starts[bucket]!; member < end; member++) {
            const nodeB = order[member]!;
            // nodeB <= nodeA skips self-pairs and double-counting across the
            // 3x3 bucket scan.
            if (nodeB <= nodeA) {
              continue;
            }
            visits += 1;

            const minDist = radiusA + radii[nodeB]! + padding;
            let deltaX = x[nodeB]! - x[nodeA]!;
            let deltaY = y[nodeB]! - y[nodeA]!;
            const distSq = deltaX * deltaX + deltaY * deltaY;
            if (distSq >= minDist * minDist) {
              continue;
            }
            found += 1;
            if (strength === 0) {
              continue;
            }

            let dist = Math.sqrt(distSq);
            if (dist < EPS) {
              const angle = coincidentAngle(nodeA, nodeB);
              deltaX = Math.cos(angle);
              deltaY = Math.sin(angle);
              dist = EPS;
            } else {
              deltaX /= dist;
              deltaY /= dist;
            }

            const shift = (minDist + overshoot - dist) * 0.5 * strength;
            x[nodeA]! -= deltaX * shift;
            y[nodeA]! -= deltaY * shift;
            x[nodeB]! += deltaX * shift;
            y[nodeB]! += deltaY * shift;
            if (shift > maxMove) {
              maxMove = shift;
            }
          }
        }
      }
    }

    this.#cursor = nodeA;
    this.#maxMove = maxMove;
    this.#overlapsFound = found;
    return nodeA >= count;
  }

  get result(): OverlapPassResult {
    return { maxMove: this.#maxMove, overlapsFound: this.#overlapsFound };
  }
}

/** Shared sweep behind the one-shot helpers (worker/test code is single-threaded). */
const oneShotSweep = new OverlapSweep();

/**
 * One complete overlap-relaxation pass (unbudgeted). Mutates `x`/`y` in place;
 * see {@link OverlapPassResult} for what comes back.
 */
export function overlapRelaxPass(input: OverlapPassInput): OverlapPassResult {
  if (input.count < 2) {
    return { maxMove: 0, overlapsFound: 0 };
  }
  oneShotSweep.reset(input);
  oneShotSweep.buildGrid();
  oneShotSweep.run(Number.POSITIVE_INFINITY);
  return oneShotSweep.result;
}

/** Number of overlapping pairs (centres closer than `radius_i + radius_j + padding`). */
export function countOverlaps(input: OverlapGridInput): number {
  if (input.count < 2) {
    return 0;
  }
  oneShotSweep.reset({ ...input, strength: 0 });
  oneShotSweep.buildGrid();
  oneShotSweep.run(Number.POSITIVE_INFINITY);
  return oneShotSweep.result.overlapsFound;
}

export interface RelaxOverlapsOptions {
  /** Extra gap enforced beyond `radius_i + radius_j`, in world units. @defaultValue 0 */
  readonly padding?: number;
  /**
   * Fraction of each overlap corrected per pass. Lower is gentler but
   * converges more slowly. @defaultValue 0.5
   */
  readonly strength?: number;
  /** Safety cap on relaxation passes. @defaultValue 40 */
  readonly maxPasses?: number;
  /**
   * Stop once a pass's largest displacement drops below this (world units).
   * @defaultValue 0.05
   */
  readonly minMove?: number;
}

export interface RelaxOverlapsResult {
  readonly passes: number;
  readonly lastMaxMove: number;
}

/**
 * Run overlap-relaxation passes until they converge (max displacement below
 * `minMove`) or `maxPasses` is reached. Convenience wrapper over
 * {@link overlapRelaxPass} for callers that resolve overlap in one shot (tests,
 * batch use); the streaming layout drives {@link OverlapSweep} in budget
 * slices instead so the separation animates.
 */
export function relaxOverlaps(
  x: Float32Array,
  y: Float32Array,
  radii: ArrayLike<number>,
  count: number,
  options: RelaxOverlapsOptions = {},
): RelaxOverlapsResult {
  const padding = options.padding ?? 0;
  const strength = options.strength ?? 0.5;
  const maxPasses = options.maxPasses ?? 40;
  const minMove = options.minMove ?? 0.05;

  let passes = 0;
  let lastMaxMove = 0;
  while (passes < maxPasses) {
    lastMaxMove = overlapRelaxPass({
      x,
      y,
      radii,
      count,
      padding,
      strength,
    }).maxMove;
    passes += 1;
    if (lastMaxMove < minMove) {
      break;
    }
  }

  return { passes, lastMaxMove };
}
