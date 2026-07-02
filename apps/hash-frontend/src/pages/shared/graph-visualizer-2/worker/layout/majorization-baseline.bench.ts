/* eslint-disable no-console -- committed metrics harness whose whole purpose is to PRINT
   the majorization engine's tracked quality/perf baseline table. */
/**
 * Tracked metrics baseline for the community-tier layout engine (constrained
 * stress majorization — the only engine since the FA2/SGD trim). Descended from
 * the three-way A/B harness that picked it; the fixtures and metrics are
 * unchanged so numbers stay comparable across history:
 *
 *   wall ms      construct → settled wall time
 *   worstTick    largest single tick (ms) — the jank ceiling
 *   overlaps     strictly intersecting disk pairs (zero-overlap oracle)
 *   edgeStress   scale-invariant RMS edge-length deviation (best-fit uniform scale)
 *   spreadDip    terminal contract→expand rebound: how far the RMS spread dips below
 *                its final value after the widest point, as a fraction of final
 *                (0 = monotone approach, the motion gate)
 *   inter/intra  mean cross-community edge length ÷ mean same-community edge length
 *                (Louvain partition computed once per fixture)
 *   regionOv     region-overlap (PRIMARY region-disjointness metric): fraction of
 *                nodes strictly inside a FOREIGN community's packing disk — the
 *                user-visible "bubble intrudes into another community" artifact
 *                that inter/intra cannot see (folded branches share no edges).
 *                See region-metrics.ts for the full rationale.
 *   hubSpoke     mean spoke length of the 150-leaf hub ÷ its one-ring packing radius
 *                (≈1 = leaves sit right at the tightest feasible halo)
 *   determ.      bitwise position equality across two identical runs
 *
 * Fixtures are the perf-gate shapes: 1k/3k/5k hub-skewed clouds with a 150-leaf
 * near-coincident hub grafted on, plus the ~1k-node TWO-hub "real shape". All are
 * driven at the production 1 ms tick cadence.
 *
 * Run (from apps/hash-frontend):
 *   node_modules/.bin/vitest bench --run \
 *     src/pages/shared/graph-visualizer-2/worker/layout/majorization-baseline.bench.ts
 */
import { UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { parkMillerRng } from "../../math/random";
import {
  buildForceGraphWithCoincidentHub,
  buildRealShapeFixture,
} from "../bench-fixtures";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createMajorizationLayout } from "./majorization-layout";
import { countOverlaps } from "./overlap-relax";
import { measureRegionOverlap } from "./region-metrics";

import type { GraphShape } from "../bench-fixtures";
import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";

const HUB_LEAVES = 150;
/** Extra pair gap used by the hub-halo denominator (matches the engine's padding). */
const HALO_PADDING = 8;

interface Fixture {
  readonly name: string;
  readonly nodes: ForceNode[];
  readonly edges: ForceEdge[];
  /** Whether to also do the double-run determinism check (doubles the cost). */
  readonly checkDeterminism: boolean;
}

function cloudShape(cloudCount: number): GraphShape {
  return {
    nodeCount: cloudCount,
    linkCount: Math.round(cloudCount * 2.6),
    typeCount: 1,
    hubCount: Math.max(4, Math.round(cloudCount / 40)),
    rootFraction: 1,
    seed: 4_000 + cloudCount,
  };
}

function buildFixtures(): Fixture[] {
  const real = buildRealShapeFixture();
  const fixtures: Fixture[] = [
    {
      name: "real-2hub",
      nodes: real.nodes,
      edges: real.edges,
      checkDeterminism: true,
    },
  ];
  for (const cloudCount of [1_000, 3_000, 5_000]) {
    const { nodes, edges } = buildForceGraphWithCoincidentHub(
      cloudShape(cloudCount),
      HUB_LEAVES,
    );
    fixtures.push({
      name: `${cloudCount}+hub`,
      nodes,
      edges,
      checkDeterminism: cloudCount === 1_000,
    });
  }
  return fixtures;
}

/** Fresh node objects per run: the solver mutates x/y in place. */
function cloneNodes(nodes: readonly ForceNode[]): ForceNode[] {
  return nodes.map((node) => ({ ...node }));
}

function makeLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  buffer: FlatGraphBuffer,
): LayoutSimulation {
  return createMajorizationLayout(nodes, edges, buffer);
}

const edgeEndpointId = (endpoint: ForceEdge["source"]): string =>
  typeof endpoint === "string" ? endpoint : endpoint.id;

/** RMS distance of the node positions from their centroid (the layout's "size"). */
function rmsSpread(layout: LayoutSimulation): number {
  const nodes = layout.nodes;
  const count = nodes.length;
  let cx = 0;
  let cy = 0;
  for (const node of nodes) {
    cx += node.x ?? 0;
    cy += node.y ?? 0;
  }
  cx /= count;
  cy /= count;
  let sumSq = 0;
  for (const node of nodes) {
    const dx = (node.x ?? 0) - cx;
    const dy = (node.y ?? 0) - cy;
    sumSq += dx * dx + dy * dy;
  }
  return Math.sqrt(sumSq / count);
}

