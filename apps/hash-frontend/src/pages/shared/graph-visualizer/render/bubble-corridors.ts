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
 * 1. Anchor selection: communities with more than {@link CORRIDOR_ANCHOR_CAP}
 *    sampled members are reduced to one anchor per merge-scale grid cell
 *    (cell edge = pairwise kernel-merge distance / √2, doubled until the
 *    anchor count fits the cap). Any two points in one cell are closer than
 *    the merge distance, so every non-anchor member's kernel provably fuses
 *    with its cell anchor's kernel above the iso threshold; connecting the
 *    anchors therefore connects every member. Communities at or under the
 *    cap use every member as an anchor (identical to the pre-anchor
 *    behaviour). The guarantee only softens on the (pathological) doubling
 *    path: points sharing a doubled cell may sit past the merge distance.
 * 2. Euclidean MST over the anchor positions
 *    (Prim from anchor 0; strict `<` keeps the lowest candidate slot on ties).
 * 3. Obstacle pass: an MST edge whose corridor passes within clearance of a
 *    foreign node (any node not in this community, measured against the
 *    node's actual dot radius via a uniform grid) is rerouted through the
 *    best intermediate anchor (min detour ≤ {@link CORRIDOR_DETOUR_CAP} ×
 *    direct, both halves clear, tie-break lowest slot).
 *
 * When every capped one-hop detour is blocked as well (foreign nodes wall off
 * the clumps), the direct segment is kept at × {@link CORRIDOR_NARROW_FACTOR}
 * width. The narrowed ribbon can still cross foreign nodes; that is an
 * accepted limit, for three reasons. Dropping the segment would split the
 * community into separate same-coloured hulls, which misreads as separate
 * communities (connectivity is this module's contract). Clipping at the
 * obstacle or routing multi-segment detours does not fit the data model:
 * segment endpoints are member point-texel slots (that is how corridors
 * track animation between replans), so a segment cannot end at an arbitrary
 * clip point, and more than two segments per MST edge would overflow the
 * capacity that both the segment storage and the shader's loop bound assume.
 * And the crossing stays legible: the hull is a low-alpha backdrop drawn
 * behind dots and edges, so a crossed foreign dot renders on top at full
 * strength over a ribbon about one dot diameter wide, and reads as a dot in
 * front of a thread rather than a dot annexed into the community, the same
 * way dots read over ordinary straight edges (which do no obstacle avoidance
 * at all).
 *
 * Corridors are deliberately thin ribbons ({@link CORRIDOR_FIELD_RADIUS} ≪ bubble `fieldRadius`):
 * connecting a spread community must not visually annex the space between its clumps;
 * that would undo the community-region separation the layout engines enforce.
 *
 * Topology (which slots each segment joins, each segment's radius) is planned
 * here on the CPU, once when a grouping is built, then only when members
 * drift (movement-gated by the caller). Endpoint positions are refreshed
 * from the gathered point texels on every pack frame, so corridors track
 * animation between replans without re-running the planner.
 */

import { BitSet } from "../worker/collections/bitset";

/**
 * Iso threshold of the bubble field (shared by the SDF layer, the corridor
 * merge-distance math, and the tests). Field values above this render inside
 * the hull.
 */
export const BUBBLE_ISO_THRESHOLD = 0.58;

/** Capsule kernel radius (world units) for full-width corridors. Visual ribbon
 * half-width at the default iso-threshold ≈ 0.49 × this. */
export const CORRIDOR_FIELD_RADIUS = 22;
/** Kernel-radius multiplier for corridors kept direct because no reroute
 * cleared the obstacles. Sized so the narrowed ribbon is about one dot
 * diameter wide at the default iso threshold: a crossed foreign dot reads as
 * a dot in front of a thread, not a dot inside the community. Raising this
 * toward 1 recreates that annexation misread; lowering it thins blocked
 * corridors toward invisibility when zoomed out. */
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

/**
 * Upper bound on corridor MST nodes per community. Prim is O(anchors²), so
 * this caps planning cost regardless of how many members the hull samples
 * (up to `MAX_NODES_PER_COMMUNITY`, 1024). It also keeps the worst-case
 * segment count (2 · (anchors − 1) with reroute splits) inside the shader's
 * `MAX_SEGMENTS_PER_COMMUNITY` loop bound of 512.
 */
export const CORRIDOR_ANCHOR_CAP = 256;

/** Prim scratch, sized to {@link CORRIDOR_ANCHOR_CAP}. */
const primDist = new Float64Array(CORRIDOR_ANCHOR_CAP);
const primParent = new Int32Array(CORRIDOR_ANCHOR_CAP);
const primInTree = BitSet.empty<number>(CORRIDOR_ANCHOR_CAP);
/** Anchor member indices for the community currently being planned. */
const anchorMembers = new Int32Array(CORRIDOR_ANCHOR_CAP);

/**
 * Centre-to-centre distance below which two point kernels of radius
 * `fieldRadius` merge into one above-threshold region: the field at their
 * midpoint, `2 · (1 − (d / 2r)²)²`, meets {@link BUBBLE_ISO_THRESHOLD}.
 * ≈ 1.36 × the radius at the default threshold.
 */
export function pairMergeDistance(fieldRadius: number): number {
  return 2 * fieldRadius * Math.sqrt(1 - Math.sqrt(BUBBLE_ISO_THRESHOLD / 2));
}

/**
 * Fills {@link anchorMembers} with ≤ {@link CORRIDOR_ANCHOR_CAP} member
 * indices for one community and returns the count. At or under the cap every
 * member is an anchor; above it, members are binned into merge-scale grid
 * cells (edge = merge distance / √2 so same-cell points always fuse) and the
 * first member of each occupied cell (member order — deterministic) is kept,
 * doubling the cell edge until the anchors fit the cap.
 */
function selectAnchors(
  pointTexels: Float32Array,
  pointOffset: number,
  memberCount: number,
  fieldRadius: number,
): number {
  if (memberCount <= CORRIDOR_ANCHOR_CAP) {
    for (let member = 0; member < memberCount; member++) {
      anchorMembers[member] = member;
    }
    return memberCount;
  }

  // Plans are movement-gated, not per-frame; a transient Map per attempt is
  // fine here (same policy as ObstacleGrid).
  let cellEdge = pairMergeDistance(fieldRadius) / Math.SQRT2;
  for (;;) {
    const firstMemberOfCell = new Map<number, number>();
    for (let member = 0; member < memberCount; member++) {
      const slot = (pointOffset + member) * 4;
      const cellX = Math.floor(pointTexels[slot]! / cellEdge);
      const cellY = Math.floor(pointTexels[slot + 1]! / cellEdge);
      const key = (cellX + CELL_OFFSET) * CELL_STRIDE + (cellY + CELL_OFFSET);
      if (!firstMemberOfCell.has(key)) {
        firstMemberOfCell.set(key, member);
      }
    }
    if (firstMemberOfCell.size <= CORRIDOR_ANCHOR_CAP) {
      let anchorCount = 0;
      // Map iteration follows insertion order == member order: deterministic.
      for (const member of firstMemberOfCell.values()) {
        anchorMembers[anchorCount] = member;
        anchorCount += 1;
      }
      return anchorCount;
    }
    cellEdge *= 2;
  }
}

export interface CorridorPlan {
  /** Number of rendered (kept) communities. */
  readonly keptCount: number;
  /** Per kept community `[pointTexelOffset, memberCount]` (gather order). */
  readonly ranges: Float32Array;
  /** Per kept community: its Louvain community id (for the foreign test). */
  readonly communityIds: Int32Array;
  /** Gathered member positions, texel stride 4 (`[x, y, _, _]` per texel). */
  readonly pointTexels: Float32Array;
  /** Per kept community: point-kernel field radius (world units); sets the
   * anchor merge scale for oversampled communities. */
  readonly fieldRadii: Float32Array;
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

/**
 * Returns the shortest distance from `(px, py)` to the closed segment
 * `(ax, ay)`-`(bx, by)`, clamping the projection to the segment ends.
 */
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

    if (memberCount >= 2) {
      const anchorCount = selectAnchors(
        pointTexels,
        pointOffset,
        memberCount,
        plan.fieldRadii[ci]!,
      );

      const coordAt = (anchor: number): readonly [number, number] => {
        const slot = (pointOffset + anchorMembers[anchor]!) * 4;
        return [pointTexels[slot]!, pointTexels[slot + 1]!];
      };

      primInTree.clear();
      primDist.fill(Number.POSITIVE_INFINITY, 0, anchorCount);
      primParent.fill(-1, 0, anchorCount);
      primDist[0] = 0;

      for (let step = 0; step < anchorCount; step++) {
        let next = -1;
        let nextDist = Number.POSITIVE_INFINITY;

        for (let anchor = 0; anchor < anchorCount; anchor++) {
          if (!primInTree.has(anchor) && primDist[anchor]! < nextDist) {
            nextDist = primDist[anchor]!;
            next = anchor;
          }
        }

        if (next < 0) {
          break;
        }

        primInTree.add(next);

        const [nextX, nextY] = coordAt(next);
        for (let anchor = 0; anchor < anchorCount; anchor++) {
          if (primInTree.has(anchor)) {
            continue;
          }

          const [anchorX, anchorY] = coordAt(anchor);
          const dx = anchorX - nextX;
          const dy = anchorY - nextY;
          const distSq = dx * dx + dy * dy;

          if (distSq < primDist[anchor]!) {
            primDist[anchor] = distSq;
            primParent[anchor] = next;
          }
        }
      }

      // Obstacle pass per MST edge: clear edges use full radius; reroutes use
      // two full segments; blocked edges narrow. Capacity is 2 · (anchorCount - 1):
      // every edge emits at most two segments.
      const emit = (anchorA: number, anchorB: number, radius: number): void => {
        const storage = storageStart + segmentCount;
        segmentSlots[storage * 2] = pointOffset + anchorMembers[anchorA]!;
        segmentSlots[storage * 2 + 1] = pointOffset + anchorMembers[anchorB]!;
        segmentRadius[storage] = radius;
        segmentCount += 1;
      };
      const clearance = CORRIDOR_FIELD_RADIUS + CORRIDOR_CLEARANCE_PAD;

      for (let anchor = 1; anchor < anchorCount; anchor++) {
        const parent = primParent[anchor]!;
        if (parent < 0) {
          continue; // Unreachable anchor (coincident degenerate); skip.
        }

        const [ax, ay] = coordAt(parent);
        const [bx, by] = coordAt(anchor);

        const directLen = Math.hypot(bx - ax, by - ay);
        if (
          directLen < 1e-3 ||
          grid.segmentClear(ax, ay, bx, by, communityId, clearance)
        ) {
          emit(parent, anchor, CORRIDOR_FIELD_RADIUS);
          continue;
        }

        // Blocked: cheapest clear one-hop detour via another anchor.
        let bestVia = -1;
        let bestDetour = Number.POSITIVE_INFINITY;
        for (let via = 0; via < anchorCount; via++) {
          if (via === parent || via === anchor) {
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
          emit(bestVia, anchor, CORRIDOR_FIELD_RADIUS);
        } else {
          // No clear detour: emit the direct segment narrowed. It can still
          // cross foreign nodes; the header explains why that beats
          // disconnecting the hull.
          emit(parent, anchor, CORRIDOR_FIELD_RADIUS * CORRIDOR_NARROW_FACTOR);
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
