/**
 * Density-adaptive crowd-node sizing for the network graph.
 *
 * The compact crowd point radius can be driven by how tightly packed the visible
 * nodes are rather than by zoom alone: sparse viewports get large, individually
 * legible dots; dense viewports get small dots so the overall shape and density
 * read. Two spacing measures are blended (see {@link DENSITY_AREAL_WEIGHT} and
 * {@link blendSpacing}), both needing only the positions in hand — no per-node or
 * global metadata:
 * - {@link medianNearestNeighbourWorld}: the tightest local packing.
 * - {@link arealSpacingWorld}: the macro spread of the visible nodes.
 *
 * The blended spacing is a world-space value; the caller multiplies by the live
 * world→pixel scale each frame so plain zooming stays smooth, and eases (see
 * {@link DENSITY_EASE_MS}) when the estimate steps. Because it is one scalar per
 * viewport, every node ends up the same radius.
 *
 * The tightest packing measure ({@link medianNearestNeighbourWorld}) also drives the
 * crowd opacity (see {@link maxDensityOpacity}): the denser the nodes pack on screen —
 * i.e. the higher the max local density — the more transparent the crowd, so heavy
 * crowding reads as shape rather than a solid mass.
 */

import type { NetworkGraphPoint } from "./network-graph-util";

/** Crowd-point radius as a fraction of the median inter-node spacing. */
export const DENSITY_SPACING_FRACTION = 0.35;
/** Smallest crowd-point radius (px): dense viewports floor here so dots stay visible. */
export const DENSITY_MIN_RADIUS_PX = 0.1;
/**
 * Largest crowd-point radius (px): sparse viewports cap here. Kept at or below
 * `POINT_MAX_RADIUS` so the compact layer's own pixel clamp never re-clips it.
 */
export const DENSITY_MAX_RADIUS_PX = 10;
/**
 * Ease time (ms) applied when the density estimate steps — e.g. when a new tile
 * depth swaps in a differently-sampled node set — so the size drifts rather than
 * pops. Pairs with the tiling fetch debounce.
 */
export const DENSITY_EASE_MS = 200;

/** Above this many nodes the estimate is taken over a strided sample, to bound cost. */
const NN_SAMPLE_CAP = 2_000;

/**
 * How much the areal measure contributes to the crowd radius, in `[0, 1]`, blended
 * against the nearest-neighbour measure (see {@link blendSpacing}): `0` is pure
 * nearest-neighbour, `1` is pure areal, `0.5` is an equal average. Tune to trade
 * off local-packing sensitivity (lower) against macro-shape legibility (higher).
 */
export const DENSITY_AREAL_WEIGHT = 0.05;

/** Crowd opacity at the sparse end — low max density (wide nearest-neighbour spacing). */
export const COMPACT_OPACITY_SPARSE = 0.25;
/** Crowd opacity at the dense end — high max density (tight nearest-neighbour spacing). */
export const COMPACT_OPACITY_DENSE = 0.6;
/**
 * On-screen nearest-neighbour spacing (px) at or above which the crowd is treated as
 * sparse and sits at {@link COMPACT_OPACITY_SPARSE}.
 */
export const DENSITY_SPARSE_SPACING_PX = 24;
/**
 * On-screen nearest-neighbour spacing (px) at or below which the crowd is treated as
 * fully dense and sits at {@link COMPACT_OPACITY_DENSE}.
 */
export const DENSITY_DENSE_SPACING_PX = 4;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

/**
 * The median distance from a node to its nearest neighbour, in world units, over
 * `points`. Uses a uniform spatial grid so it is ~O(n) for roughly even data;
 * queries a strided sample once there are more than {@link NN_SAMPLE_CAP} nodes.
 * Returns `null` when there is nothing to measure (fewer than two nodes, or all
 * nodes coincident).
 */
export const medianNearestNeighbourWorld = (
  points: readonly NetworkGraphPoint[],
): number | null => {
  const count = points.length;
  if (count < 2) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) {
      minX = point.x;
    }
    if (point.x > maxX) {
      maxX = point.x;
    }
    if (point.y < minY) {
      minY = point.y;
    }
    if (point.y > maxY) {
      maxY = point.y;
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (width === 0 && height === 0) {
    return null;
  }

  // Cell ≈ the expected spacing, so most cells hold ~1 node and the ring search
  // below settles in the first ring or two.
  const area =
    Math.max(width, Number.EPSILON) * Math.max(height, Number.EPSILON);
  const cell = Math.max(Math.sqrt(area / count), Number.MIN_VALUE);
  const cols = Math.ceil(width / cell) + 1;
  const rows = Math.ceil(height / cell) + 1;

  const columnOf = (x: number): number =>
    Math.min(cols - 1, Math.max(0, Math.floor((x - minX) / cell)));
  const rowOf = (y: number): number =>
    Math.min(rows - 1, Math.max(0, Math.floor((y - minY) / cell)));

  const grid = new Map<number, number[]>();
  for (let index = 0; index < count; index += 1) {
    const point = points[index];
    if (!point) {
      continue;
    }
    const key = rowOf(point.y) * cols + columnOf(point.x);
    const bucket = grid.get(key);
    if (bucket) {
      bucket.push(index);
    } else {
      grid.set(key, [index]);
    }
  }

  const stride = Math.max(1, Math.floor(count / NN_SAMPLE_CAP));
  const maxRing = Math.max(cols, rows);
  const distances: number[] = [];
  for (let index = 0; index < count; index += stride) {
    const point = points[index];
    if (!point) {
      continue;
    }
    const cx = columnOf(point.x);
    const cy = rowOf(point.y);
    let best = Infinity;
    for (let ring = 0; ring <= maxRing; ring += 1) {
      // The nearest possible neighbour in ring `ring` is at least `(ring - 1)·cell`
      // away, so once that exceeds the best found we can stop expanding.
      if ((ring - 1) * cell >= best) {
        break;
      }
      for (let dx = -ring; dx <= ring; dx += 1) {
        for (let dy = -ring; dy <= ring; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
            continue;
          }
          const gx = cx + dx;
          const gy = cy + dy;
          if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) {
            continue;
          }
          const bucket = grid.get(gy * cols + gx);
          if (!bucket) {
            continue;
          }
          for (const other of bucket) {
            if (other === index) {
              continue;
            }
            const neighbour = points[other];
            if (!neighbour) {
              continue;
            }
            const distance = Math.hypot(
              neighbour.x - point.x,
              neighbour.y - point.y,
            );
            if (distance < best) {
              best = distance;
            }
          }
        }
      }
    }
    if (Number.isFinite(best)) {
      distances.push(best);
    }
  }

  return distances.length > 0 ? median(distances) : null;
};

