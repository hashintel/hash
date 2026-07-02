/**
 * Corridor planning for the community BubbleSets: guarantees each rendered
 * community's metaball field is connected.
 *
 * The metaball kernel has finite support (`fieldRadius`), so a community whose
 * members sit in spatial clumps farther apart than the kernel reach renders as
 * disconnected bubble islands. The canonical fix is BubbleSets' (Collins et
 * al., 2009) virtual edges: add field energy along a spanning structure over
 * the member positions so the iso-contour connects. Adapted to this renderer,
 * each virtual edge is a capsule (segment) kernel summed by the fragment
 * shader alongside the point kernels; along the segment spine the kernel is 1,
 * which is above any sane iso-threshold, so the corridor is above-threshold
 * end to end and the union {member blobs} ∪ {MST corridors} is connected.
 *
 * Construction, per rendered community (all deterministic):
 * 1. Euclidean MST over the community's sampled member positions
 *    (Prim from slot 0; strict `<` keeps the lowest candidate slot on ties).
 * 2. Obstacle pass: an MST edge whose corridor passes within clearance of a
 *    foreign node (any node not in this community, measured against the
 *    node's actual dot radius via a uniform grid) is rerouted through the
 *    best intermediate member (min detour ≤ {@link CORRIDOR_DETOUR_CAP} ×
 *    direct, both halves clear, tie-break lowest slot). If no clear reroute
 *    exists the direct segment is kept but narrowed
 *    (× {@link CORRIDOR_NARROW_FACTOR}) so it reads as a thin thread rather
 *    than swallowing what it crosses.
 *
 * Corridors are deliberately thin ribbons ({@link CORRIDOR_FIELD_RADIUS} ≪ bubble `fieldRadius`):
 * connecting a spread community must not visually annex the space between its clumps;
 * that would undo the community-region separation the layout engines enforce.
 *
 * Topology (which slots each segment joins, each segment's radius) is planned
 * here on the CPU, once when a grouping is built, then only when members
 * drift (movement-gated by the caller). Segment endpoint positions are
 * refreshed from the already-gathered point texels every frame by
 * `render/community.ts`, so corridors track the animation between replans at
 * zero planning cost.
 */

import { BitSet } from "../worker/collections/bitset";

/** Capsule kernel radius (world units) for full-width corridors. Visual ribbon
 * half-width at the default iso-threshold ≈ 0.49 × this. */
export const CORRIDOR_FIELD_RADIUS = 22;
/** Radius multiplier for corridors that could not clear foreign nodes. */
export const CORRIDOR_NARROW_FACTOR = 0.45;
/** Extra clearance (world units) beyond corridor radius + foreign dot radius. */
const CORRIDOR_CLEARANCE_PAD = 4;
/** A reroute may lengthen a corridor by at most this factor of the direct edge. */
export const CORRIDOR_DETOUR_CAP = 2;
/** Uniform-grid cell size (world units) for the foreign-node obstacle index. */
const OBSTACLE_GRID_CELL = 64;
/** Numeric grid-key packing (2^25 / 2^26; matches the worker grid-key convention). */
const CELL_OFFSET = 33554432;
const CELL_STRIDE = 67108864;

/** Per-node record layout inside the flat SAB (float indices within a record). */
const RECORD_X = 0;
const RECORD_Y = 1;
const RECORD_RADIUS = 2;

/** Prim scratch, sized to the shader's per-community node cap (256). */
const PRIM_CAP = 256;
const primDist = new Float64Array(PRIM_CAP);
const primParent = new Int32Array(PRIM_CAP);
const primInTree = BitSet.empty<number>(PRIM_CAP);

export interface CorridorPlan {
  /** Number of rendered (kept) communities. */
  readonly keptCount: number;
  /** Per kept community `[pointTexelOffset, memberCount]` (gather order). */
  readonly ranges: Float32Array;
  /** Per kept community: its Louvain community id (for the foreign test). */
  readonly communityIds: Int32Array;
  /** Gathered member positions, texel stride 4 (`[x, y, _, _]` per texel). */
  readonly pointTexels: Float32Array;
  /** Which kept communities to (re)plan; `null` plans all of them. */
  readonly replan: BitSet<number> | null;

  /** Flat SAB float view + record layout, for foreign node positions/radii. */
  readonly floats: Float32Array;
  readonly headerFloats: number;
  readonly recordFloats: number;
  /** Louvain membership per SAB node index (-1 / missing = no community). */
  readonly membership: Int32Array;
  /** Live SAB node count (obstacle candidates are `0..nodeCount-1`). */
  readonly nodeCount: number;

