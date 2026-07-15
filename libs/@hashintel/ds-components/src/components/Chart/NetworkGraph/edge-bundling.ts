import type { NetworkGraphPoint } from "./network-graph-util";

/** A polyline (list of `[x, y]` points) approximating one bundled edge. */
export type BundledPath = [number, number][];

/**
 * A 3-level containment hierarchy over the nodes used to route bundled edges:
 * root → colour (node type) → spatial sub-cluster → node. Only the centroids and
 * each node's sub-cluster are stored; the tree path between two nodes is derived
 * from their colour + sub-cluster at draw time (see {@link bundleEdgePath}).
 */
export interface BundleHierarchy {
  /** Centroid of all nodes — the waypoint every cross-type edge routes through. */
  rootCentroid: [number, number];
  /** Node id → its sub-cluster key (`"<colour>#<gx>,<gy>"`). */
  nodeToSub: Map<number, string>;
  /** Sub-cluster key → centroid of its nodes. */
  subCentroid: Map<string, [number, number]>;
  /** Colour (node type) → centroid of all nodes of that type. */
  colorCentroid: Map<string, [number, number]>;
}

/**
 * Grid resolution used to split each colour into spatial sub-clusters: an N×N
 * grid over the colour's bounding box. Higher = finer bundles (more, tighter
 * ropes); lower = coarser. This is the extra level that deepens the otherwise
 * flat colour hierarchy, so bundles form locally instead of every same-colour
 * edge routing through one per-colour centroid.
 */
const SUBGRID = 16;
/**
 * Bundling strength β (0..1): how strongly each edge is pulled onto its tree
 * path. 1 = hug the hierarchy tightly (max bundling); 0 = straight lines.
 */
const BETA = 0.95;
/**
 * Max turn (radians) of any rendered segment. The curve is flattened adaptively
 * until every segment bends less than this, so no facet/corner is visible at any
 * zoom. ~4° reads as smooth; lower is smoother but adds points.
 */
const FLATNESS_LIMIT_RAD = (4 * Math.PI) / 180;
/** Recursion cap for adaptive flattening — a safety net against pathological spans. */
const FLATTEN_MAX_DEPTH = 10;
/**
 * A waypoint whose turn exceeds this angle makes the edge double back on itself —
 * a hairpin that no curve smoothing can round (a ~180° reversal stays sharp). Such
 * waypoints are dropped before smoothing, routing the edge locally instead. Turns
 * below it bundle cleanly and are kept.
 */
const REVERSAL_TURN_LIMIT_DEGREES = 120;
const REVERSAL_TURN_LIMIT_COS = Math.cos(
  (REVERSAL_TURN_LIMIT_DEGREES * Math.PI) / 180,
);

/**
 * Build the {@link BundleHierarchy} from the full node set. O(n) over the nodes;
 * memoise on `points` since it is independent of the viewport.
 */
export const buildBundleHierarchy = (
  points: NetworkGraphPoint[],
): BundleHierarchy => {
  const pointsByColor = new Map<string, NetworkGraphPoint[]>();
  let rootSumX = 0;
  let rootSumY = 0;
  for (const point of points) {
    rootSumX += point.x;
    rootSumY += point.y;
    const group = pointsByColor.get(point.color);
    if (group) {
      group.push(point);
    } else {
      pointsByColor.set(point.color, [point]);
    }
  }
  const total = points.length || 1;
  const rootCentroid: [number, number] = [rootSumX / total, rootSumY / total];

  const nodeToSub = new Map<number, string>();
  const subCentroid = new Map<string, [number, number]>();
  const colorCentroid = new Map<string, [number, number]>();

  for (const [color, group] of pointsByColor) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let sumY = 0;
    for (const point of group) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      sumX += point.x;
      sumY += point.y;
    }
    colorCentroid.set(color, [sumX / group.length, sumY / group.length]);

    const width = maxX - minX || 1;
    const height = maxY - minY || 1;
    const accum = new Map<
      string,
      { sumX: number; sumY: number; count: number }
    >();
    for (const point of group) {
      const gx = Math.min(
        SUBGRID - 1,
        Math.floor(((point.x - minX) / width) * SUBGRID),
      );
      const gy = Math.min(
        SUBGRID - 1,
        Math.floor(((point.y - minY) / height) * SUBGRID),
      );
      const key = `${color}#${gx},${gy}`;
      nodeToSub.set(point.id, key);
      const entry = accum.get(key);
      if (entry) {
        entry.sumX += point.x;
        entry.sumY += point.y;
        entry.count += 1;
      } else {
        accum.set(key, { sumX: point.x, sumY: point.y, count: 1 });
      }
    }
    for (const [key, entry] of accum) {
      subCentroid.set(key, [
        entry.sumX / entry.count,
        entry.sumY / entry.count,
      ]);
    }
  }

  return { rootCentroid, nodeToSub, subCentroid, colorCentroid };
};