/** Counts the points whose `(x, y)` fall inside the given world rectangle. */
export const countPointsInRect = (
  points: readonly NetworkGraphPoint[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number => {
  let count = 0;
  for (const point of points) {
    if (
      point.x >= minX &&
      point.x <= maxX &&
      point.y >= minY &&
      point.y <= maxY
    ) {
      count += 1;
    }
  }
  return count;
};

/**
 * The mean inter-node spacing (world units) implied by spreading `count` nodes
 * evenly over a region of `worldArea` world units² — `√(worldArea / count)`.
 * Unlike {@link medianNearestNeighbourWorld} this ignores clumping, so it tracks
 * the macro spread of what's visible rather than the tightest local packing.
 * Returns `null` when there is nothing to measure (fewer than two nodes).
 */
export const arealSpacingWorld = (
  count: number,
  worldArea: number,
): number | null => (count < 2 ? null : Math.sqrt(worldArea / count));

/**
 * Blends the two spacing measures (world units) by `arealWeight` in `[0, 1]`: `0`
 * → pure `nearestNeighbour`, `1` → pure `areal`, `0.5` → an equal average. When
 * only one measure is available (the other is `null`) it is used as-is regardless
 * of the weight; when both are `null` the result is `null`.
 */
export const blendSpacing = (
  nearestNeighbour: number | null,
  areal: number | null,
  arealWeight: number,
): number | null => {
  if (nearestNeighbour === null) {
    return areal;
  }
  if (areal === null) {
    return nearestNeighbour;
  }
  const weight = clamp(arealWeight, 0, 1);
  return (1 - weight) * nearestNeighbour + weight * areal;
};

/**
 * The crowd-point radius (px) for a viewport whose median nearest-neighbour
 * distance is `medianSpacingWorld` world units, at world→pixel `scale`
 * (`2 ** absoluteZoom`). A fixed fraction of the on-screen spacing, clamped so
 * dense crowds bottom out at {@link DENSITY_MIN_RADIUS_PX} and sparse ones cap at
 * {@link DENSITY_MAX_RADIUS_PX}.
 */
export const densityPointRadiusPx = (
  medianSpacingWorld: number,
  scale: number,
): number =>
  clamp(
    DENSITY_SPACING_FRACTION * medianSpacingWorld * scale,
    DENSITY_MIN_RADIUS_PX,
    DENSITY_MAX_RADIUS_PX,
  );

/**
 * The compact crowd opacity for the current max local density — the tightest packing,
 * as the median nearest-neighbour distance ({@link medianNearestNeighbourWorld}).
 * Denser packing (smaller on-screen spacing) pulls the crowd toward
 * {@link COMPACT_OPACITY_DENSE}; sparser packing toward {@link COMPACT_OPACITY_SPARSE}.
 * `medianSpacingWorld` is world units, scaled to on-screen pixels by `scale`
 * (`2 ** absoluteZoom`) so the response is scale-invariant, then the fade runs linearly
 * between {@link DENSITY_DENSE_SPACING_PX} and {@link DENSITY_SPARSE_SPACING_PX}. Falls
 * back to {@link COMPACT_OPACITY_SPARSE} when the measure is unavailable.
 */
export const maxDensityOpacity = (
  medianSpacingWorld: number | null,
  scale: number,
): number => {
  if (medianSpacingWorld === null) {
    return COMPACT_OPACITY_SPARSE;
  }
  const spacingPx = medianSpacingWorld * scale;
  const amount = clamp(
    (spacingPx - DENSITY_DENSE_SPACING_PX) /
      (DENSITY_SPARSE_SPACING_PX - DENSITY_DENSE_SPACING_PX),
    0,
    1,
  );
  console.log(
    COMPACT_OPACITY_DENSE +
      (COMPACT_OPACITY_SPARSE - COMPACT_OPACITY_DENSE) * amount,
  );
  return (
    COMPACT_OPACITY_DENSE +
    (COMPACT_OPACITY_SPARSE - COMPACT_OPACITY_DENSE) * amount
  );
};
