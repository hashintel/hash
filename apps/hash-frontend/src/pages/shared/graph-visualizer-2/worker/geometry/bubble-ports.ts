/* eslint-disable id-length, no-param-reassign */
/**
 * Bubble ports: dedicated boundary points where edges enter or exit
 * a cluster. For each pair of connected visible clusters, a port on
 * each cluster faces the other. All edges between the pair are routed
 * through these two ports, producing clean bundled paths.
 *
 * Port slotting ensures minimum angular separation between ports on
 * the same cluster. When too many neighbors lie in similar directions,
 * ports are merged into angular sectors.
 *
 * Hysteresis: port assignments are cached per (clusterId, neighbor set).
 * Ports only recompute when the set of connected neighbors changes.
 */
import type { VizConfig } from "../../config";
import type { Circle } from "../../geometry";
import type { ClusterId } from "../../ids";
import type { ClusterTree } from "../hierarchy/cluster-tree";
/** Minimal interface for pair data needed by port computation. */
export interface PairInfo {
  readonly sourceId: ClusterId;
  readonly targetId: ClusterId;
  readonly totalCount: number;
  readonly byType: ReadonlyMap<number, unknown>;
}

export interface Port {
  readonly clusterId: ClusterId;
  readonly neighborId: ClusterId;
  /**
   * Every neighbor this port serves. For unmerged ports this is a
   * single-element array equal to `[neighborId]`. For ports merged by
   * angular sector it holds all neighbors collapsed into the sector, so
   * lookups keyed by neighbor (e.g. entity fan-out feeders) can resolve
   * every neighbor to its port instead of only the representative.
   */
  readonly allNeighborIds: readonly ClusterId[];
  readonly angle: number;
  readonly x: number;
  readonly y: number;
  readonly edgeCount: number;
  readonly distinctTypes: number;
}

interface RawPort {
  readonly neighborId: ClusterId;
  angle: number;
  readonly edgeCount: number;
  readonly distinctTypes: number;
}

// Helpers (above callers)

function makePort(
  clusterId: ClusterId,
  neighborId: ClusterId,
  allNeighborIds: readonly ClusterId[],
  angle: number,
  circle: Circle,
  padding: number,
  edgeCount: number,
  distinctTypes: number,
): Port {
  const r = circle.radius + padding;
  return {
    clusterId,
    neighborId,
    allNeighborIds,
    angle,
    x: circle.x + r * Math.cos(angle),
    y: circle.y + r * Math.sin(angle),
    edgeCount,
    distinctTypes,
  };
}

/** A single port's reserved arc is capped here so one can't hog the rim. */
const MAX_PORT_ARC = Math.PI / 3;

/**
 * Pool Adjacent Violators: the optimal monotone non-decreasing least-squares fit
 * of `desired`, in O(n). With the cumulative reserved-arc offsets folded out
 * (see {@link placePortsOnPerimeter}), placing ports at minimum total
 * displacement subject to "stay in cyclic order, keep a gap apart" is isotonic
 * regression, and PAVA solves it exactly.
 */
function poolAdjacentViolators(desired: readonly number[]): number[] {
  const blocks: { sum: number; count: number }[] = [];
  for (const value of desired) {
    let block = { sum: value, count: 1 };
    while (
      blocks.length > 0 &&
      blocks[blocks.length - 1]!.sum / blocks[blocks.length - 1]!.count >
        block.sum / block.count
    ) {
      const prev = blocks.pop()!;
      block = { sum: prev.sum + block.sum, count: prev.count + block.count };
    }
    blocks.push(block);
  }

  const result: number[] = [];
  for (const block of blocks) {
    const mean = block.sum / block.count;
    for (let i = 0; i < block.count; i++) {
      result.push(mean);
    }
  }
  return result;
}

