/**
 * Node-size overlap resolution for the stress-based layout.
 *
 * Stress / MDS layouts place nodes to match graph-theoretic distances and carry no
 * notion of a node's drawn radius, so dots can overlap. This is the separable
 * equivalent of ForceAtlas2's `adjustSizes` anti-overlap: a uniform-grid relaxation
 * that pushes overlapping pairs apart, run as its own pass between solver ticks so
 * the stress engine ({@link "./sparse-stress-seed"}) stays untouched.
 *
 * Deterministic: nodes are visited in index order, each unordered pair is resolved
 * once, and coincident nodes separate along a hash-derived direction, so a seeded
 * layout stays reproducible.
 */

const EPS = 1e-6;

/**
 * Uniform-grid cell key. A string key is used deliberately: cell coordinates are
 * unbounded and can be negative, so a packed numeric key risks collisions between
 * distinct cells (which would fabricate neighbours and break determinism).
 */
function cellKey(cellX: number, cellY: number): string {
  return `${cellX},${cellY}`;
}

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

/** A grid snapshot: each node's cell, built once per pass so mid-pass moves stay consistent. */
interface Grid {
  readonly cellSize: number;
  readonly cellX: Int32Array;
  readonly cellY: Int32Array;
  readonly buckets: ReadonlyMap<string, number[]>;
}

/**
 * Build a uniform grid whose cell size guarantees any overlapping pair
 * (centres closer than `2·maxRadius + padding`) lands in the same or an adjacent
 * cell, so a 3×3 neighbourhood scan finds every overlap.
 */
function buildGrid({ x, y, radii, count, padding }: OverlapGridInput): Grid {
  let maxRadius = 0;
  for (let index = 0; index < count; index++) {
    const radius = radii[index]!;
    if (radius > maxRadius) {
      maxRadius = radius;
    }
  }

  const cellSize = Math.max(EPS, 2 * maxRadius + Math.max(0, padding));
  const cellX = new Int32Array(count);
  const cellY = new Int32Array(count);
  const buckets = new Map<string, number[]>();

  for (let index = 0; index < count; index++) {
    const gridX = Math.floor(x[index]! / cellSize);
    const gridY = Math.floor(y[index]! / cellSize);
    cellX[index] = gridX;
    cellY[index] = gridY;

    const key = cellKey(gridX, gridY);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(index);
    } else {
      buckets.set(key, [index]);
    }
  }

  return { cellSize, cellX, cellY, buckets };
}

export interface OverlapPassInput extends OverlapGridInput {
  /** Fraction of each overlap corrected per pass, in (0, 1]. Lower = gentler. */
  readonly strength: number;
}

/**
 * One overlap-relaxation pass. Every overlapping pair is pushed apart symmetrically
 * by `strength · overlap / 2`. Mutates `x`/`y` in place and returns the largest
 * single-node displacement, so a caller can stop once a pass barely moves anything
 * (no overlaps left ⇒ returns 0).
 */
export function overlapRelaxPass(input: OverlapPassInput): number {
  const { x, y, radii, count, padding, strength } = input;
  if (count < 2) {
    return 0;
  }

  const grid = buildGrid(input);
  let maxMove = 0;

  for (let nodeA = 0; nodeA < count; nodeA++) {
    const radiusA = radii[nodeA]!;
    const baseCellX = grid.cellX[nodeA]!;
    const baseCellY = grid.cellY[nodeA]!;

    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        const bucket = grid.buckets.get(
          cellKey(baseCellX + offsetX, baseCellY + offsetY),
        );
        if (!bucket) {
          continue;
        }

        for (const nodeB of bucket) {
          // Resolve each unordered pair exactly once (also skips self).
          if (nodeB <= nodeA) {
            continue;
          }

          const minDist = radiusA + radii[nodeB]! + padding;
          let deltaX = x[nodeB]! - x[nodeA]!;
          let deltaY = y[nodeB]! - y[nodeA]!;
          const distSq = deltaX * deltaX + deltaY * deltaY;
          if (distSq >= minDist * minDist) {
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

          const shift = (minDist - dist) * 0.5 * strength;
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

  return maxMove;
}

/** Number of overlapping pairs (centres closer than `radius_i + radius_j + padding`). */
export function countOverlaps(input: OverlapGridInput): number {
  const { x, y, radii, count, padding } = input;
  if (count < 2) {
    return 0;
  }

  const grid = buildGrid(input);
  let overlaps = 0;

  for (let nodeA = 0; nodeA < count; nodeA++) {
    const radiusA = radii[nodeA]!;
    const baseCellX = grid.cellX[nodeA]!;
    const baseCellY = grid.cellY[nodeA]!;

    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        const bucket = grid.buckets.get(
          cellKey(baseCellX + offsetX, baseCellY + offsetY),
        );
        if (!bucket) {
          continue;
        }

        for (const nodeB of bucket) {
          if (nodeB <= nodeA) {
            continue;
          }
          const minDist = radiusA + radii[nodeB]! + padding;
          const deltaX = x[nodeB]! - x[nodeA]!;
          const deltaY = y[nodeB]! - y[nodeA]!;
          if (deltaX * deltaX + deltaY * deltaY < minDist * minDist) {
            overlaps += 1;
          }
        }
      }
    }
  }

  return overlaps;
}

export interface RelaxOverlapsOptions {
  readonly padding?: number;
  readonly strength?: number;
  readonly maxPasses?: number;
  /** Stop once a pass's largest displacement drops below this (world units). */
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
 * batch use); the streaming layout calls {@link overlapRelaxPass} once per tick
 * so the separation animates.
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
    });
    passes += 1;
    if (lastMaxMove < minMove) {
      break;
    }
  }

  return { passes, lastMaxMove };
}
