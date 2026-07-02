/**
 * Community-region disjointness metrics for the layout engines' A/B benches and
 * gates.
 *
 * Zero disk overlaps does not imply visually separate community regions: a branch
 * of one community can fold deep into another community's fan without any pair of
 * disks intersecting (classic sparse-stress folding — unrelated cross-community
 * pairs carry no stress term, so nothing separates them). The bench's inter/intra
 * edge-length ratio cannot see this (it only measures edges, and the folded pairs
 * share none), which is exactly how region interpenetration shipped while every
 * edge metric looked fine. These metrics measure the regions themselves.
 *
 * Primary metric: `diskContainment` — the fraction of nodes lying strictly inside
 * a foreign community's disk, where community c's disk is centred on its member
 * centroid with the community's packing radius (the radius of the disk that holds
 * the members' drawn areas at the engines' shared utilisation). Chosen as primary
 * because it counts the user-visible artifact directly ("blue nodes deep inside
 * the green bubble's core"), it is engine-agnostic (positions + radii + a shared
 * partition; no per-engine anchor or force model), and it is robust to community
 * shape: a stringy community has a small packing disk, so brushing past its tail
 * does not count, only intruding into a region's mass does.
 *
 * Secondary (reported, not gated): convex-hull `foreignContainment` and worst
 * pairwise hull intersection-over-min-area. Hulls also see boundary
 * interpenetration between region perimeters, but they systematically overcount
 * for concave shapes — a crescent community's hull covers its bay, and everything
 * inside the bay counts as "contained" even when the drawn bubbles are disjoint —
 * so they complement the disk metric rather than replace it.
 */

/**
 * Communities below this member count cast no region (no visually meaningful
 * bubble). Shared by the metrics and the majorization engine's region floors so
 * the gate measures exactly what the engine enforces.
 */
export const REGION_MIN_COMMUNITY_SIZE = 8;

/**
 * Disk-packing utilisation for a community's region radius — the same fraction
 * the layout engines use for their scale-to-fit / hub packing sizing.
 */
export const REGION_PACKING_UTILISATION = 0.55;

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Andrew monotone-chain convex hull; returns CCW vertices (no repeated endpoint). */
export function convexHull(points: readonly Point[]): Point[] {
  if (points.length < 3) {
    return [...points];
  }
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (origin: Point, a: Point, b: Point): number =>
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

  const lower: Point[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Strict interior test against a CCW convex polygon (boundary counts as outside). */
export function pointInConvexHull(
  point: Point,
  hull: readonly Point[],
): boolean {
  if (hull.length < 3) {
    return false;
  }
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) <= 0) {
      return false;
    }
  }
  return true;
}

/** Shoelace area of a CCW polygon. */
export function polygonArea(polygon: readonly Point[]): number {
  let doubled = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    doubled += a.x * b.y - b.x * a.y;
  }
  return Math.abs(doubled) / 2;
}

/** Line-segment / infinite-clip-edge intersection (callers guarantee non-parallel crossing). */
function intersect(from: Point, to: Point, edgeA: Point, edgeB: Point): Point {
  const dcX = edgeA.x - edgeB.x;
  const dcY = edgeA.y - edgeB.y;
  const dpX = from.x - to.x;
  const dpY = from.y - to.y;
  const n1 = edgeA.x * edgeB.y - edgeA.y * edgeB.x;
  const n2 = from.x * to.y - from.y * to.x;
  const denom = dcX * dpY - dcY * dpX;
  return {
    x: (n1 * dpX - n2 * dcX) / denom,
    y: (n1 * dpY - n2 * dcY) / denom,
  };
}

/** Sutherland–Hodgman clip of a convex polygon by a convex CCW clip polygon. */
function clipConvex(
  subject: readonly Point[],
  clip: readonly Point[],
): Point[] {
  let output: Point[] = [...subject];
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const edgeA = clip[i]!;
    const edgeB = clip[(i + 1) % clip.length]!;
    const input = output;
    output = [];
    const inside = (point: Point): boolean =>
      (edgeB.x - edgeA.x) * (point.y - edgeA.y) -
        (edgeB.y - edgeA.y) * (point.x - edgeA.x) >=
      0;
    for (let vertex = 0; vertex < input.length; vertex++) {
      const current = input[vertex]!;
      const previous = input[(vertex + input.length - 1) % input.length]!;
      const currentInside = inside(current);
      const previousInside = inside(previous);
      if (currentInside) {
        if (!previousInside) {
          output.push(intersect(previous, current, edgeA, edgeB));
        }
        output.push(current);
      } else if (previousInside) {
        output.push(intersect(previous, current, edgeA, edgeB));
      }
    }
  }
  return output;
}