  /** Outputs, pre-allocated by the caller (capacities fixed per grouping): */
  /** Per segment `[slotA, slotB]`, absolute point-texel slots. */
  readonly segmentSlots: Int32Array;
  /** Per segment: capsule kernel radius (world units). */
  readonly segmentRadius: Float32Array;
  /** Per kept community: live segment count (≤ its capacity). */
  readonly segmentCounts: Int32Array;
  /** Per kept community: first segment-storage index (segment units, fixed). */
  readonly segmentStorageOffsets: Int32Array;
}

/** Point → segment distance. */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abX = bx - ax;
  const abY = by - ay;
  const lenSq = abX * abX + abY * abY;
  const raw = lenSq > 0 ? ((px - ax) * abX + (py - ay) * abY) / lenSq : 0;
  const along = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  const dx = px - (ax + abX * along);
  const dy = py - (ay + abY * along);
  return Math.hypot(dx, dy);
}

/**
 * Foreign-node obstacle index: uniform grid over all live SAB nodes. Built
 * once per plan call (plans are movement-gated, not per-frame, so the small
 * Map allocation here never rides the steady-state render loop).
 */
class ObstacleGrid {
  readonly #cells = new Map<number, number[]>();
  readonly #floats: Float32Array;
  readonly #headerFloats: number;
  readonly #recordFloats: number;
  readonly #membership: Int32Array;

  constructor(plan: CorridorPlan) {
    this.#floats = plan.floats;
    this.#headerFloats = plan.headerFloats;
    this.#recordFloats = plan.recordFloats;
    this.#membership = plan.membership;

    for (let idx = 0; idx < plan.nodeCount; idx++) {
      const base = plan.headerFloats + idx * plan.recordFloats;
      const cellX = Math.floor(
        (plan.floats[base + RECORD_X] ?? 0) / OBSTACLE_GRID_CELL,
      );

      const cellY = Math.floor(
        (plan.floats[base + RECORD_Y] ?? 0) / OBSTACLE_GRID_CELL,
      );

      const key = (cellX + CELL_OFFSET) * CELL_STRIDE + (cellY + CELL_OFFSET);
      const bucket = this.#cells.get(key);

      if (bucket) {
        bucket.push(idx);
      } else {
        this.#cells.set(key, [idx]);
      }
    }
  }

  /**
   * True when no node outside `communityId` sits within
   * `clearance + itsDotRadius` of segment (ax,ay)→(bx,by).
   */
  segmentClear(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    communityId: number,
    clearance: number,
  ): boolean {
    // Obstacle dot radii are small vs the grid cell; one cell of slack on the
    // inflated AABB covers radius + clearance overhang.
    const pad = clearance + OBSTACLE_GRID_CELL;
    const minCellX = Math.floor((Math.min(ax, bx) - pad) / OBSTACLE_GRID_CELL);
    const maxCellX = Math.floor((Math.max(ax, bx) + pad) / OBSTACLE_GRID_CELL);
    const minCellY = Math.floor((Math.min(ay, by) - pad) / OBSTACLE_GRID_CELL);
    const maxCellY = Math.floor((Math.max(ay, by) + pad) / OBSTACLE_GRID_CELL);
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const key = (cellX + CELL_OFFSET) * CELL_STRIDE + (cellY + CELL_OFFSET);
        const bucket = this.#cells.get(key);
        if (!bucket) {
          continue;
        }
        for (const idx of bucket) {
          if ((this.#membership[idx] ?? -1) === communityId) {
            continue;
          }
          const base = this.#headerFloats + idx * this.#recordFloats;
          const nodeX = this.#floats[base + RECORD_X] ?? 0;
          const nodeY = this.#floats[base + RECORD_Y] ?? 0;
          const nodeRadius = this.#floats[base + RECORD_RADIUS] ?? 0;
          if (
            distanceToSegment(nodeX, nodeY, ax, ay, bx, by) <
            clearance + nodeRadius
          ) {
            return false;
          }
        }
      }
    }
    return true;
  }
}

/**
 * (Re)plan corridor segments for the requested communities. Untouched
 * communities keep their previous plan (their storage regions are disjoint).
 */