interface DriveResult {
  readonly wallMs: number;
  readonly worstTickMs: number;
  readonly spreads: readonly number[];
}

/** Drive to settled at the production 1 ms cadence, recording per-tick cost + spread. */
function drive(layout: LayoutSimulation): DriveResult {
  let worstTickMs = 0;
  const spreads: number[] = [];
  const wallStart = performance.now();
  for (let step = 0; step < 2_000_000 && !layout.isSettled; step++) {
    const start = performance.now();
    const moved = layout.tick(1);
    const tickMs = performance.now() - start;
    if (tickMs > worstTickMs) {
      worstTickMs = tickMs;
    }
    spreads.push(rmsSpread(layout));
    if (!moved) {
      break;
    }
  }
  return {
    wallMs: performance.now() - wallStart,
    worstTickMs,
    spreads,
  };
}

/** Terminal rebound of a spread trace: dip below the final size after the peak, then climb. */
function terminalReboundOf(spreads: readonly number[]): number {
  let peak = 0;
  let peakIndex = 0;
  for (const [index, spread] of spreads.entries()) {
    if (spread > peak) {
      peak = spread;
      peakIndex = index;
    }
  }
  let postPeakMin = Number.POSITIVE_INFINITY;
  for (let index = peakIndex; index < spreads.length; index++) {
    if (spreads[index]! < postPeakMin) {
      postPeakMin = spreads[index]!;
    }
  }
  const finalSpread = spreads.length > 0 ? spreads[spreads.length - 1]! : 0;
  if (!Number.isFinite(postPeakMin)) {
    postPeakMin = finalSpread;
  }
  return finalSpread > 0 ? (finalSpread - postPeakMin) / finalSpread : 0;
}

/** One Louvain partition per fixture (seeded → deterministic). */
function communityPartition(
  nodes: readonly ForceNode[],
  edges: readonly ForceEdge[],
  seed: number,
): Map<string, number> {
  const graph = new UndirectedGraph();
  for (const node of nodes) {
    graph.addNode(node.id);
  }
  for (const edge of edges) {
    const source = edgeEndpointId(edge.source);
    const target = edgeEndpointId(edge.target);
    if (source !== target && !graph.hasEdge(source, target)) {
      graph.addEdge(source, target);
    }
  }
  const assignments = louvain(graph, { rng: parkMillerRng(seed) });
  const communities = new Map<string, number>();
  for (const [nodeId, community] of Object.entries(assignments)) {
    communities.set(nodeId, community);
  }
  return communities;
}

interface Quality {
  readonly overlaps: number;
  readonly edgeStress: number;
  readonly interIntra: number;
  readonly regionOverlap: number;
  readonly hubSpokeRatio: number;
}

