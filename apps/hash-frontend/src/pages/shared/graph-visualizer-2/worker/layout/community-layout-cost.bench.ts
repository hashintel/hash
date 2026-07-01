/* eslint-disable no-console -- this is a throwaway-but-committed cost-attribution harness whose
   whole purpose is to PRINT the per-pass breakdown table; see worker/layout/community-layout-cost.md */
/**
 * Per-pass cost attribution for the community-force layout (community-layout.ts). Two things live
 * here, both driving deterministic (seeded) inputs so runs are reproducible:
 *
 *  1. A full-run attribution harness (module scope). It drives the REAL {@link CommunityLayout}
 *     from construction to `settled` with the opt-in {@link CommunityLayoutProfiler} seam and the
 *     production 1 ms tick budget, then prints an absolute-ms + %-of-run breakdown per pass, the
 *     seed-tick / FA2-iteration counts, and the avg ms/FA2-iteration split (iterate vs the
 *     worker-side stats + settle + scale overhead). This is the authoritative source for the
 *     numbers in community-layout-cost.md.
 *
 *  2. Isolated `bench()` cross-checks (vitest's statistical runner) for the heaviest passes that
 *     reproduce faithfully from public building blocks: Louvain graph build, Louvain solve, and
 *     the sparse-stress seed to completion. FA2 `iterate` and writePositions are NOT re-benched in
 *     isolation (they need the layout's private matrices); the harness measures them in situ.
 *
 * The profiler adds only a branch per timing site when absent, so production is byte-for-byte
 * unchanged; it is supplied here purely to attribute wall-clock.
 *
 * Run (from apps/hash-frontend):
 *   node_modules/.bin/vitest bench --run \
 *     src/pages/shared/graph-visualizer-2/worker/layout/community-layout-cost.bench.ts
 */
import { UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { parkMillerRng } from "../../math/random";
import { buildForceGraph } from "../bench-fixtures";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createCommunityLayout } from "./community-layout";
import { SparseStressSeeder } from "./sparse-stress-seed";

import type { GraphShape } from "../bench-fixtures";
import type {
  CommunityLayoutPass,
  CommunityLayoutProfiler,
} from "./community-layout";
import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";

/** Representative deterministic sizes: ~300 / ~1.5k / ~5k nodes at a realistic (~2.6 edges/node)
 * hub-skewed density. `profiledRuns` are averaged for the breakdown; the layout is deterministic
 * so iteration COUNTS are identical run-to-run and only timing noise is averaged out. */
interface CostCase {
  readonly shape: GraphShape;
  readonly profiledRuns: number;
  readonly wallRuns: number;
}

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

const COST_CASES: readonly CostCase[] = [
  { shape: shape(300, 780, 301), profiledRuns: 6, wallRuns: 3 },
  { shape: shape(1_500, 3_900, 302), profiledRuns: 4, wallRuns: 3 },
  { shape: shape(5_000, 13_000, 303), profiledRuns: 3, wallRuns: 2 },
];

/** Tight bracket around inferSettings' `barnesHutOptimize: order > 2000` switch: two near-equal
 * sizes, one just below (exact O(N^2) repulsion) and one just above (Barnes-Hut O(N log N)), to
 * isolate the per-iterate cost cliff at the threshold from the effect of N itself. */
const THRESHOLD_CASES: readonly CostCase[] = [
  { shape: shape(1_900, 4_940, 401), profiledRuns: 3, wallRuns: 1 },
  { shape: shape(2_100, 5_460, 402), profiledRuns: 3, wallRuns: 1 },
];

/** Display order (grouped by phase); passes with no calls are omitted from the printout. */
const PASS_ORDER: readonly CommunityLayoutPass[] = [
  "louvainBuild",
  "louvainSolve",
  "resolveEdges",
  "matrixRebuild",
  "seedSetup",
  "seedSgd",
  "fa2Iterate",
  "fa2Stats",
  "fa2Settle",
  "fa2Scale",
  "writePositions",
];

const FA2_OVERHEAD_PASSES: readonly CommunityLayoutPass[] = [
  "fa2Stats",
  "fa2Settle",
  "fa2Scale",
];

/** Seed options mirroring CommunityLayout.#buildSeed exactly, so the isolated seed bench measures
 * the same work the layout does. */
const SEED_OPTIONS = {
  idealEdgeLength: 40,
  randomSeed: 1,
  jitter: 0.01,
  packComponents: true,
  returnPivotDistances: false,
} as const;

/** Fresh node objects per run: the solver mutates node x/y in place, so a shared array would let
 * a run warm-start from the previous run's settled positions. */
function cloneNodes(nodes: readonly ForceNode[]): ForceNode[] {
  return nodes.map((node) => ({ ...node }));
}