/**
 * The tree-path control points from `from` up to the lowest common ancestor and
 * back down to `to`: same sub-cluster → one waypoint; same colour → sub/colour/sub;
 * different colour → sub/colour/root/colour/sub.
 */
const controlPointsFor = (
  from: NetworkGraphPoint,
  to: NetworkGraphPoint,
  hierarchy: BundleHierarchy,
): BundledPath => {
  const { nodeToSub, subCentroid, colorCentroid, rootCentroid } = hierarchy;
  const start: [number, number] = [from.x, from.y];
  const end: [number, number] = [to.x, to.y];
  const subFrom = nodeToSub.get(from.id);
  const subTo = nodeToSub.get(to.id);
  const waypoints: [number, number][] = [];

  const subFromCentroid = subFrom ? subCentroid.get(subFrom) : undefined;
  const subToCentroid = subTo ? subCentroid.get(subTo) : undefined;

  if (subFrom !== undefined && subFrom === subTo) {
    // Same sub-cluster: bow gently through its centroid.
    if (subFromCentroid) {
      waypoints.push(subFromCentroid);
    }
  } else if (from.color === to.color) {
    // Same type, different sub-cluster: route sub → colour → sub.
    const colorMid = colorCentroid.get(from.color);
    if (subFromCentroid) {
      waypoints.push(subFromCentroid);
    }
    if (colorMid) {
      waypoints.push(colorMid);
    }
    if (subToCentroid) {
      waypoints.push(subToCentroid);
    }
  } else {
    // Different type: route sub → colour → root → colour → sub.
    const colorFrom = colorCentroid.get(from.color);
    const colorTo = colorCentroid.get(to.color);
    if (subFromCentroid) {
      waypoints.push(subFromCentroid);
    }
    if (colorFrom) {
      waypoints.push(colorFrom);
    }
    waypoints.push(rootCentroid);
    if (colorTo) {
      waypoints.push(colorTo);
    }
    if (subToCentroid) {
      waypoints.push(subToCentroid);
    }
  }

  return [start, ...waypoints, end];
};

const midpoint = (
  pointA: [number, number],
  pointB: [number, number],
): [number, number] => [
  (pointA[0] + pointB[0]) / 2,
  (pointA[1] + pointB[1]) / 2,
];

/** Turn angle (radians) at `mid` on the path `start → mid → end`; 0 when straight. */
const turnAngle = (
  start: [number, number],
  mid: [number, number],
  end: [number, number],
): number => {
  const inX = mid[0] - start[0];
  const inY = mid[1] - start[1];
  const outX = end[0] - mid[0];
  const outY = end[1] - mid[1];
  const inLen = Math.hypot(inX, inY);
  const outLen = Math.hypot(outX, outY);
  if (inLen < 1e-12 || outLen < 1e-12) {
    return 0;
  }
  const cos = (inX * outX + inY * outY) / (inLen * outLen);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
};

/** Convert one uniform cubic B-spline span (4 controls) to its Bézier controls. */
const spanToBezier = (
  pointA: [number, number],
  pointB: [number, number],
  pointC: [number, number],
  pointD: [number, number],
): [[number, number], [number, number], [number, number], [number, number]] => [
  [
    (pointA[0] + 4 * pointB[0] + pointC[0]) / 6,
    (pointA[1] + 4 * pointB[1] + pointC[1]) / 6,
  ],
  [(2 * pointB[0] + pointC[0]) / 3, (2 * pointB[1] + pointC[1]) / 3],
  [(pointB[0] + 2 * pointC[0]) / 3, (pointB[1] + 2 * pointC[1]) / 3],
  [
    (pointB[0] + 4 * pointC[0] + pointD[0]) / 6,
    (pointB[1] + 4 * pointC[1] + pointD[1]) / 6,
  ],
];

/**
 * Adaptively flatten a cubic Bézier into `out`, subdividing (de Casteljau at the
 * midpoint) until each emitted segment turns less than {@link FLATNESS_LIMIT_RAD}.
 * This bounds the visible corner angle everywhere — scale-independent — while
 * spending points only where the curve actually bends. Emits `b0` at each leaf;
 * the caller appends the final endpoint. Depth is capped as a safety net.
 */