/**
 * Place ports on the bubble's perimeter. Model: a port is a node constrained to
 * the circle, free to slide along it. Each wants its ideal angle, the perimeter
 * point nearest its target (straight toward the neighbor), which keeps the
 * leader short and stops the edge cutting back through the bubble. Ports reserve
 * an arc (proportional to lane count, so wider bundles get more room) and may
 * not overlap; we slide them the minimum total amount to satisfy that while
 * preserving their cyclic order, so leaders never cross.
 *
 * Theory: fix the cyclic order (cut the rim at the pair with the most free
 * space) and fold out the cumulative reserved-arc offsets, then "minimise
 * sum(placed - ideal)² s.t. placed stays ordered, >= a gap apart" is exactly
 * isotonic regression, solved optimally by PAVA. It is the 1-D specialisation of
 * the separation-constraint solve (VPSC) WebCola runs for node non-overlap, the
 * same theory, applied to angles on the rim.
 *
 * `ports` is pre-sorted ascending by ideal angle; mutates `port.angle`.
 */
function placePortsOnPerimeter(
  ports: RawPort[],
  minArc: number,
  maxArc: number,
): void {
  const n = ports.length;
  if (n < 2) {
    return;
  }

  // Reserved arc per port (proportional to lane count), clamped; scaled down
  // together if they would overflow the rim, so they always fit (then they pack
  // tight).
  const arc = ports.map((port) =>
    Math.min(maxArc, Math.max(minArc, minArc * port.distinctTypes)),
  );
  let total = 0;
  for (const value of arc) {
    total += value;
  }
  const budget = 2 * Math.PI * 0.98;
  if (total > budget) {
    const scale = budget / total;
    for (let i = 0; i < n; i++) {
      arc[i] = arc[i]! * scale;
    }
  }

  // Required centre-to-centre gap after port i (wrapping).
  const gapAfter = (i: number): number => (arc[i]! + arc[(i + 1) % n]!) / 2;

  // Cut the cycle at the consecutive pair with the most slack, so no separation
  // constraint spans the cut and the remainder is a linear chain.
  let cutAfter = n - 1;
  let bestSlack = -Infinity;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    let gap = ports[next]!.angle - ports[i]!.angle;
    if (next === 0) {
      gap += 2 * Math.PI;
    }
    const slack = gap - gapAfter(i);
    if (slack > bestSlack) {
      bestSlack = slack;
      cutAfter = i;
    }
  }

  // Linear order starting just after the cut; unwrap angles to increase.
  const order: number[] = [];
  for (let k = 0; k < n; k++) {
    order.push((cutAfter + 1 + k) % n);
  }
  const theta: number[] = [];
  let running = ports[order[0]!]!.angle;
  theta.push(running);
  for (let k = 1; k < n; k++) {
    let angle = ports[order[k]!]!.angle;
    while (angle < running) {
      angle += 2 * Math.PI;
    }
    theta.push(angle);
    running = angle;
  }

  // Fold out cumulative gaps -> isotonic problem; PAVA; fold the gaps back in.
  const prefix: number[] = [0];
  for (let k = 1; k < n; k++) {
    prefix.push(prefix[k - 1]! + gapAfter(order[k - 1]!));
  }
  const fitted = poolAdjacentViolators(
    theta.map((value, k) => value - prefix[k]!),
  );
  for (let k = 0; k < n; k++) {
    ports[order[k]!]!.angle = fitted[k]! + prefix[k]!;
  }
}

/**
 * Merge ports into angular sectors when there are too many for the
 * available screen space. Each neighbor maps to its sector's merged port.
 */