/** Drive the phase machine to convergence with the worker scheduler's 1 ms budget, so
 * writePositions is attributed once per frame (its real cadence), not once per giant tick. */
function driveToSettled(layout: LayoutSimulation): void {
  let guard = 0;
  while (!layout.isSettled && guard < 10_000_000) {
    if (!layout.tick(1)) {
      break;
    }
    guard += 1;
  }
}

interface PassStat {
  readonly totalMs: number;
  readonly calls: number;
}

/** Mean per-pass ms + per-run call count over `runs` profiled cold runs, plus the mean profiled
 * wall-clock (which includes the profiler's own bookkeeping overhead). */
function attributePasses(
  caseShape: GraphShape,
  runs: number,
): {
  readonly perPass: Map<CommunityLayoutPass, PassStat>;
  readonly wallMs: number;
} {
  const { nodes, edges } = buildForceGraph(caseShape);
  const totals = new Map<
    CommunityLayoutPass,
    { totalMs: number; calls: number }
  >();
  let wallMs = 0;

  for (let run = 0; run < runs; run++) {
    const profiler: CommunityLayoutProfiler = {
      add(pass, elapsedMs) {
        const accumulated = totals.get(pass);
        if (accumulated) {
          accumulated.totalMs += elapsedMs;
          accumulated.calls += 1;
        } else {
          totals.set(pass, { totalMs: elapsedMs, calls: 1 });
        }
      },
    };
    const buffer = new FlatGraphBuffer(Math.max(1, nodes.length));
    const wallStart = performance.now();
    const layout = createCommunityLayout(
      cloneNodes(nodes),
      edges,
      buffer,
      undefined,
      profiler,
    );
    driveToSettled(layout);
    wallMs += performance.now() - wallStart;
  }

  const perPass = new Map<CommunityLayoutPass, PassStat>();
  for (const [pass, accumulated] of totals) {
    perPass.set(pass, {
      totalMs: accumulated.totalMs / runs,
      calls: accumulated.calls / runs,
    });
  }
  return { perPass, wallMs: wallMs / runs };
}

/** Least-noisy (minimum) unprofiled construct-to-settled wall-clock: the real production total. */
function productionWallMs(caseShape: GraphShape, runs: number): number {
  const { nodes, edges } = buildForceGraph(caseShape);
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run++) {
    const buffer = new FlatGraphBuffer(Math.max(1, nodes.length));
    const start = performance.now();
    const layout = createCommunityLayout(cloneNodes(nodes), edges, buffer);
    driveToSettled(layout);
    const elapsed = performance.now() - start;
    if (elapsed < best) {
      best = elapsed;
    }
  }
  return best;
}

function pad(text: string, width: number, alignRight = true): string {
  return alignRight ? text.padStart(width) : text.padEnd(width);
}

/** Build the full per-case report as one string (printed in a single console.log so vitest keeps
 * each case's table contiguous rather than interleaving lines by call site). */
function attributionReport(costCase: CostCase): string {
  const { shape: caseShape, profiledRuns, wallRuns } = costCase;
  const { nodes, edges } = buildForceGraph(caseShape);
  const { perPass, wallMs } = attributePasses(caseShape, profiledRuns);
  const wall = productionWallMs(caseShape, wallRuns);

  let sumMs = 0;
  for (const stat of perPass.values()) {
    sumMs += stat.totalMs;
  }

  const columns = [22, 9, 12, 11, 8];
  const lines: string[] = [];
  const row = (cells: readonly string[]): string =>
    [
      pad(cells[0]!, columns[0]!, false),
      pad(cells[1]!, columns[1]!),
      pad(cells[2]!, columns[2]!),
      pad(cells[3]!, columns[3]!),
      pad(cells[4]!, columns[4]!),
    ].join("  ");

  const header = row(["pass", "calls", "total ms", "ms/call", "% run"]);
  lines.push(
    `\n=== community-force cost attribution: ${nodes.length} nodes / ${edges.length} edges ` +
      `(barnesHut ${caseShape.nodeCount > 2000 ? "ON" : "OFF"}, mean of ${profiledRuns} profiled runs) ===`,
  );
  lines.push(header);
  lines.push("-".repeat(header.length));

  for (const pass of PASS_ORDER) {
    const stat = perPass.get(pass);
    if (!stat || stat.calls === 0) {
      continue;
    }
    const perCall = stat.totalMs / stat.calls;
    const percent = sumMs > 0 ? (stat.totalMs / sumMs) * 100 : 0;
    lines.push(
      row([
        pass,
        stat.calls.toFixed(stat.calls < 100 ? 1 : 0),
        stat.totalMs.toFixed(2),
        perCall.toFixed(4),
        `${percent.toFixed(1)}%`,
      ]),
    );
  }

  lines.push("-".repeat(header.length));
  lines.push(row(["sum of passes", "", sumMs.toFixed(2), "", "100.0%"]));

  const seedTicks =
    (perPass.get("seedSetup")?.calls ?? 0) +
    (perPass.get("seedSgd")?.calls ?? 0);
  const fa2Iters = perPass.get("fa2Iterate")?.calls ?? 0;
  const fa2IterateMs = perPass.get("fa2Iterate")?.totalMs ?? 0;
  let fa2OverheadMs = 0;
  for (const pass of FA2_OVERHEAD_PASSES) {
    fa2OverheadMs += perPass.get(pass)?.totalMs ?? 0;
  }
  const perIterate = fa2Iters > 0 ? fa2IterateMs / fa2Iters : 0;
  const perOverhead = fa2Iters > 0 ? fa2OverheadMs / fa2Iters : 0;

  lines.push(
    `production wall (unprofiled, min of ${wallRuns}): ${wall.toFixed(2)} ms  |  ` +
      `profiled wall: ${wallMs.toFixed(2)} ms  |  unattributed (loop/handoff/profiler): ` +
      `${(wallMs - sumMs).toFixed(2)} ms`,
  );
  lines.push(
    `seed ticks: ${seedTicks.toFixed(0)}  |  FA2 iterations: ${fa2Iters.toFixed(0)}  |  ` +
      `writePositions calls: ${(perPass.get("writePositions")?.calls ?? 0).toFixed(0)}`,
  );
  lines.push(
    `avg ms / FA2 iteration: iterate ${perIterate.toFixed(4)} + overhead ` +
      `${perOverhead.toFixed(4)} = ${(perIterate + perOverhead).toFixed(4)}`,
  );

  return lines.join("\n");
}

