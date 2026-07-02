/* eslint-disable id-length */
/**
 * Edge geometry: hierarchical highway model.
 *
 * The edge rendering follows a highway metaphor:
 *
 * - Highway: a single curved path between two cluster ports.
 *   Each link type is a lane (parallel offset from center line).
 *   Lanes merge at endpoints via a funnel ramp.
 *
 * - Feeders: inside an open container, lines run from each
 *   sub-cluster (or entity) to the container's port, where they
 *   merge into the highway. Feeder width is proportional to
 *   the sub-cluster's contribution to the highway.
 *
 * This composes recursively: sub-clusters have their own ports,
 * their feeders merge at the parent port, which connects to
 * the highway. It's feeders all the way down until we reach
 * the indivisible unit: individual entities.
 *
 * Container crossings: when an edge crosses a container boundary,
 * it's split into a feeder (inside) and a shared highway (outside).
 * Multiple children sharing the same container and external target
 * merge into one highway, avoiding duplicate edge rendering.
 */

import {
  BEZIER_NO_LINK,
  type Color,
  type RenderBezierBuffers,
  type RenderEdgeArrow,
  type RenderEdgeLabel,
} from "../../frames";
import { makePairKey, widthForCount } from "./edge-aggregation";

import type { VizConfig } from "../../config";
import type { Circle, Position } from "../../geometry";
import type { ClusterId, PairKey } from "../../ids";
import type { ClusterTree } from "../hierarchy/cluster-tree";
import type { Port } from "./bubble-ports";
import type {
  AggregatedVisualEdge,
  CutIndex,
  EdgeFrame,
} from "./edge-aggregation";

interface Waypoint extends Position {
  readonly angle: number;
}

interface CubicCurve {
  readonly p0: readonly [number, number];
  readonly p1: readonly [number, number];
  readonly p2: readonly [number, number];
  readonly p3: readonly [number, number];
}

const FLOATS_PER_SEGMENT = 8;
const BYTES_PER_COLOR = 4;
/** Two clip circles per segment: `(cx, cy, signedRadius)` x 2 (one per end). */
const FLOATS_PER_CLIP = 6;
const EDGE_LABEL_TEXT_WIDTH_EM = 0.58;
/** Keep labels as a lane annotation, not a banner that consumes the whole chord. */
const EDGE_LABEL_MAX_CHORD_FRACTION = 0.68;
/** Approximate the render layer's horizontal capsule padding in text-size units. */
const EDGE_LABEL_HORIZONTAL_PADDING_EM = 1.6;
/** Approximate the render layer's vertical capsule padding in text-size units. */
const EDGE_LABEL_VERTICAL_PADDING_EM = 0.46;

/**
 * A circle that erases the edge on one side of itself in the fragment shader, so
 * the edge ends flush on a bubble's perimeter rather than poking through it (the
 * round SDF cap overshoots the wall, and since the edge layer is translucent the
 * overshoot shows on both sides, draw order can't hide it, only a true clip).
 * `signedRadius > 0` erases inside the circle (a highway ending on a bubble's
 * outer wall); `< 0` erases outside (a feeder ending on its container's inner
 * wall); `0` (or omitted) means no clip on that end.
 */
export interface ClipCircle {
  readonly x: number;
  readonly y: number;
  readonly signedRadius: number;
}

/** Clip that ends an edge flush on a bubble's outer wall (erase inside it), for
 * a highway/feeder that approaches a cluster from outside. */
function clipInside(circle: Circle): ClipCircle {
  return { x: circle.x, y: circle.y, signedRadius: circle.radius };
}

/** Clip that ends an edge flush on a container's inner wall (erase outside it),
 * for a feeder that reaches its container's port from inside. */
function clipOutside(circle: Circle): ClipCircle {
  return { x: circle.x, y: circle.y, signedRadius: -circle.radius };
}

/**
 * Append-only sink for cubic Bezier segments backed by flat typed arrays.
 *
 * Instead of producing one segment object per curve (thousands of
 * short-lived objects + tuple arrays per frame), each segment is written
 * directly into three parallel scratch buffers:
 *
 * - `positions`: 8 floats/segment (p0..p3, interleaved as vec2 pairs)
 * - `colors`:    4 bytes/segment  (r, g, b, a)
 * - `widths`:    1 float/segment  (px)
 *
 * The buffers are owned by the worker and reused across frames: `reset()`
 * rewinds the write cursor, and capacity only ever grows (never shrinks).
 * Because the underlying buffers are reused, `snapshot()` returns exact-sized
 * *copies* whose `ArrayBuffer`s can be transferred to the main thread without
 * detaching the scratch.
 */
export class BezierSegmentSink {
  #positions: Float32Array;
  #colors: Uint8Array;
  #widths: Float32Array;
  #clips: Float32Array;
  #ids: Uint32Array;
  #count = 0;
  #capacity: number;

  constructor(initialCapacity = 1024) {
    this.#capacity = Math.max(1, initialCapacity);
    this.#positions = new Float32Array(this.#capacity * FLOATS_PER_SEGMENT);
    this.#colors = new Uint8Array(this.#capacity * BYTES_PER_COLOR);
    this.#widths = new Float32Array(this.#capacity);
    this.#clips = new Float32Array(this.#capacity * FLOATS_PER_CLIP);
    this.#ids = new Uint32Array(this.#capacity);
  }

  /** Number of segments written since the last `reset()`. */
  get count(): number {
    return this.#count;
  }

  /** Rewind the write cursor. Retains allocated capacity. */
  reset(): void {
    this.#count = 0;
  }

  /** Append one segment. Grows the backing buffers if needed. `clipA`/`clipB`
   * erase the edge near its two ends so it ends flush on a bubble wall. */
  push(
    curve: CubicCurve,
    color: Color,
    width: number,
    clipA?: ClipCircle,
    clipB?: ClipCircle,
    id: number = BEZIER_NO_LINK,
  ): void {
    if (this.#count >= this.#capacity) {
      this.#grow(this.#count + 1);
    }

    const i = this.#count;
    const p = i * FLOATS_PER_SEGMENT;
    const pos = this.#positions;
    pos[p] = curve.p0[0];
    pos[p + 1] = curve.p0[1];
    pos[p + 2] = curve.p1[0];
    pos[p + 3] = curve.p1[1];
    pos[p + 4] = curve.p2[0];
    pos[p + 5] = curve.p2[1];
    pos[p + 6] = curve.p3[0];
    pos[p + 7] = curve.p3[1];

    const c = i * BYTES_PER_COLOR;
    const colors = this.#colors;
    colors[c] = color[0];
    colors[c + 1] = color[1];
    colors[c + 2] = color[2];
    colors[c + 3] = color[3];

    this.#widths[i] = width;

    const k = i * FLOATS_PER_CLIP;
    const clips = this.#clips;
    clips[k] = clipA?.x ?? 0;
    clips[k + 1] = clipA?.y ?? 0;
    clips[k + 2] = clipA?.signedRadius ?? 0;
    clips[k + 3] = clipB?.x ?? 0;
    clips[k + 4] = clipB?.y ?? 0;
    clips[k + 5] = clipB?.signedRadius ?? 0;

    this.#ids[i] = id;
    this.#count = i + 1;
  }