function mergeByAngularSector(
  ports: readonly RawPort[],
  sectorCount: number,
  clusterId: ClusterId,
  circle: Circle,
  padding: number,
): Map<ClusterId, Port> {
  const sectorWidth = (2 * Math.PI) / sectorCount;
  const sectors: RawPort[][] = Array.from({ length: sectorCount }, () => []);

  for (const port of ports) {
    // Map angle from [-π, π] to [0, 2π) for sector assignment.
    let normalized = port.angle + Math.PI;
    if (normalized < 0) {
      normalized += 2 * Math.PI;
    }
    if (normalized >= 2 * Math.PI) {
      normalized -= 2 * Math.PI;
    }
    const sector = Math.min(
      Math.floor(normalized / sectorWidth),
      sectorCount - 1,
    );
    sectors[sector]!.push(port);
  }

  const result = new Map<ClusterId, Port>();

  for (const group of sectors) {
    if (group.length === 0) {
      continue;
    }

    // Circular mean angle.
    let sinSum = 0;
    let cosSum = 0;
    let totalEdges = 0;
    let totalTypes = 0;
    for (const p of group) {
      sinSum += Math.sin(p.angle);
      cosSum += Math.cos(p.angle);
      totalEdges += p.edgeCount;
      totalTypes += p.distinctTypes;
    }
    const meanAngle = Math.atan2(sinSum / group.length, cosSum / group.length);

    const merged = makePort(
      clusterId,
      group[0]!.neighborId,
      group.map((p) => p.neighborId),
      meanAngle,
      circle,
      padding,
      totalEdges,
      totalTypes,
    );

    // All neighbors in this sector share the merged port.
    for (const p of group) {
      result.set(p.neighborId, merged);
    }
  }

  return result;
}

/**
 * Compute slotted ports for a single cluster, returning a map
 * from each neighbor cluster ID to the port serving it.
 */
function slotPorts(
  clusterId: ClusterId,
  rawPorts: RawPort[],
  circle: Circle,
  config: VizConfig,
): Map<ClusterId, Port> {
  if (rawPorts.length === 0) {
    return new Map();
  }

  // Sort by angle for slotting.
  rawPorts.sort((a, b) => a.angle - b.angle);

  // Zoom-independent slotting: a port's slot is a function of neighbor
  // direction only, so ports never re-slot or reassign as the user pans/zooms
  // (spec section 6.5.3 hysteresis). They recompute only when the neighbor set
  // or cluster positions change, which the PortCache key captures.
  const portCap = config.maxPortsPerCluster;
  const minSepAngle = (2 * Math.PI) / portCap;

  if (rawPorts.length <= portCap) {
    // Slide ports to their minimum-displacement, non-overlapping, order-
    // preserving positions on the rim (ideal = straight toward each neighbor).
    placePortsOnPerimeter(rawPorts, minSepAngle, MAX_PORT_ARC);

    const result = new Map<ClusterId, Port>();
    for (const p of rawPorts) {
      result.set(
        p.neighborId,
        makePort(
          clusterId,
          p.neighborId,
          [p.neighborId],
          p.angle,
          circle,
          config.portPaddingWorld,
          p.edgeCount,
          p.distinctTypes,
        ),
      );
    }
    return result;
  }

  // Too many ports: merge by angular sector.
  return mergeByAngularSector(
    rawPorts,
    portCap,
    clusterId,
    circle,
    config.portPaddingWorld,
  );
}

// Port hysteresis cache

/**
 * Caches port assignments per cluster, keyed by a composite signature
 * that captures everything port positions depend on: the cluster's own
 * circle, each neighbor's center, the neighbor set, and zoom.
 *
 * Ports are reused only when none of those inputs changed, preserving
 * hysteresis without freezing ports at stale positions as the force
 * layout moves clusters.
 */
export class PortCache {
  readonly #cache = new Map<
    ClusterId,
    { readonly key: string; readonly ports: Map<ClusterId, Port> }
  >();

  get(clusterId: ClusterId, key: string): Map<ClusterId, Port> | undefined {
    const entry = this.#cache.get(clusterId);
    if (!entry) {
      return undefined;
    }
    return entry.key === key ? entry.ports : undefined;
  }

  set(clusterId: ClusterId, key: string, ports: Map<ClusterId, Port>): void {
    this.#cache.set(clusterId, { key, ports });
  }