const flattenBezier = (
  b0: [number, number],
  b1: [number, number],
  b2: [number, number],
  b3: [number, number],
  out: BundledPath,
  depth: number,
): void => {
  const controlTurn = turnAngle(b0, b1, b2) + turnAngle(b1, b2, b3);
  if (depth >= FLATTEN_MAX_DEPTH || controlTurn < FLATNESS_LIMIT_RAD) {
    out.push(b0);
    return;
  }
  const ab = midpoint(b0, b1);
  const bc = midpoint(b1, b2);
  const cd = midpoint(b2, b3);
  const abc = midpoint(ab, bc);
  const bcd = midpoint(bc, cd);
  const mid = midpoint(abc, bcd);
  flattenBezier(b0, ab, abc, mid, out, depth + 1);
  flattenBezier(mid, bcd, cd, b3, out, depth + 1);
};

/**
 * Smooth a control polyline into a uniform **cubic B-spline** — the construction
 * d3 uses for `curveBasis` (and therefore `curveBundle`). The curve is C²
 * continuous and stays clear of the interior control vertices, so routing turns
 * round off rather than leaving a visible corner. Each span is converted to a
 * Bézier and flattened adaptively (see {@link flattenBezier}) so no rendered
 * segment shows a facet, however sharp the turn. The endpoints are tripled so the
 * curve starts and ends exactly on the true edge endpoints.
 */
const basisSpline = (controls: BundledPath): BundledPath => {
  if (controls.length <= 2) {
    return controls;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (!first || !last) {
    return controls;
  }
  // Duplicating each endpoint twice (three copies with the original) clamps the
  // spline so it interpolates the true endpoints.
  const extended = [first, first, ...controls, last, last];
  const curve: BundledPath = [];
  for (let index = 0; index + 3 < extended.length; index += 1) {
    const pointA = extended[index];
    const pointB = extended[index + 1];
    const pointC = extended[index + 2];
    const pointD = extended[index + 3];
    if (!pointA || !pointB || !pointC || !pointD) {
      continue;
    }
    const [b0, b1, b2, b3] = spanToBezier(pointA, pointB, pointC, pointD);
    flattenBezier(b0, b1, b2, b3, curve, 0);
  }
  curve.push(last);
  return curve;
};

/**
 * Drop interior control points where the route reverses on itself — the turn at
 * that point exceeds {@link REVERSAL_TURN_LIMIT_DEGREES}. These are the hairpins (a
 * nearby pair detouring out to a far centroid and back) that curve smoothing can't
 * round; removing them routes the edge locally instead. Endpoints are always kept,
 * and the pass cascades until no reversals remain.
 */
const pruneReversals = (controls: BundledPath): BundledPath => {
  let current = controls;
  let changed = true;
  while (changed && current.length > 2) {
    changed = false;
    const first = current[0];
    if (!first) {
      break;
    }
    const kept: BundledPath = [first];
    for (let index = 1; index < current.length - 1; index += 1) {
      const prev = kept[kept.length - 1];
      const point = current[index];
      const next = current[index + 1];
      if (!prev || !point || !next) {
        continue;
      }
      const inX = point[0] - prev[0];
      const inY = point[1] - prev[1];
      const outX = next[0] - point[0];
      const outY = next[1] - point[1];
      const inLen = Math.hypot(inX, inY);
      const outLen = Math.hypot(outX, outY);
      if (inLen < 1e-9) {
        // Coincident with the previous kept point — redundant, drop it.
        changed = true;
        continue;
      }
      const cos =
        outLen < 1e-9 ? 1 : (inX * outX + inY * outY) / (inLen * outLen);
      if (cos < REVERSAL_TURN_LIMIT_COS) {
        changed = true;
        continue;
      }
      kept.push(point);
    }
    const last = current[current.length - 1];
    if (last) {
      kept.push(last);
    }
    current = kept;
  }
  return current;
};

/**
 * Resolve one edge to a bundled polyline: route it along the hierarchy, drop any
 * waypoints that would make it double back, pull the rest toward the straight line
 * by (1 − β) per Holten, then smooth into a cubic B-spline. Returns a straight
 * `[from, to]` when no waypoints apply.
 */
export const bundleEdgePath = (
  from: NetworkGraphPoint,
  to: NetworkGraphPoint,
  hierarchy: BundleHierarchy,
): BundledPath => {
  const controls = pruneReversals(controlPointsFor(from, to, hierarchy));
  if (controls.length <= 2) {
    return controls;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (!first || !last) {
    return controls;
  }
  const spanX = last[0] - first[0];
  const spanY = last[1] - first[1];
  const lastIndex = controls.length - 1;
  // β pulls each control point toward the straight A→B line; the endpoints are
  // unaffected (frac = 0 and 1 land back on themselves).
  const adjusted: BundledPath = controls.map(
    (point, index): [number, number] => {
      const frac = index / lastIndex;
      const straightX = first[0] + spanX * frac;
      const straightY = first[1] + spanY * frac;
      return [
        BETA * point[0] + (1 - BETA) * straightX,
        BETA * point[1] + (1 - BETA) * straightY,
      ];
    },
  );
  return basisSpline(adjusted);
};
