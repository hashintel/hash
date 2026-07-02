/* eslint-disable id-length, no-param-reassign */
/**
 * Bubble ports: dedicated boundary points where edges enter or exit a cluster.
 *
 * For each pair of connected visible clusters, a port on each cluster faces
 * the other. Minimum angular separation is enforced; when too many neighbors
 * lie in similar directions, ports merge into angular sectors. Port assignments
 * are cached and only recompute when the connected neighbor set changes.
 */

import type { VizConfig } from "../../config";
import type { Circle, Position } from "../../geometry";
import type { ClusterId } from "../../ids";
import type { ClusterTree } from "../hierarchy/cluster-tree";

export interface PairInfo {
  readonly sourceId: ClusterId;
  readonly targetId: ClusterId;
  readonly totalCount: number;
  readonly byType: ReadonlySet<number>;
}

export interface Port extends Position {
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

  readonly edgeCount: number;
  readonly distinctTypes: number;
}

interface RawPort {
  readonly neighborId: ClusterId;
  angle: number;
  readonly edgeCount: number;
  readonly distinctTypes: number;
}

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
 * Pool Adjacent Violators (PAVA): optimal monotone non-decreasing least-squares
 * fit of `desired`, in O(n). See {@link placePortsOnPerimeter} for how the
 * isotonic regression maps to port placement.
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
 * Place ports on the bubble's perimeter with minimum displacement, preserving
 * cyclic order and enforcing arc-based non-overlap.
 *
 * Each port wants its ideal angle (straight toward its neighbor). Ports reserve
 * an arc proportional to lane count and may not overlap. The cycle is cut at the
 * pair with the most slack, then PAVA solves the resulting 1-D isotonic problem
 * exactly.
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

  // Scale reserved arcs uniformly when their sum exceeds the rim budget so
  // PAVA always has a feasible domain.
  const arc = ports.map((port) =>
    Math.min(maxArc, Math.max(minArc, minArc * port.distinctTypes)),
  );
  let total = 0;
  for (const value of arc) {
    total += value;
  }
  // Leave ~2% angular slack on the rim so numeric packing does not pin the
  // last port to 2π exactly.
  const budget = 2 * Math.PI * 0.98;
  if (total > budget) {
    const scale = budget / total;
    for (let i = 0; i < n; i++) {
      arc[i] = arc[i]! * scale;
    }
  }

  // Minimum angular separation between port i and i+1 (half the sum of
  // their reserved arcs).
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

  // Unwrap angles monotonically so the cut cycle becomes a chain for
  // isotonic regression.
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

  // Subtract required gaps to get desired centres, run PAVA, then add gaps
  // back to recover feasible angles.
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
 * Collapses excess neighbor ports into fixed angular sectors, keyed so every
 * neighbor in a sector resolves to the same merged port.
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

    // atan2 of summed unit vectors so merged ports sit at the sector's mean
    // direction, not a linear average that wraps badly.
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
      // group is non-empty (we skipped empty sectors). neighborId is only
      // the map representative: allNeighborIds lists every neighbor in the
      // sector.
      group[0]!.neighborId,
      group.map((p) => p.neighborId),
      meanAngle,
      circle,
      padding,
      totalEdges,
      totalTypes,
    );

    for (const p of group) {
      result.set(p.neighborId, merged);
    }
  }

  return result;
}

/**
 * Places or sector-merges neighbor ports on one cluster's rim, enforcing
 * minimum angular separation from config.
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

  rawPorts.sort((a, b) => a.angle - b.angle);

  // Slotting is zoom-independent: ports recompute only when neighbor set
  // or cluster positions change, not on pan/zoom.
  const portCap = config.maxPortsPerCluster;
  const minSepAngle = (2 * Math.PI) / portCap;

  if (rawPorts.length <= portCap) {
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

  return mergeByAngularSector(
    rawPorts,
    portCap,
    clusterId,
    circle,
    config.portPaddingWorld,
  );
}

/**
 * Caches port assignments per cluster, keyed by a signature of the
 * cluster's circle, each neighbor's center + lane counts, and the
 * neighbor set. Ports reuse cached positions until an input changes.
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
 * Builds per-cluster port maps (with cache reuse) and pairs source/target
 * ports for every connected cluster pair.
 */
export function computeAllPorts(
  pairs: ReadonlyMap<string, PairInfo>,
  clusterTree: ClusterTree,
  config: VizConfig,
  cache: PortCache,
): Map<string, { readonly source: Port; readonly target: Port }> {
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

  // Compute slotted ports per cluster; reuse PortCache entries until the
  // cache key (circle + neighbor positions + lane counts) changes.
  const portsByCluster = new Map<ClusterId, Map<ClusterId, Port>>();

  for (const [clusterId, neighbors] of clusterNeighbors) {
    const cluster = clusterTree.get(clusterId);
    if (!cluster) {
      continue;
    }

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
      // The signature covers everything slotPorts reads: neighbor positions
      // (angles) and per-neighbor lane counts (reserved arc widths). Counts
      // change without movement when links stream in between two settled
      // clusters; a position-only key would keep serving stale arcs.
      sigParts.push(
        `${info.neighborId}@${neighbor.circle.x.toFixed(2)},${neighbor.circle.y.toFixed(2)}#${info.edgeCount},${info.distinctTypes}`,
      );
    }

    sigParts.sort();
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