function measureQuality(
  layout: LayoutSimulation,
  edges: readonly ForceEdge[],
  communities: ReadonlyMap<string, number>,
): Quality {
  const nodes = layout.nodes;
  const count = nodes.length;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const radii = new Float32Array(count);
  const idToIndex = new Map<string, number>();
  for (const [index, node] of nodes.entries()) {
    idToIndex.set(node.id, index);
    x[index] = node.x ?? 0;
    y[index] = node.y ?? 0;
    radii[index] = node.radius;
  }

  // Deduped edge lengths, split by community sides.
  const lengths: number[] = [];
  let sumSame = 0;
  let sameCount = 0;
  let sumCross = 0;
  let crossCount = 0;
  const degree = new Uint32Array(count);
  const seen = new Set<string>();
  for (const edge of edges) {
    const sourceId = edgeEndpointId(edge.source);
    const targetId = edgeEndpointId(edge.target);
    const source = idToIndex.get(sourceId);
    const target = idToIndex.get(targetId);
    if (source === undefined || target === undefined || source === target) {
      continue;
    }
    const lo = Math.min(source, target);
    const hi = Math.max(source, target);
    const key = `${lo}:${hi}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    degree[lo]! += 1;
    degree[hi]! += 1;
    const length = Math.hypot(x[hi]! - x[lo]!, y[hi]! - y[lo]!);
    lengths.push(length);
    if (communities.get(sourceId) === communities.get(targetId)) {
      sumSame += length;
      sameCount += 1;
    } else {
      sumCross += length;
      crossCount += 1;
    }
  }

  // Scale-invariant edge stress: RMS relative deviation from the best-fit uniform
  // length (every fixture edge is one hop, so the best-fit "ideal" is the mean).
  const meanLen =
    lengths.length > 0
      ? lengths.reduce((sum, length) => sum + length, 0) / lengths.length
      : 0;
  let sumSqDev = 0;
  for (const length of lengths) {
    const dev = meanLen > 0 ? length / meanLen - 1 : 0;
    sumSqDev += dev * dev;
  }

  // Hub halo: mean spoke length of the highest-degree node vs its one-ring packing
  // radius (the tightest circle its children could sit on side by side).
  let hub = 0;
  for (let index = 1; index < count; index++) {
    if (degree[index]! > degree[hub]!) {
      hub = index;
    }
  }
  let spokeSum = 0;
  let spokeCount = 0;
  let ringNeed = 0;
  for (const edge of edges) {
    const source = idToIndex.get(edgeEndpointId(edge.source));
    const target = idToIndex.get(edgeEndpointId(edge.target));
    if (source === undefined || target === undefined) {
      continue;
    }
    const other = source === hub ? target : target === hub ? source : undefined;
    if (other === undefined || other === hub) {
      continue;
    }
    spokeSum += Math.hypot(x[other]! - x[hub]!, y[other]! - y[hub]!);
    spokeCount += 1;
    ringNeed += 2 * radii[other]! + HALO_PADDING;
  }
  const ringRadius = ringNeed / (2 * Math.PI);

  const regionStats = measureRegionOverlap(
    nodes.map((node) => ({
      x: node.x ?? 0,
      y: node.y ?? 0,
      radius: node.radius,
      community: communities.get(node.id) ?? -1,
    })),
  );

  return {
    overlaps: countOverlaps({ x, y, radii, count, padding: 0 }),
    edgeStress: lengths.length > 0 ? Math.sqrt(sumSqDev / lengths.length) : 0,
    interIntra:
      sameCount > 0 && crossCount > 0
        ? sumCross / crossCount / (sumSame / sameCount)
        : 0,
    regionOverlap: regionStats.diskContainment,
    hubSpokeRatio:
      spokeCount > 0 && ringRadius > 0 ? spokeSum / spokeCount / ringRadius : 0,
  };
}

/** Bitwise position equality of two settled runs over identical input. */
function isDeterministic(nodes: readonly ForceNode[], edges: ForceEdge[]) {
  const runPositions = (): Float64Array => {
    const runNodes = cloneNodes(nodes);
    const layout = makeLayout(
      runNodes,
      edges,
      new FlatGraphBuffer(runNodes.length),
    );
    drive(layout);
    const positions = new Float64Array(runNodes.length * 2);
    for (const [index, node] of layout.nodes.entries()) {
      positions[index * 2] = node.x ?? 0;
      positions[index * 2 + 1] = node.y ?? 0;
    }
    return positions;
  };
  const first = runPositions();
  const second = runPositions();
  return first.every((value, index) => value === second[index]);
}

function pad(text: string, width: number, alignRight = true): string {
  return alignRight ? text.padStart(width) : text.padEnd(width);
}

function baselineReport(fixture: Fixture): string {
  const { nodes, edges } = fixture;
  const communities = communityPartition(nodes, edges, 1);
  const columns = [13, 9, 10, 9, 11, 10, 12, 9, 9, 8];
  const row = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => pad(cell, columns[index]!, index !== 0))
      .join("  ");

  const lines: string[] = [];
  lines.push(
    `\n=== baseline ${fixture.name}: ${nodes.length} nodes / ${edges.length} edges ===`,
  );
  const header = row([
    "engine",
    "wall ms",
    "worstTick",
    "overlaps",
    "edgeStress",
    "spreadDip",
    "inter/intra",
    "regionOv",
    "hubSpoke",
    "determ.",
  ]);
  lines.push(header);
  lines.push("-".repeat(header.length));

  const runNodes = cloneNodes(nodes);
  const layout = makeLayout(
    runNodes,
    edges,
    new FlatGraphBuffer(runNodes.length),
  );
  const result = drive(layout);
  const quality = measureQuality(layout, edges, communities);
  const deterministic = fixture.checkDeterminism
    ? isDeterministic(nodes, edges)
      ? "yes"
      : "NO"
    : "-";
  lines.push(
    row([
      "majorization",
      result.wallMs.toFixed(0),
      result.worstTickMs.toFixed(1),
      String(quality.overlaps),
      quality.edgeStress.toFixed(3),
      terminalReboundOf(result.spreads).toFixed(3),
      quality.interIntra.toFixed(2),
      quality.regionOverlap.toFixed(3),
      quality.hubSpokeRatio.toFixed(2),
      deterministic,
    ]),
  );

  return lines.join("\n");
}

for (const fixture of buildFixtures()) {
  console.log(baselineReport(fixture));
}

/** Statistical timing cross-check on the real shape (the primary fixture). */
const BENCH_OPTIONS = {
  time: 0,
  iterations: 3,
  warmupTime: 0,
  warmupIterations: 1,
} as const;

describe("community layout solve (real two-hub shape)", () => {
  const { nodes, edges } = buildRealShapeFixture();
  bench(
    "majorization",
    () => {
      const runNodes = cloneNodes(nodes);
      drive(makeLayout(runNodes, edges, new FlatGraphBuffer(runNodes.length)));
    },
    BENCH_OPTIONS,
  );
});