export interface RegionNode {
  readonly x: number;
  readonly y: number;
  /** Drawn disk radius (feeds the community packing radius). */
  readonly radius: number;
  /** Community label; nodes sharing a label form one region. Negative = unassigned. */
  readonly community: number;
}

export interface RegionOverlapStats {
  /**
   * Primary: fraction of all nodes lying strictly inside ≥ 1 foreign community's
   * packing disk (centroid-centred, packing radius).
   */
  readonly diskContainment: number;
  /** Count behind {@link diskContainment} (for logging). */
  readonly diskContainedNodes: number;
  /** Fraction of nodes strictly inside ≥ 1 foreign community's convex hull. */
  readonly hullContainment: number;
  /** Worst pairwise hull intersection ÷ min(hull areas) among region-casting communities. */
  readonly hullIntersectionOverMin: number;
  /** Communities large enough to cast a region. */
  readonly regionCount: number;
}

/**
 * Region-overlap statistics over a settled layout. Deterministic; O(regions ·
 * (n + hull²)) — bench/test-scale cost only.
 */
export function measureRegionOverlap(
  nodes: readonly RegionNode[],
  overlapPadding = 8,
): RegionOverlapStats {
  const membersByCommunity = new Map<number, RegionNode[]>();
  for (const node of nodes) {
    if (node.community < 0) {
      continue;
    }
    const members = membersByCommunity.get(node.community);
    if (members) {
      members.push(node);
    } else {
      membersByCommunity.set(node.community, [node]);
    }
  }

  interface Region {
    readonly community: number;
    readonly centroidX: number;
    readonly centroidY: number;
    readonly packingRadius: number;
    readonly hull: Point[];
    readonly area: number;
  }
  const regions: Region[] = [];
  for (const [community, members] of membersByCommunity) {
    if (members.length < REGION_MIN_COMMUNITY_SIZE) {
      continue;
    }
    let centroidX = 0;
    let centroidY = 0;
    let areaSq = 0;
    for (const member of members) {
      centroidX += member.x;
      centroidY += member.y;
      const half = member.radius + overlapPadding / 2;
      areaSq += half * half;
    }
    centroidX /= members.length;
    centroidY /= members.length;
    const hull = convexHull(members);
    regions.push({
      community,
      centroidX,
      centroidY,
      packingRadius: Math.sqrt(areaSq / REGION_PACKING_UTILISATION),
      hull,
      area: hull.length >= 3 ? polygonArea(hull) : 0,
    });
  }
  // Deterministic order regardless of Map insertion order.
  regions.sort((a, b) => a.community - b.community);

  let diskContainedNodes = 0;
  let hullContainedNodes = 0;
  for (const node of nodes) {
    let inForeignDisk = false;
    let inForeignHull = false;
    for (const region of regions) {
      if (region.community === node.community) {
        continue;
      }
      if (!inForeignDisk) {
        const dx = node.x - region.centroidX;
        const dy = node.y - region.centroidY;
        if (dx * dx + dy * dy < region.packingRadius * region.packingRadius) {
          inForeignDisk = true;
        }
      }
      if (!inForeignHull && pointInConvexHull(node, region.hull)) {
        inForeignHull = true;
      }
      if (inForeignDisk && inForeignHull) {
        break;
      }
    }
    if (inForeignDisk) {
      diskContainedNodes += 1;
    }
    if (inForeignHull) {
      hullContainedNodes += 1;
    }
  }

  let worstIoM = 0;
  for (let first = 0; first < regions.length; first++) {
    for (let second = first + 1; second < regions.length; second++) {
      const a = regions[first]!;
      const b = regions[second]!;
      const minArea = Math.min(a.area, b.area);
      if (minArea <= 0) {
        continue;
      }
      const intersection = polygonArea(clipConvex(a.hull, b.hull));
      const ioM = intersection / minArea;
      if (ioM > worstIoM) {
        worstIoM = ioM;
      }
    }
  }

  const total = nodes.length;
  return {
    diskContainment: total > 0 ? diskContainedNodes / total : 0,
    diskContainedNodes,
    hullContainment: total > 0 ? hullContainedNodes / total : 0,
    hullIntersectionOverMin: worstIoM,
    regionCount: regions.length,
  };
}
