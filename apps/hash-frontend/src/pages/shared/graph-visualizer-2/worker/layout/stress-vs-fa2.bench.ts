/* eslint-disable no-console -- committed A/B harness whose whole purpose is to PRINT a
   side-by-side FA2-vs-stress comparison table (time + layout quality). */
/**
 * Head-to-head comparison of the two community-tier layout engines on identical
 * deterministic fixtures:
 *
 *   - FA2       : createCommunityLayout (Louvain → sparse-stress SEED → FA2 refine)
 *   - stress    : createStressLayout    (Louvain → sparse-stress SOLVER w/ fused overlap term)
 *
 * Two outputs, both seeded so runs are reproducible:
 *
 *  1. A module-scope quality + wall-time table (printed on import): for each size it
 *     drives BOTH engines to `settled` with the production 1 ms tick budget, takes the
 *     least-noisy wall time, and computes layout-quality proxies from the settled
 *     positions — normalized edge stress (how close edge lengths sit to the ideal),
 *     edge-length CV (uniformity), strict node overlaps, and spread (RMS radius).
 *
 *  2. vitest `bench()` timing blocks (statistical) for the two smaller sizes, as a
 *     cross-check on the wall times in the table.
 *
 * Run (from apps/hash-frontend):
 *   node_modules/.bin/vitest bench --run \
 *     src/pages/shared/graph-visualizer-2/worker/layout/stress-vs-fa2.bench.ts
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { buildForceGraph } from "../bench-fixtures";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createCommunityLayout } from "./community-layout";
import { countOverlaps } from "./overlap-relax";
import { createStressLayout } from "./stress-layout";

import type { GraphShape } from "../bench-fixtures";
import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";

/** Ideal layout-space hop length; both engines target this scale (SEED_IDEAL_LINK_LENGTH). */
const IDEAL = 40;

function shape(nodeCount: number, linkCount: number, seed: number): GraphShape {
  return {
    nodeCount,
    linkCount,
    typeCount: 1,
    hubCount: Math.max(4, Math.round(nodeCount / 40)),
    rootFraction: 1,
    seed,
  };
}

/** ~300 / ~1.5k / ~5k nodes at ~2.6 hub-skewed edges/node (matches the cost harness). */
const AB_CASES: readonly GraphShape[] = [
  shape(300, 780, 301),
  shape(1_500, 3_900, 302),
  shape(5_000, 13_000, 303),
];

type LayoutFactory = (
  nodes: ForceNode[],
  edges: ForceEdge[],
  buffer: FlatGraphBuffer,
) => LayoutSimulation;

const ENGINES: readonly {
  readonly name: string;
  readonly make: LayoutFactory;
}[] = [
  {
    name: "FA2",
    make: (nodes, edges, buffer) => createCommunityLayout(nodes, edges, buffer),
  },
  {
    name: "stress",
    make: (nodes, edges, buffer) => createStressLayout(nodes, edges, buffer),
  },
];

/** Fresh node objects per run: the solvers mutate x/y in place. */
function cloneNodes(nodes: readonly ForceNode[]): ForceNode[] {
  return nodes.map((node) => ({ ...node }));
}

/** Drive to convergence with the worker scheduler's 1 ms budget (production cadence). */
function driveToSettled(layout: LayoutSimulation): void {
  let guard = 0;
  while (!layout.isSettled && guard < 10_000_000) {
    if (!layout.tick(1)) {
      break;
    }
    guard += 1;
  }
}

interface Quality {
  readonly edgeStress: number;
  readonly edgeCv: number;
  readonly overlaps: number;
  readonly spread: number;
}

/** Layout-quality proxies from the settled node positions. */
function measureQuality(
  nodes: readonly ForceNode[],
  edges: readonly ForceEdge[],
): Quality {
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

  let sumStress = 0;
  let sumLen = 0;
  let sumLenSq = 0;
  let edgeCount = 0;
  const seen = new Set<string>();
  for (const edge of edges) {
    const sourceId =
      typeof edge.source === "string" ? edge.source : edge.source.id;
    const targetId =
      typeof edge.target === "string" ? edge.target : edge.target.id;
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
    const length = Math.hypot(x[hi]! - x[lo]!, y[hi]! - y[lo]!);
    const ratio = length / IDEAL - 1;
    sumStress += ratio * ratio;
    sumLen += length;
    sumLenSq += length * length;
    edgeCount += 1;
  }

  const meanLen = edgeCount > 0 ? sumLen / edgeCount : 0;
  const variance = edgeCount > 0 ? sumLenSq / edgeCount - meanLen * meanLen : 0;
  const edgeCv = meanLen > 0 ? Math.sqrt(Math.max(0, variance)) / meanLen : 0;

  let sumRadiusSq = 0;
  for (let index = 0; index < count; index++) {
    sumRadiusSq += x[index]! * x[index]! + y[index]! * y[index]!;
  }

  return {
    edgeStress: edgeCount > 0 ? Math.sqrt(sumStress / edgeCount) : 0,
    edgeCv,
    overlaps: countOverlaps({ x, y, radii, count, padding: 0 }),
    spread: count > 0 ? Math.sqrt(sumRadiusSq / count) : 0,
  };
}