  clear(): void {
    this.#cache.clear();
  }
}

// Top-level port computation

interface NeighborInfo {
  readonly neighborId: ClusterId;
  readonly edgeCount: number;
  readonly distinctTypes: number;
}

function addNeighborInfo(
  map: Map<ClusterId, NeighborInfo[]>,
  from: ClusterId,
  to: ClusterId,
  edgeCount: number,
  distinctTypes: number,
): void {
  let list = map.get(from);
  if (!list) {
    list = [];
    map.set(from, list);
  }
  list.push({ neighborId: to, edgeCount, distinctTypes });
}

/**
 * Compute ports for all connected cluster pairs. Returns a map
 * from pair key to { source port, target port }.
 *
 * Uses the PortCache for hysteresis: unchanged neighbor sets
 * reuse cached port positions.
 */
export function computeAllPorts(
  pairs: ReadonlyMap<string, PairInfo>,
  clusterTree: ClusterTree,
  config: VizConfig,
  cache: PortCache,
): Map<string, { readonly source: Port; readonly target: Port }> {
  // Collect per-cluster neighbor info.
  const clusterNeighbors = new Map<ClusterId, NeighborInfo[]>();

  for (const pair of pairs.values()) {
    addNeighborInfo(
      clusterNeighbors,
      pair.sourceId,
      pair.targetId,
      pair.totalCount,
      pair.byType.size,
    );
    addNeighborInfo(
      clusterNeighbors,
      pair.targetId,
      pair.sourceId,
      pair.totalCount,
      pair.byType.size,
    );
  }

  // Compute slotted ports for each cluster (with hysteresis).
  const portsByCluster = new Map<ClusterId, Map<ClusterId, Port>>();

  for (const [clusterId, neighbors] of clusterNeighbors) {
    const cluster = clusterTree.get(clusterId);
    if (!cluster) {
      continue;
    }

    // Compute raw port angles and the cache signature in one pass.
    const rawPorts: RawPort[] = [];
    const sigParts: string[] = [];
    for (const info of neighbors) {
      const neighbor = clusterTree.get(info.neighborId);
      if (!neighbor) {
        continue;
      }

      rawPorts.push({
        neighborId: info.neighborId,
        angle: Math.atan2(
          neighbor.circle.y - cluster.circle.y,
          neighbor.circle.x - cluster.circle.x,
        ),
        edgeCount: info.edgeCount,
        distinctTypes: info.distinctTypes,
      });
      sigParts.push(
        `${info.neighborId}@${neighbor.circle.x.toFixed(2)},${neighbor.circle.y.toFixed(2)}`,
      );
    }

    sigParts.sort();
    // No zoom in the key: slotting is zoom-independent, so a pan/zoom never
    // invalidates ports. Positions stay in the key so ports follow the layout
    // while it settles, then stay put once it freezes.
    const cacheKey = `${cluster.circle.x.toFixed(2)},${cluster.circle.y.toFixed(2)},${cluster.circle.radius.toFixed(2)}|${sigParts.join(
      ";",
    )}`;

    const cached = cache.get(clusterId, cacheKey);
    if (cached) {
      portsByCluster.set(clusterId, cached);
      continue;
    }

    const portMap = slotPorts(clusterId, rawPorts, cluster.circle, config);
    cache.set(clusterId, cacheKey, portMap);
    portsByCluster.set(clusterId, portMap);
  }

  // Build pair key -> (source port, target port) map.
  const result = new Map<
    string,
    { readonly source: Port; readonly target: Port }
  >();

  for (const [pairKey, pair] of pairs) {
    const sourcePort = portsByCluster.get(pair.sourceId)?.get(pair.targetId);
    const targetPort = portsByCluster.get(pair.targetId)?.get(pair.sourceId);

    if (sourcePort && targetPort) {
      result.set(pairKey, { source: sourcePort, target: targetPort });
    }
  }

  return result;
}