  #grow(minCapacity: number): void {
    let next = this.#capacity * 2;
    while (next < minCapacity) {
      next *= 2;
    }

    const positions = new Float32Array(next * FLOATS_PER_SEGMENT);
    positions.set(this.#positions);
    const colors = new Uint8Array(next * BYTES_PER_COLOR);
    colors.set(this.#colors);
    const widths = new Float32Array(next);
    widths.set(this.#widths);
    const clips = new Float32Array(next * FLOATS_PER_CLIP);
    clips.set(this.#clips);
    const ids = new Uint32Array(next);
    ids.set(this.#ids);

    this.#positions = positions;
    this.#colors = colors;
    this.#widths = widths;
    this.#clips = clips;
    this.#ids = ids;
    this.#capacity = next;
  }

  /**
   * Produce exact-sized, transferable copies of the current contents. The
   * scratch buffers are left intact (and detached-safe) for the next frame.
   */
  snapshot(): RenderBezierBuffers {
    const count = this.#count;
    return {
      positions: this.#positions.slice(0, count * FLOATS_PER_SEGMENT),
      colors: this.#colors.slice(0, count * BYTES_PER_COLOR),
      widths: this.#widths.slice(0, count),
      clips: this.#clips.slice(0, count * FLOATS_PER_CLIP),
      ids: this.#ids.slice(0, count),
      segmentCount: count,
    };
  }
}

/**
 * Minimum curve "bend" injected when the natural control points are
 * (near-)collinear, expressed so that the resulting midpoint sag is a
 * gentle fraction of the chord. Keeps a smooth, deterministic arc instead
 * of degenerating to a straight line when two ports face each other
 * directly (MANIFESTO "Avoiding intermediate cluster intersections",
 * approach C). The bend metric below equals (p1 + p2) perpendicular
 * deviation; the curve's midpoint sag is (3/8) of it.
 */
const COLLINEAR_BEND_FRACTION = 0.15;

/** Common/world gap between snug-packed parallel lanes. 0 = touching. */
const LANE_GAP_WORLD = 1;

/**
 * Cubic Bezier between two waypoints. Both control points extend
 * outward along each waypoint's outward normal. Tension clamped
 * to 45% of chord length to prevent overshoot.
 *
 * When the two handles are (near-)collinear with the chord (the common case,
 * since ports aim straight at each other) the cubic degenerates to a line. A
 * perpendicular bow is then injected toward the chord's left normal, ramping
 * smoothly to zero once the natural curvature is large enough. The side is
 * derived purely from chord direction, so:
 *  - it is continuous (no snap) as the layout settles, and crucially does not
 *    flip when an LOD change swaps the highway endpoints (the old per-pair
 *    hash flipped, which read as a jarring jump);
 *  - opposing flows separate for free: A->B and B->A have opposite chords, so
 *    they bow to opposite sides instead of overlapping.
 */
function cubicBetweenWaypoints(
  from: Waypoint,
  to: Waypoint,
  rawTension: number,
  bow = true,
): CubicCurve {
  const chordX = to.x - from.x;
  const chordY = to.y - from.y;
  const chord = Math.hypot(chordX, chordY);
  const tension = Math.min(rawTension, 0.45 * chord);

  let p1x = from.x + Math.cos(from.angle) * tension;
  let p1y = from.y + Math.sin(from.angle) * tension;
  let p2x = to.x + Math.cos(to.angle) * tension;
  let p2y = to.y + Math.sin(to.angle) * tension;

  if (bow && chord > 1e-6) {
    // Unit normal to the chord (chord rotated +90 degrees): the consistent bow side.
    const nx = -chordY / chord;
    const ny = chordX / chord;

    // Signed perpendicular deviation of each handle from the chord. Both
    // are ~0 exactly when the curve has degenerated to a straight line.
    const perp1 = (p1x - from.x) * nx + (p1y - from.y) * ny;
    const perp2 = (p2x - to.x) * nx + (p2y - to.y) * ny;

    const bendMetric = perp1 + perp2;
    const target = COLLINEAR_BEND_FRACTION * chord;

    // collinearity in [0, 1]: 1 = perfectly collinear, 0 = already curved
    // enough. The injected offset ramps to zero at the threshold, so the final
    // bend is continuous in the natural curvature.
    const collinearity = 1 - Math.min(1, Math.abs(bendMetric) / target);
    if (collinearity > 0) {
      // Split the bow equally across both handles for a symmetric arc.
      const dq = (target * collinearity) / 2;
      p1x += dq * nx;
      p1y += dq * ny;
      p2x += dq * nx;
      p2y += dq * ny;
    }
  }

  return {
    p0: [from.x, from.y],
    p1: [p1x, p1y],
    p2: [p2x, p2y],
    p3: [to.x, to.y],
  };
}

interface ContainerCrossing {
  readonly containerId: ClusterId;
  readonly circle: Circle;
}

interface HierarchyInfo {
  /** Source-side containers (inner -> outer), excluding shared. */
  readonly sourceContainers: readonly ContainerCrossing[];
  /** Target-side containers (inner -> outer), excluding shared. */
  readonly targetContainers: readonly ContainerCrossing[];
}

/**
 * Find container boundaries between source and target, split by side.
 */
export function analyzeHierarchy(
  sourceId: ClusterId,
  targetId: ClusterId,
  clusterTree: ClusterTree,
  containerIds: ReadonlySet<ClusterId>,
): HierarchyInfo {
  const sourceContainers: ContainerCrossing[] = [];
  let node = clusterTree.get(sourceId);
  while (node?.parent) {
    if (containerIds.has(node.parent.id)) {
      sourceContainers.push({
        containerId: node.parent.id,
        circle: node.parent.circle,
      });
    }
    node = node.parent;
  }

  const targetContainers: ContainerCrossing[] = [];
  node = clusterTree.get(targetId);
  while (node?.parent) {
    if (containerIds.has(node.parent.id)) {
      targetContainers.push({
        containerId: node.parent.id,
        circle: node.parent.circle,
      });
    }
    node = node.parent;
  }

  const sourceSet = new Set(sourceContainers.map((cc) => cc.containerId));
  const sharedIds = new Set(
    targetContainers
      .filter((cc) => sourceSet.has(cc.containerId))
      .map((cc) => cc.containerId),
  );

  return {
    sourceContainers: sourceContainers.filter(
      (cc) => !sharedIds.has(cc.containerId),
    ),
    targetContainers: targetContainers.filter(
      (cc) => !sharedIds.has(cc.containerId),
    ),
  };
}

export function containerBoundaryWaypoint(
  circle: Circle,
  towardX: number,
  towardY: number,
  padding: number,
): Waypoint {
  const angle = Math.atan2(towardY - circle.y, towardX - circle.x);
  const r = circle.radius + padding;
  return {
    x: circle.x + r * Math.cos(angle),
    y: circle.y + r * Math.sin(angle),
    angle,
  };
}

/**
 * Direction of a highway/feeder lane, normalized so that "forward"
 * always means flow from the highway source side to the target side,
 * regardless of each child pair's own PairKey sort order.
 */
type LaneDirection = "forward" | "reverse" | "both";

/**
 * Normalize a directed aggregate edge to the highway orientation.
 *
 * `nearId` is the child cluster on the side we are merging from, and
 * `side` says whether that side is the highway's source or target.
 * An edge whose physical source is the near child flows away from the
 * source side (highway "forward"); on the target side the test inverts.
 * Collapsed edges carry no single direction and stay "both".
 */
function highwayDirection(
  edge: AggregatedVisualEdge,
  nearId: ClusterId,
  side: "source" | "target",
): LaneDirection {
  if (edge.direction === "both") {
    return "both";
  }
  // Physical "from" cluster of the link.
  const fromId = edge.direction === "forward" ? edge.source.id : edge.target.id;
  if (side === "source") {
    return fromId === nearId ? "forward" : "reverse";
  }
  return fromId === nearId ? "reverse" : "forward";
}

interface MergedLane {
  readonly count: number;
  readonly color: Color;
  readonly widthWorld: number;
  readonly typeLabel: string;
  readonly direction: LaneDirection;
}

function mergeLanes(
  children: readonly HighwayGroupChild[],
  side: "source" | "target",
): MergedLane[] {
  const byLane = new Map<
    string,
    {
      count: number;
      color: Color;
      typeLabel: string;
      direction: LaneDirection;
    }
  >();

  for (const child of children) {
    for (const edge of child.edges) {
      const typeKey = (edge.typeSetId as number | undefined) ?? -1;
      const direction = highwayDirection(edge, child.childId, side);
      const key = `${typeKey}:${direction}`;
      const existing = byLane.get(key);
      if (existing) {
        existing.count += edge.count;
      } else {
        byLane.set(key, {
          count: edge.count,
          color: edge.color,
          typeLabel: edge.typeLabel,
          direction,
        });
      }
    }
  }

  return [...byLane.values()].map((info) => ({
    count: info.count,
    color: info.color,
    widthWorld: widthForCount(info.count),
    typeLabel: info.typeLabel,
    direction: info.direction,
  }));
}

interface FeederTypeInfo {
  count: number;
  color: Color;
  typeLabel: string;
  readonly direction: LaneDirection;
}

interface FeederSegment {
  sourceId: ClusterId;
  sourceCircle: Circle;
  targetWp: Waypoint;
  targetId: ClusterId;
  /**
   * Per (type, direction) counts and colors. Each entry becomes a
   * colored lane, keyed by `${typeKey}:${direction}` so forward and
   * reverse flows stay on separate lanes that match the highway.
   */
  types: Map<string, FeederTypeInfo>;
}

function getOrCreateSegment(
  segments: Map<string, FeederSegment>,
  key: string,
  init: Omit<FeederSegment, "types">,
): FeederSegment {
  let seg = segments.get(key);
  if (!seg) {
    seg = { ...init, types: new Map() };
    segments.set(key, seg);
  }
  return seg;
}

function mergeFeederTypes(
  target: Map<string, FeederTypeInfo>,
  source: ReadonlyMap<string, FeederTypeInfo>,
): void {
  for (const [typeKey, info] of source) {
    const existing = target.get(typeKey);
    if (existing) {
      existing.count += info.count;
    } else {
      target.set(typeKey, { ...info });
    }
  }
}

interface ClassifiedPair {
  readonly pairKey: PairKey;
  readonly edges: AggregatedVisualEdge[];
  readonly sourceId: ClusterId;
  readonly targetId: ClusterId;
  readonly hierarchy: HierarchyInfo;
}

/**
 * A highway group: multiple block-level pairs that share
 * the same outermost container exit and external target.
 * Their edges merge into one highway at the container boundary.
 */
interface HighwayGroupChild {
  readonly childId: ClusterId;
  readonly childCircle: Circle;
  readonly edges: AggregatedVisualEdge[];
}

interface HighwayGroup {
  readonly highwaySourceId: ClusterId;
  readonly highwaySourceCircle: Circle;
  readonly highwayTargetId: ClusterId;
  readonly highwayTargetCircle: Circle;
  /** Children on the source side (inside source container). */
  readonly sourceChildren: HighwayGroupChild[];
  /** Children on the target side (inside target container). */
  readonly targetChildren: HighwayGroupChild[];
}

export interface EdgeGeometryContext {
  readonly clusterTree: ClusterTree;
  readonly cutIndex: CutIndex;
  /** Visible solid bubbles a highway should route around (excludes its own ends). */
  readonly obstacles: readonly {
    readonly id: ClusterId;
    readonly circle: Circle;
  }[];
}

/** Keep a routed highway this far (x obstacle radius) outside the bubble. */
const ROUTE_CLEARANCE_MUL = 1.15;
/** Ignore obstacles this close (fraction of chord) to either endpoint. */
const ROUTE_END_MARGIN = 0.08;

/**
 * Compute raw cubic Bezier curves between consecutive waypoints.
 * Returns one CubicCurve per segment (no tessellation).
 */
function computeRawCurves(
  source: Waypoint,
  target: Waypoint,
  crossings: readonly ContainerCrossing[],
  config: VizConfig,
  bow = true,
): CubicCurve[] {
  const waypoints: Waypoint[] = [source];

  for (let ci = 0; ci < crossings.length; ci++) {
    const crossing = crossings[ci]!;
    const nextX =
      ci < crossings.length - 1 ? crossings[ci + 1]!.circle.x : target.x;
    const nextY =
      ci < crossings.length - 1 ? crossings[ci + 1]!.circle.y : target.y;

    waypoints.push(
      containerBoundaryWaypoint(
        crossing.circle,
        nextX,
        nextY,
        config.portPaddingWorld,
      ),
    );
  }

  waypoints.push(target);

  // Bow only a single straight segment (for parallel-edge separation); routed
  // or boundary-crossing paths already get their shape from their waypoints, so
  // bowing each segment there just makes them wiggle.
  const useBow = bow && waypoints.length === 2;

  const curves: CubicCurve[] = [];
  for (let wi = 0; wi < waypoints.length - 1; wi++) {
    const from = waypoints[wi]!;
    const to = waypoints[wi + 1]!;
    const segLen = Math.hypot(to.x - from.x, to.y - from.y);
    const tension = config.portTension * segLen;
    curves.push(cubicBetweenWaypoints(from, to, tension, useBow));
  }

  return curves;
}

/**
 * Offset a cubic curve perpendicular to its chord (p0->p3).
 * This is an approximation; the exact parallel of a cubic Bezier
 * is not itself a cubic Bezier. Accurate for small offsets.
 */
function offsetCurve(curve: CubicCurve, offset: number): CubicCurve {
  if (offset === 0) {
    return curve;
  }
  const dx = curve.p3[0] - curve.p0[0];
  const dy = curve.p3[1] - curve.p0[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * offset;
  const ny = (dx / len) * offset;

  return {
    p0: [curve.p0[0] + nx, curve.p0[1] + ny],
    p1: [curve.p1[0] + nx, curve.p1[1] + ny],
    p2: [curve.p2[0] + nx, curve.p2[1] + ny],
    p3: [curve.p3[0] + nx, curve.p3[1] + ny],
  };
}

/**
 * Offset a chain of cubics (a routed polyline-of-beziers) by `offset`. The key
 * difference from offsetting each segment independently: at a shared waypoint
 * the two adjacent segments offset their common endpoint along the same
 * (bisector) normal, so a routed lane stays continuous instead of zig-zagging
 * sideways at every join. The control handles use each segment's own normal.
 */
function offsetPolyBezier(
  curves: readonly CubicCurve[],
  offset: number,
): CubicCurve[] {
  if (offset === 0) {
    return curves.slice();
  }

  const normals = curves.map((curve) => {
    const dx = curve.p3[0] - curve.p0[0];
    const dy = curve.p3[1] - curve.p0[1];
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len] as const;
  });

  const bisector = (
    n1: readonly [number, number],
    n2: readonly [number, number],
  ): readonly [number, number] => {
    const sumX = n1[0] + n2[0];
    const sumY = n1[1] + n2[1];
    const len = Math.hypot(sumX, sumY) || 1;
    return [sumX / len, sumY / len];
  };

  return curves.map((curve, idx) => {
    const own = normals[idx]!;
    const start = idx > 0 ? bisector(normals[idx - 1]!, own) : own;
    const end =
      idx < curves.length - 1 ? bisector(own, normals[idx + 1]!) : own;
    return {
      p0: [curve.p0[0] + start[0] * offset, curve.p0[1] + start[1] * offset],
      p1: [curve.p1[0] + own[0] * offset, curve.p1[1] + own[1] * offset],
      p2: [curve.p2[0] + own[0] * offset, curve.p2[1] + own[1] * offset],
      p3: [curve.p3[0] + end[0] * offset, curve.p3[1] + end[1] * offset],
    };
  });
}

function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return String(count);
}

/** Point on a cubic Bezier at parameter t. */
function cubicPoint(curve: CubicCurve, t: number): readonly [number, number] {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [
    w0 * curve.p0[0] + w1 * curve.p1[0] + w2 * curve.p2[0] + w3 * curve.p3[0],
    w0 * curve.p0[1] + w1 * curve.p1[1] + w2 * curve.p2[1] + w3 * curve.p3[1],
  ];
}

/**
 * Tangent direction of a cubic at t, as a TextLayer angle in degrees.
 * Negated because OrthographicView renders y-down (flipY), so a world-space
 * counterclockwise angle is mirrored on screen. Kept in [-90, 90] so the text
 * never reads upside down.
 */
function cubicTangentAngle(curve: CubicCurve, t: number): number {
  const u = 1 - t;
  const dx =
    3 * u * u * (curve.p1[0] - curve.p0[0]) +
    6 * u * t * (curve.p2[0] - curve.p1[0]) +
    3 * t * t * (curve.p3[0] - curve.p2[0]);
  const dy =
    3 * u * u * (curve.p1[1] - curve.p0[1]) +
    6 * u * t * (curve.p2[1] - curve.p1[1]) +
    3 * t * t * (curve.p3[1] - curve.p2[1]);
  let deg = (-Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg > 90) {
    deg -= 180;
  } else if (deg < -90) {
    deg += 180;
  }
  return deg;
}

/** World-space tangent angle of a cubic at t, used for geometric marks such as arrowheads. */
function cubicTangentRadians(curve: CubicCurve, t: number): number {
  const u = 1 - t;
  const dx =
    3 * u * u * (curve.p1[0] - curve.p0[0]) +
    6 * u * t * (curve.p2[0] - curve.p1[0]) +
    3 * t * t * (curve.p3[0] - curve.p2[0]);
  const dy =
    3 * u * u * (curve.p1[1] - curve.p0[1]) +
    6 * u * t * (curve.p2[1] - curve.p1[1]) +
    3 * t * t * (curve.p3[1] - curve.p2[1]);
  return Math.atan2(dy, dx);
}

function arrowSizeForLane(widthWorld: number): number {
  return Math.max(widthWorld * 1.15, 1.6);
}

function labelSizeForLane(
  widthWorld: number,
  chord: number,
  text: string,
): number {
  const heightBudget = widthWorld + 4;
  const heightFit = heightBudget / (1 + EDGE_LABEL_VERTICAL_PADDING_EM);
  const widthFit =
    (chord * EDGE_LABEL_MAX_CHORD_FRACTION) /
    Math.max(
      1,
      text.length * EDGE_LABEL_TEXT_WIDTH_EM + EDGE_LABEL_HORIZONTAL_PADDING_EM,
    );

  return Math.max(1.4, Math.min(heightFit, widthFit));
}

/**
 * Emit one lane per (type, direction) as offset parallel curves, and one label
 * per lane riding it: at the lane midpoint, rotated to the curve tangent, sized
 * to the lane's width. The lanes carry typeLabel + count so each colored lane
 * is annotated with its own type and flow, not a single dominant summary.
 */
function emitCurveLanes(
  out: BezierSegmentSink,
  curves: readonly CubicCurve[],
  lanes: readonly {
    readonly color: Color;
    readonly widthWorld: number;
    readonly typeLabel: string;
    readonly count: number;
    readonly direction?: LaneDirection;
    /**
     * The aggregate lane's stable per-commit id (its index in the edge frame's
     * visual-edge list). Carried as the segment `id` so a clicked highway
     * segment resolves back to the lane (and thus its link set). Undefined for a
     * lane with no single aggregate identity (a merged highway uses the group's
     * representative id, passed by the caller).
     */
    readonly laneId?: number;
  }[],
  labelsOut: RenderEdgeLabel[],
  arrowsOut: RenderEdgeArrow[],
  clipStart?: ClipCircle,
  clipEnd?: ClipCircle,
): void {
  const gap = LANE_GAP_WORLD;
  const midIdx = Math.floor(curves.length / 2);

  // Pack lanes snug and centered on the chord in common/world units. The render layer projects
  // widths and offsets with the camera, so zoom does not require worker-side Bezier regeneration.
  let bundleWidth = -gap;
  for (const info of lanes) {
    bundleWidth += info.widthWorld + gap;
  }
  let cursor = -bundleWidth / 2;

  for (let lane = 0; lane < lanes.length; lane++) {
    const info = lanes[lane]!;
    const width = info.widthWorld;
    const laneOffset = cursor + width / 2;
    cursor += width + gap;

    // Offset the whole chain at once (bisector normals at the joins) so a routed
    // multi-segment lane stays continuous instead of zig-zagging at waypoints.
    const laneCurves =
      laneOffset === 0 ? curves : offsetPolyBezier(curves, laneOffset);
    let midCurve: CubicCurve | undefined;
    const lastCi = laneCurves.length - 1;
    for (let ci = 0; ci < laneCurves.length; ci++) {
      const curve = laneCurves[ci]!;
      // Only the path's first/last segments touch a bubble (the ends); the
      // interior routes between them, so it gets no clip. The lane's id rides
      // every segment so a clicked highway resolves back to its links.
      out.push(
        curve,
        info.color,
        width,
        ci === 0 ? clipStart : undefined,
        ci === lastCi ? clipEnd : undefined,
        info.laneId,
      );
      if (ci === midIdx) {
        midCurve = curve;
      }
    }

    if (midCurve && info.count > 0) {
      const chord = Math.hypot(
        midCurve.p3[0] - midCurve.p0[0],
        midCurve.p3[1] - midCurve.p0[1],
      );
      const [mx, my] = cubicPoint(midCurve, 0.5);
      const text = `${info.typeLabel} ${formatCount(info.count)}`;
      labelsOut.push({
        x: mx,
        y: my,
        text,
        angle: cubicTangentAngle(midCurve, 0.5),
        // World-sized to stay in the same coordinate system as the lane it annotates. Fitted
        // against both lane thickness and the visible chord so long labels don't become banners.
        size: labelSizeForLane(width, chord, text),
        chord,
      });
      if (info.direction === "forward" || info.direction === "reverse") {
        const t = info.direction === "forward" ? 0.68 : 0.32;
        const [x, y] = cubicPoint(midCurve, t);
        arrowsOut.push({
          kind: "lane",
          x,
          y,
          angle:
            cubicTangentRadians(midCurve, t) +
            (info.direction === "forward" ? 0 : Math.PI),
          size: arrowSizeForLane(width),
          color: info.color,
          chord,
        });
      }
    }
  }
}

/** Emit feeder paths recursively through the container hierarchy as Bezier
 * segments. Every segment carries `laneId` (the highway group's representative
 * aggregate lane id) so a clicked feeder resolves to the same link set as its
 * highway. */
function emitRecursiveBezierFeeders(
  out: BezierSegmentSink,
  arrowsOut: RenderEdgeArrow[],
  children: readonly HighwayGroupChild[],
  outermostWp: Waypoint,
  outermostContainerId: ClusterId,
  side: "source" | "target",
  clusterTree: ClusterTree,
  containerIds: ReadonlySet<ClusterId>,
  config: VizConfig,
  laneId: number,
): void {
  const segments = new Map<string, FeederSegment>();

  for (const child of children) {
    const childTypes = new Map<string, FeederTypeInfo>();
    for (const edge of child.edges) {
      const typeKey = (edge.typeSetId as number | undefined) ?? -1;
      const direction = highwayDirection(edge, child.childId, side);
      const key = `${typeKey}:${direction}`;
      const existing = childTypes.get(key);
      if (existing) {
        existing.count += edge.count;
      } else {
        childTypes.set(key, {
          count: edge.count,
          color: edge.color,
          typeLabel: edge.typeLabel,
          direction,
        });
      }
    }

    let currentId = child.childId;
    let currentCircle = child.childCircle;
    let node = clusterTree.get(currentId);

    while (node?.parent) {
      const parentId = node.parent.id;
      if (parentId === outermostContainerId) {
        const key = `${currentId}:${outermostContainerId}`;
        const seg = getOrCreateSegment(segments, key, {
          sourceId: currentId,
          sourceCircle: currentCircle,
          targetWp: outermostWp,
          targetId: outermostContainerId,
        });
        mergeFeederTypes(seg.types, childTypes);
        break;
      }
      if (containerIds.has(parentId)) {
        const parentCluster = clusterTree.get(parentId);
        if (!parentCluster) {
          break;
        }
        const parentPortWp = containerBoundaryWaypoint(
          parentCluster.circle,
          outermostWp.x,
          outermostWp.y,
          config.portPaddingWorld,
        );
        const key = `${currentId}:${parentId}`;
        const seg = getOrCreateSegment(segments, key, {
          sourceId: currentId,
          sourceCircle: currentCircle,
          targetWp: parentPortWp,
          targetId: parentId,
        });
        mergeFeederTypes(seg.types, childTypes);
        currentId = parentId;
        currentCircle = parentCluster.circle;
        node = parentCluster;
      } else {
        node = node.parent;
      }
    }
  }

  const gap = LANE_GAP_WORLD;
  const childIds = new Set(children.map((child) => child.childId));

  for (const seg of segments.values()) {
    // Where the hop leaves its source circle. The original participant leaves
    // toward its own first boundary (`targetWp`). A pass-through container is
    // entered at its boundary toward the outermost port (the exact point the
    // incoming hop targeted) so consecutive hops share an endpoint. Re-projecting
    // a pass-through toward its next hop instead made hops disagree by a few
    // position-dependent degrees at every nested intermediate (the feeder kink at
    // depth >= 2 intermediate containers; a single intermediate happens to align).
    const aimToward = childIds.has(seg.sourceId) ? seg.targetWp : outermostWp;
    const sourceAngle = Math.atan2(
      aimToward.y - seg.sourceCircle.y,
      aimToward.x - seg.sourceCircle.x,
    );
    const feederSource: Waypoint = {
      x: seg.sourceCircle.x + seg.sourceCircle.radius * Math.cos(sourceAngle),
      y: seg.sourceCircle.y + seg.sourceCircle.radius * Math.sin(sourceAngle),
      angle: sourceAngle,
    };
    const inwardAngle = Math.atan2(
      seg.sourceCircle.y - seg.targetWp.y,
      seg.sourceCircle.x - seg.targetWp.x,
    );
    const feederEnd: Waypoint = {
      x: seg.targetWp.x,
      y: seg.targetWp.y,
      angle: inwardAngle,
    };

    const segLen = Math.hypot(
      feederEnd.x - feederSource.x,
      feederEnd.y - feederSource.y,
    );
    const tension = config.portTension * segLen;
    const baseCurve = cubicBetweenWaypoints(feederSource, feederEnd, tension);

    // Clip every hop flush at both its container walls: leave the source's outer
    // wall (erase inside the source) and reach the target container's inner wall
    // (erase outside the target). Applied at every nesting level so the feeder
    // is flush at intermediate container walls too -- without it, two hops'
    // round caps overlap into a blob poking through the (translucent) wall.
    const targetCircle = clusterTree.get(seg.targetId)?.circle;
    const clipStart = clipInside(seg.sourceCircle);
    const clipEnd = targetCircle ? clipOutside(targetCircle) : undefined;

    const types = [...seg.types.values()];
    let bundleWidth = -gap;
    for (const info of types) {
      bundleWidth += widthForCount(info.count) + gap;
    }
    let cursor = -bundleWidth / 2;

    for (const info of types) {
      const laneWidth = widthForCount(info.count);
      const laneOffset = cursor + laneWidth / 2;
      cursor += laneWidth + gap;
      const curve =
        laneOffset === 0 ? baseCurve : offsetCurve(baseCurve, laneOffset);

      out.push(curve, info.color, laneWidth, clipStart, clipEnd, laneId);
      if (info.direction === "forward" || info.direction === "reverse") {
        const t = 0.58;
        const [x, y] = cubicPoint(curve, t);
        const forwardAlongCurve =
          (side === "source" && info.direction === "forward") ||
          (side === "target" && info.direction === "reverse");
        arrowsOut.push({
          kind: "lane",
          x,
          y,
          angle:
            cubicTangentRadians(curve, t) + (forwardAlongCurve ? 0 : Math.PI),
          size: arrowSizeForLane(laneWidth),
          color: info.color,
          chord: segLen,
        });
      }
    }
  }
}

/**
 * Highway-level endpoints of a base pair: the outermost rendered containers the
 * edge actually travels between (the leaf endpoints if neither is nested in an
 * open container). Ports are computed at this level so a cluster's port toward a
 * neighbor subtree stays put whether that subtree's container is open or closed.
 */
export function highwayEndpoints(
  sourceId: ClusterId,
  targetId: ClusterId,
  clusterTree: ClusterTree,
  containerIds: ReadonlySet<ClusterId>,
): {
  readonly highwaySourceId: ClusterId;
  readonly highwayTargetId: ClusterId;
} {
  const { sourceContainers, targetContainers } = analyzeHierarchy(
    sourceId,
    targetId,
    clusterTree,
    containerIds,
  );
  return {
    highwaySourceId:
      sourceContainers.length > 0
        ? sourceContainers[sourceContainers.length - 1]!.containerId
        : sourceId,
    highwayTargetId:
      targetContainers.length > 0
        ? targetContainers[targetContainers.length - 1]!.containerId
        : targetId,
  };
}

/** The port on each of two clusters for their connecting highway, by id. */
export function portsFor(
  portPairs: ReadonlyMap<
    string,
    { readonly source: Port; readonly target: Port }
  >,
  aId: ClusterId,
  bId: ClusterId,
): { readonly a: Port; readonly b: Port } | undefined {
  const pair = portPairs.get(makePairKey(aId, bId).key);
  if (!pair) {
    return undefined;
  }
  // computeAllPorts orders source/target by id; map back to the requested ids.
  return aId < bId
    ? { a: pair.source, b: pair.target }
    : { a: pair.target, b: pair.source };
}

/** The worst obstacle intrusion on one polyline segment, if any. */
interface SegmentHit {
  readonly segIndex: number;
  /** Foot-of-perpendicular position along the segment. */
  readonly footX: number;
  readonly footY: number;
  /** Unit normal of the segment (left side). */
  readonly nx: number;
  readonly ny: number;
  /** Signed perpendicular offset of the obstacle centre from the segment. */
  readonly perp: number;
  /** Clearance the waypoint must reach to clear the obstacle. */
  readonly clear: number;
  /** How far inside the clearance the obstacle reaches (>0 means it clips). */
  readonly intrusion: number;
}

/**
 * The single worst (deepest-clipping) obstacle across every segment of the
 * current polyline `path`, or null if nothing clips. Endpoint clusters and
 * obstacles hugging a segment's ends are excluded.
 */
function worstObstacleOnPath(
  path: readonly Waypoint[],
  exempt: ReadonlySet<ClusterId>,
  obstacles: readonly { readonly id: ClusterId; readonly circle: Circle }[],
): SegmentHit | null {
  let worst: SegmentHit | null = null;

  for (let seg = 0; seg < path.length - 1; seg++) {
    const a = path[seg]!;
    const b = path[seg + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const chord = Math.hypot(dx, dy);
    if (chord < 1e-6) {
      continue;
    }
    const ux = dx / chord;
    const uy = dy / chord;
    const nx = -uy;
    const ny = ux;

    for (const obstacle of obstacles) {
      if (exempt.has(obstacle.id)) {
        continue;
      }
      const ox = obstacle.circle.x - a.x;
      const oy = obstacle.circle.y - a.y;
      const param = (ox * ux + oy * uy) / chord;
      if (param <= ROUTE_END_MARGIN || param >= 1 - ROUTE_END_MARGIN) {
        continue;
      }
      const perp = ox * nx + oy * ny;
      const dist = Math.abs(perp);
      // Only detour when the segment actually enters the bubble, merely grazing
      // its clearance margin shouldn't spawn a waypoint (that zig-zags the path
      // through a dense field of bubbles). The waypoint is still placed out at
      // the clearance ring, so a real detour keeps its gap.
      if (dist >= obstacle.circle.radius) {
        continue;
      }
      const clear = obstacle.circle.radius * ROUTE_CLEARANCE_MUL;
      const intrusion = clear - dist;
      if (worst === null || intrusion > worst.intrusion) {
        worst = {
          segIndex: seg,
          footX: a.x + ux * (param * chord),
          footY: a.y + uy * (param * chord),
          nx,
          ny,
          perp,
          clear,
          intrusion,
        };
      }
    }
  }

  return worst;
}

/** Cap routing passes so a pathological cluster of obstacles can't loop. */
const ROUTE_MAX_PASSES = 8;
/** A point counts as inside a bubble within this multiple of its radius. */
const ROUTE_CONTAIN_TOLERANCE = 1.02;

/** Is `pt` inside (or essentially on the edge of) the obstacle circle? */
function containsPoint(
  circle: Circle,
  pt: { readonly x: number; readonly y: number },
): boolean {
  return (
    Math.hypot(circle.x - pt.x, circle.y - pt.y) <=
    circle.radius * ROUTE_CONTAIN_TOLERANCE
  );
}

/**
 * B1: a highway from `source` to `target` that bends around every intervening
 * bubble (one waypoint per obstacle, on the shorter side), or the straight cubic
 * if nothing is in the way. Multi-pass: after inserting a detour we re-test the
 * whole polyline, so a waypoint that newly clips another bubble is itself routed
 * around, the path is clear of all (circle) obstacles when we stop. A bubble
 * that encloses an endpoint is exempt: the edge has to enter/leave it, so an
 * endpoint's own (highway-level) container and every ancestor enclosing it
 * (opened clusters included) are skipped, tested purely geometrically. Curves
 * bow gently off the polyline, so segment clearance closely approximates curve
 * clearance; residual clipping is only possible after `ROUTE_MAX_PASSES` in a
 * densely packed field.
 */
function routeAround(
  source: Waypoint,
  target: Waypoint,
  sourceId: ClusterId,
  targetId: ClusterId,
  obstacles: readonly { readonly id: ClusterId; readonly circle: Circle }[],
  config: VizConfig,
): CubicCurve[] {
  if (obstacles.length === 0) {
    return computeRawCurves(source, target, [], config);
  }

  // A bubble is not an obstacle for an edge whose endpoint lives inside it (its
  // own container and every enclosing ancestor, opened clusters included).
  const exempt = new Set<ClusterId>([sourceId, targetId]);
  for (const obstacle of obstacles) {
    if (
      containsPoint(obstacle.circle, source) ||
      containsPoint(obstacle.circle, target)
    ) {
      exempt.add(obstacle.id);
    }
  }

  // Build the avoidance polyline by repeatedly routing around the worst clip.
  const path: Waypoint[] = [source, target];
  for (let pass = 0; pass < ROUTE_MAX_PASSES; pass++) {
    const hit = worstObstacleOnPath(path, exempt, obstacles);
    if (!hit) {
      break;
    }
    // Waypoint beside the obstacle, on the side opposite its centre (shorter
    // detour), just past its clearance ring.
    const side = hit.perp >= 0 ? -1 : 1;
    const wpPerp = hit.perp + side * hit.clear;
    path.splice(hit.segIndex + 1, 0, {
      x: hit.footX + hit.nx * wpPerp,
      y: hit.footY + hit.ny * wpPerp,
      angle: 0,
    });
  }

  // Pull the polyline taut: drop any waypoint whose removal doesn't re-introduce
  // a clip. The greedy multi-pass can leave alternating-side waypoints that
  // zig-zag the centreline; this keeps only the load-bearing detours.
  let removed = true;
  while (removed && path.length > 2) {
    removed = false;
    for (let idx = 1; idx < path.length - 1; idx++) {
      const shortcut = [path[idx - 1]!, path[idx + 1]!];
      if (!worstObstacleOnPath(shortcut, exempt, obstacles)) {
        path.splice(idx, 1);
        removed = true;
        break;
      }
    }
  }

  if (path.length === 2) {
    return computeRawCurves(source, target, [], config);
  }

  // Build smooth C1 cubics through the waypoints. The through-tangent at an
  // interior point runs along (next - prev) (Catmull-Rom). Crucial detail:
  // `cubicBetweenWaypoints` places a segment's end handle at p2 = p3 +
  // tension*dir(angle), so the end angle must point backward along the tangent,
  // otherwise p2 lands beyond p3 (further from p0 than p3) and the cubic
  // overshoots and loops back on itself at every waypoint. The start handle
  // points forward; the path endpoints keep their port-normal angles.
  const tangentAt = (idx: number): number => {
    if (idx === 0) {
      return source.angle;
    }
    if (idx === path.length - 1) {
      return target.angle;
    }
    const prev = path[idx - 1]!;
    const next = path[idx + 1]!;
    return Math.atan2(next.y - prev.y, next.x - prev.x);
  };

  const curves: CubicCurve[] = [];
  for (let idx = 0; idx < path.length - 1; idx++) {
    const a = path[idx]!;
    const b = path[idx + 1]!;
    const fromAngle = tangentAt(idx);
    const toAngle =
      idx + 1 === path.length - 1 ? target.angle : tangentAt(idx + 1) + Math.PI;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const tension = config.portTension * segLen;
    curves.push(
      cubicBetweenWaypoints(
        { x: a.x, y: a.y, angle: fromAngle },
        { x: b.x, y: b.y, angle: toAngle },
        tension,
        false,
      ),
    );
  }
  return curves;
}

/**
 * Build Bezier segments for the BezierSDFLayer, plus label/arrow marks for each directed drawn
 * lane. Nested pairs share their merged container highway's lanes instead of scattering numbers
 * per base pair.
 *
 * Segments are written into the caller-owned `out` sink (flat typed arrays)
 * rather than allocating per-segment objects. The caller is responsible for
 * calling `out.reset()` before invoking and `out.snapshot()` afterwards.
 */
export function buildBezierSegments(
  frame: EdgeFrame,
  portPairs: ReadonlyMap<
    string,
    { readonly source: Port; readonly target: Port }
  >,
  ctx: EdgeGeometryContext,
  config: VizConfig,
  out: BezierSegmentSink,
  labelsOut: RenderEdgeLabel[],
  arrowsOut: RenderEdgeArrow[],
): void {
  // Classify aggregate edges into pairs.
  const byPair = new Map<PairKey, AggregatedVisualEdge[]>();
  for (const edge of frame.visualEdges) {
    if (edge.kind !== "aggregate") {
      continue;
    }
    let list = byPair.get(edge.pairKey);
    if (!list) {
      list = [];
      byPair.set(edge.pairKey, list);
    }
    list.push(edge);
  }

  const classified: ClassifiedPair[] = [];
  for (const [pairKey, edges] of byPair) {
    const sourceId = edges[0]!.source.id;
    const targetId = edges[0]!.target.id;
    const hierarchy = analyzeHierarchy(
      sourceId,
      targetId,
      ctx.clusterTree,
      ctx.cutIndex.containerIds,
    );
    classified.push({ pairKey, edges, sourceId, targetId, hierarchy });
  }

  // Direct pairs: highway curves through the pair's (container-level) ports.
  for (const pair of classified) {
    if (
      pair.hierarchy.sourceContainers.length > 0 ||
      pair.hierarchy.targetContainers.length > 0
    ) {
      continue;
    }
    const ports = portsFor(portPairs, pair.sourceId, pair.targetId);
    if (!ports) {
      continue;
    }
    const curves = routeAround(
      ports.a,
      ports.b,
      pair.sourceId,
      pair.targetId,
      ctx.obstacles,
      config,
    );
    const directSrc = ctx.clusterTree.get(pair.sourceId)?.circle;
    const directTgt = ctx.clusterTree.get(pair.targetId)?.circle;
    emitCurveLanes(
      out,
      curves,
      pair.edges,
      labelsOut,
      arrowsOut,
      directSrc ? clipInside(directSrc) : undefined,
      directTgt ? clipInside(directTgt) : undefined,
    );
  }

  // Hierarchical pairs: merged highways + feeders.
  const highwayGroups = new Map<string, HighwayGroup>();

  for (const pair of classified) {
    const { sourceContainers, targetContainers } = pair.hierarchy;
    if (sourceContainers.length === 0 && targetContainers.length === 0) {
      continue;
    }

    const outermostSource =
      sourceContainers.length > 0
        ? sourceContainers[sourceContainers.length - 1]!
        : undefined;
    const outermostTarget =
      targetContainers.length > 0
        ? targetContainers[targetContainers.length - 1]!
        : undefined;

    const highwaySourceId = outermostSource?.containerId ?? pair.sourceId;
    const highwayTargetId = outermostTarget?.containerId ?? pair.targetId;
    const groupKey = `${highwaySourceId}\x1f${highwayTargetId}`;

    let group = highwayGroups.get(groupKey);
    if (!group) {
      const sourceCircle =
        outermostSource?.circle ?? ctx.clusterTree.get(pair.sourceId)?.circle;
      const targetCircle =
        outermostTarget?.circle ?? ctx.clusterTree.get(pair.targetId)?.circle;
      // An endpoint the tree cannot resolve (mid-rebuild race) has no
      // meaningful position; emitting a curve to a made-up origin circle
      // draws a highway to (0,0). Drop the pair for this frame instead.
      if (!sourceCircle || !targetCircle) {
        continue;
      }

      group = {
        highwaySourceId,
        highwaySourceCircle: sourceCircle,
        highwayTargetId,
        highwayTargetCircle: targetCircle,
        sourceChildren: [],
        targetChildren: [],
      };
      highwayGroups.set(groupKey, group);
    }

    if (outermostSource) {
      const childCluster = ctx.clusterTree.get(pair.sourceId);
      if (childCluster) {
        group.sourceChildren.push({
          childId: pair.sourceId,
          childCircle: childCluster.circle,
          edges: pair.edges,
        });
      }
    }
    if (outermostTarget) {
      const childCluster = ctx.clusterTree.get(pair.targetId);
      if (childCluster) {
        group.targetChildren.push({
          childId: pair.targetId,
          childCircle: childCluster.circle,
          edges: pair.edges,
        });
      }
    }
  }

  for (const group of highwayGroups.values()) {
    // Each pair contributes its edges once. When both endpoints are
    // nested, the pair appears in both sourceChildren and targetChildren
    // with the same edges, so merging both sides doubles every lane.
    const usingSource = group.sourceChildren.length > 0;
    const mergeChildren = usingSource
      ? group.sourceChildren
      : group.targetChildren;
    const merged = mergeLanes(mergeChildren, usingSource ? "source" : "target");
    if (merged.length === 0) {
      continue;
    }

    // A merged highway collapses several aggregate edges (per type+direction
    // across children) into one ribbon, so no single lane id applies. Carry the
    // group's representative aggregate lane id on every highway + feeder
    // segment, so a clicked merged highway still resolves to a real lane's link
    // set. Lanes carry it via a tagged copy; feeders take it as an argument.
    const groupLaneId = mergeChildren[0]?.edges[0]?.laneId ?? BEZIER_NO_LINK;
    const mergedLanes = merged.map((lane) => ({
      ...lane,
      laneId: groupLaneId,
    }));

    // Route through the stable container-level ports so the highway attaches at
    // the same point whether the container is open or closed; fall back to a raw
    // boundary waypoint if a port is missing, so edges always render.
    const hp = portsFor(
      portPairs,
      group.highwaySourceId,
      group.highwayTargetId,
    );
    const sourceWp: Waypoint =
      hp?.a ??
      containerBoundaryWaypoint(
        group.highwaySourceCircle,
        group.highwayTargetCircle.x,
        group.highwayTargetCircle.y,
        config.portPaddingWorld,
      );
    const targetWp: Waypoint =
      hp?.b ??
      containerBoundaryWaypoint(
        group.highwayTargetCircle,
        group.highwaySourceCircle.x,
        group.highwaySourceCircle.y,
        config.portPaddingWorld,
      );

    const curves = routeAround(
      sourceWp,
      targetWp,
      group.highwaySourceId,
      group.highwayTargetId,
      ctx.obstacles,
      config,
    );
    emitCurveLanes(
      out,
      curves,
      mergedLanes,
      labelsOut,
      arrowsOut,
      clipInside(group.highwaySourceCircle),
      clipInside(group.highwayTargetCircle),
    );

    // Feeders as Bezier segments.
    emitRecursiveBezierFeeders(
      out,
      arrowsOut,
      group.sourceChildren,
      sourceWp,
      group.highwaySourceId,
      "source",
      ctx.clusterTree,
      ctx.cutIndex.containerIds,
      config,
      groupLaneId,
    );
    emitRecursiveBezierFeeders(
      out,
      arrowsOut,
      group.targetChildren,
      targetWp,
      group.highwayTargetId,
      "target",
      ctx.clusterTree,
      ctx.cutIndex.containerIds,
      config,
      groupLaneId,
    );
  }

  // Individual entity edges and entity fan-out feeders are not emitted here.
  // They depend on per-entity positions that stream through the position
  // SharedArrayBuffer, and would otherwise force this whole O(entities * degree)
  // pass to re-run on every force tick. The main thread composes them as straight
  // LineLayers from the same shared buffer the dots read (see RenderEntityLayer),
  // so dots and their edges share one update channel and cannot tear.
}