export function planBubbleCorridors(plan: CorridorPlan): void {
  const {
    keptCount,
    ranges,
    pointTexels,
    replan,
    segmentSlots,
    segmentRadius,
    segmentCounts,
    segmentStorageOffsets,
    communityIds,
  } = plan;

  if (replan !== null && replan.cardinality === 0) {
    return;
  }

  const grid = new ObstacleGrid(plan);

  for (let ci = 0; ci < keptCount; ci++) {
    if (replan !== null && !replan.has(ci)) {
      continue;
    }
    const pointOffset = ranges[ci * 2]!;
    const memberCount = ranges[ci * 2 + 1]!;
    const communityId = communityIds[ci]!;
    const storageStart = segmentStorageOffsets[ci]!;
    let segmentCount = 0;

    if (memberCount >= 2 && memberCount <= PRIM_CAP) {
      // Euclidean MST (Prim, deterministic) over member texel coords.
      const coordAt = (member: number): readonly [number, number] => {
        const slot = (pointOffset + member) * 4;
        return [pointTexels[slot]!, pointTexels[slot + 1]!];
      };
      primInTree.clear();
      primDist.fill(Number.POSITIVE_INFINITY, 0, memberCount);
      primParent.fill(-1, 0, memberCount);
      primDist[0] = 0;
      for (let step = 0; step < memberCount; step++) {
        let next = -1;
        let nextDist = Number.POSITIVE_INFINITY;
        for (let member = 0; member < memberCount; member++) {
          if (!primInTree.has(member) && primDist[member]! < nextDist) {
            nextDist = primDist[member]!;
            next = member;
          }
        }
        if (next < 0) {
          break;
        }
        primInTree.add(next);
        const [nextX, nextY] = coordAt(next);
        for (let member = 0; member < memberCount; member++) {
          if (primInTree.has(member)) {
            continue;
          }
          const [memberX, memberY] = coordAt(member);
          const dx = memberX - nextX;
          const dy = memberY - nextY;
          const distSq = dx * dx + dy * dy;
          if (distSq < primDist[member]!) {
            primDist[member] = distSq;
            primParent[member] = next;
          }
        }
      }

      // Obstacle pass per MST edge: clear edges use full radius; reroutes use
      // two full segments; blocked edges narrow. Capacity is 2 · (memberCount - 1):
      // every edge emits at most two segments.
      const emit = (memberA: number, memberB: number, radius: number): void => {
        const storage = storageStart + segmentCount;
        segmentSlots[storage * 2] = pointOffset + memberA;
        segmentSlots[storage * 2 + 1] = pointOffset + memberB;
        segmentRadius[storage] = radius;
        segmentCount += 1;
      };
      const clearance = CORRIDOR_FIELD_RADIUS + CORRIDOR_CLEARANCE_PAD;

      for (let member = 1; member < memberCount; member++) {
        const parent = primParent[member]!;
        if (parent < 0) {
          continue; // Unreachable member (coincident degenerate); skip.
        }
        const [ax, ay] = coordAt(parent);
        const [bx, by] = coordAt(member);
        const directLen = Math.hypot(bx - ax, by - ay);
        if (
          directLen < 1e-3 ||
          grid.segmentClear(ax, ay, bx, by, communityId, clearance)
        ) {
          emit(parent, member, CORRIDOR_FIELD_RADIUS);
          continue;
        }
        // Blocked: cheapest clear one-hop detour via another member.
        let bestVia = -1;
        let bestDetour = Number.POSITIVE_INFINITY;
        for (let via = 0; via < memberCount; via++) {
          if (via === parent || via === member) {
            continue;
          }
          const [viaX, viaY] = coordAt(via);
          const detour =
            Math.hypot(viaX - ax, viaY - ay) + Math.hypot(bx - viaX, by - viaY);
          if (
            detour >= bestDetour ||
            detour > directLen * CORRIDOR_DETOUR_CAP
          ) {
            continue;
          }
          if (
            grid.segmentClear(ax, ay, viaX, viaY, communityId, clearance) &&
            grid.segmentClear(viaX, viaY, bx, by, communityId, clearance)
          ) {
            bestDetour = detour;
            bestVia = via;
          }
        }
        if (bestVia >= 0) {
          emit(parent, bestVia, CORRIDOR_FIELD_RADIUS);
          emit(bestVia, member, CORRIDOR_FIELD_RADIUS);
        } else {
          emit(parent, member, CORRIDOR_FIELD_RADIUS * CORRIDOR_NARROW_FACTOR);
        }
      }
    }

    segmentCounts[ci] = segmentCount;
  }
}

/**
 * CPU mirror of the shader's field function (point kernels + capsule
 * kernels, Wyvill falloff), for tests of the connectivity guarantee.
 */
export function evaluateBubbleField(
  px: number,
  py: number,
  points: ReadonlyArray<readonly [number, number]>,
  segments: ReadonlyArray<{
    readonly ax: number;
    readonly ay: number;
    readonly bx: number;
    readonly by: number;
    readonly radius: number;
  }>,
  fieldRadius: number,
): number {
  let field = 0;
  for (const [pointX, pointY] of points) {
    const norm = Math.hypot(px - pointX, py - pointY) / fieldRadius;
    if (norm < 1) {
      const falloff = 1 - norm * norm;
      field += falloff * falloff;
    }
  }
  for (const segment of segments) {
    if (segment.radius <= 0) {
      continue;
    }
    const norm =
      distanceToSegment(
        px,
        py,
        segment.ax,
        segment.ay,
        segment.bx,
        segment.by,
      ) / segment.radius;
    if (norm < 1) {
      const falloff = 1 - norm * norm;
      field += falloff * falloff;
    }
  }
  return field;
}