/** Least-noisy (min) construct-to-settled wall time over `runs`, plus a kept settled layout. */
function solveMin(
  make: LayoutFactory,
  nodes: readonly ForceNode[],
  edges: ForceEdge[],
  runs: number,
): { readonly minMs: number; readonly layout: LayoutSimulation } {
  let minMs = Number.POSITIVE_INFINITY;
  let kept: LayoutSimulation | undefined;
  for (let run = 0; run < runs; run++) {
    const runNodes = cloneNodes(nodes);
    const buffer = new FlatGraphBuffer(Math.max(1, runNodes.length));
    const start = performance.now();
    const layout = make(runNodes, edges, buffer);
    driveToSettled(layout);
    const elapsed = performance.now() - start;
    if (elapsed < minMs) {
      minMs = elapsed;
      kept = layout;
    }
  }
  return { minMs, layout: kept! };
}

function pad(text: string, width: number, alignRight = true): string {
  return alignRight ? text.padStart(width) : text.padEnd(width);
}

/** Cumulative VPSC projection time (ms), if this layout tracks it (stress engine only). */
function projectionMsOf(layout: LayoutSimulation): number | undefined {
  return (layout as { overlapProjectionMs?: number }).overlapProjectionMs;
}

function comparisonReport(caseShape: GraphShape): string {
  const { nodes, edges } = buildForceGraph(caseShape);
  const columns = [8, 12, 10, 12, 10, 10, 10];
  const row = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => pad(cell, columns[index]!, index !== 0))
      .join("  ");

  const lines: string[] = [];
  lines.push(
    `\n=== FA2 vs stress: ${nodes.length} nodes / ${edges.length} edges ` +
      `(barnesHut ${caseShape.nodeCount > 2000 ? "ON" : "OFF"}) ===`,
  );
  const header = row([
    "engine",
    "wall ms",
    "projMs",
    "edgeStress",
    "edgeCV",
    "overlaps",
    "spread",
  ]);
  lines.push(header);
  lines.push("-".repeat(header.length));

  for (const engine of ENGINES) {
    // FA2 is far slower, so fewer timed runs; both take the least-noisy minimum.
    const runs = engine.name === "FA2" ? 2 : 3;
    const { minMs, layout } = solveMin(engine.make, nodes, edges, runs);
    const quality = measureQuality(layout.nodes, edges);
    const projectionMs = projectionMsOf(layout);
    lines.push(
      row([
        engine.name,
        minMs.toFixed(1),
        projectionMs === undefined ? "-" : projectionMs.toFixed(2),
        quality.edgeStress.toFixed(4),
        quality.edgeCv.toFixed(4),
        String(quality.overlaps),
        quality.spread.toFixed(1),
      ]),
    );
  }

  return lines.join("\n");
}

for (const caseShape of AB_CASES) {
  console.log(comparisonReport(caseShape));
}

/** Statistical timing cross-check for the two smaller sizes (5k is timed in the table above). */
const BENCH_OPTIONS = {
  time: 0,
  iterations: 3,
  warmupTime: 0,
  warmupIterations: 1,
} as const;

for (const caseShape of AB_CASES.slice(0, 2)) {
  describe(`community layout solve (${caseShape.nodeCount} nodes)`, () => {
    const { nodes, edges } = buildForceGraph(caseShape);
    for (const engine of ENGINES) {
      bench(
        engine.name,
        () => {
          const runNodes = cloneNodes(nodes);
          const buffer = new FlatGraphBuffer(Math.max(1, runNodes.length));
          driveToSettled(engine.make(runNodes, edges, buffer));
        },
        BENCH_OPTIONS,
      );
    }
  });
}