for (const costCase of [...COST_CASES, ...THRESHOLD_CASES]) {
  console.log(attributionReport(costCase));
}

/** Louvain graph build, mirroring CommunityLayout.#runLouvain (addNode per node, mergeEdge per
 * resolved edge). Fixture edges are already unique index pairs, so mergeEdge count matches. */
function buildLouvainGraph(
  nodes: readonly ForceNode[],
  edges: readonly ForceEdge[],
): UndirectedGraph<Record<string, never>, { weight: number }> {
  const graph = new UndirectedGraph<
    Record<string, never>,
    { weight: number }
  >();
  for (const node of nodes) {
    graph.addNode(node.id);
  }
  for (const edge of edges) {
    const source =
      typeof edge.source === "string" ? edge.source : edge.source.id;
    const target =
      typeof edge.target === "string" ? edge.target : edge.target.id;
    graph.mergeEdge(source, target, { weight: edge.weight });
  }
  return graph;
}

/** Index-based src/dst arrays for the seeder, matching CommunityLayout.#buildSeed's inputs. */
function seedEdgeArrays(
  nodes: readonly ForceNode[],
  edges: readonly ForceEdge[],
): { readonly src: Uint32Array; readonly dst: Uint32Array } {
  const idToIndex = new Map<string, number>();
  for (const [index, node] of nodes.entries()) {
    idToIndex.set(node.id, index);
  }
  const src = new Uint32Array(edges.length);
  const dst = new Uint32Array(edges.length);
  let count = 0;
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
    src[count] = source;
    dst[count] = target;
    count += 1;
  }
  return { src: src.slice(0, count), dst: dst.slice(0, count) };
}

/** Fixed-count runs: settling/seeding are too slow for vitest's default time budget. */
const BENCH_OPTIONS = {
  time: 0,
  iterations: 8,
  warmupTime: 0,
  warmupIterations: 2,
} as const;

for (const { shape: caseShape } of COST_CASES) {
  describe(`community-layout passes (${caseShape.nodeCount} nodes)`, () => {
    const { nodes, edges } = buildForceGraph(caseShape);
    const { src, dst } = seedEdgeArrays(nodes, edges);
    const prebuiltGraph = buildLouvainGraph(nodes, edges);

    bench(
      "louvain: build graph",
      () => {
        buildLouvainGraph(nodes, edges);
      },
      BENCH_OPTIONS,
    );

    bench(
      "louvain: solve",
      () => {
        louvain(prebuiltGraph, {
          getEdgeWeight: "weight",
          randomWalk: false,
          rng: parkMillerRng(1),
        });
      },
      BENCH_OPTIONS,
    );

    bench(
      "seed: run to completion",
      () => {
        const seedX = new Float32Array(nodes.length);
        const seedY = new Float32Array(nodes.length);
        new SparseStressSeeder(
          { n: nodes.length, src, dst, x: seedX, y: seedY },
          SEED_OPTIONS,
        ).run();
      },
      BENCH_OPTIONS,
    );
  });
}
