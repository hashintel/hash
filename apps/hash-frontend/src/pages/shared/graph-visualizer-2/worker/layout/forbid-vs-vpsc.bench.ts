/* eslint-disable no-console -- committed A/B harness whose whole purpose is to PRINT a
   FA2-vs-VPSC-vs-FORBID comparison on the production-realistic coincident-hub fixture. */
/**
 * The A/B that motivated the pivot away from VPSC. On the production-realistic fixture
 * (a large cloud PLUS one super-hub of 150 near-coincident leaves — the shape that froze
 * the worker), it drives three overlap-removal strategies at the worker's 1 ms tick
 * cadence and prints, per size:
 *
 *   - engine        : FA2 (no overlap guarantee) / stress+VPSC (old) / stress+FORBID (new)
 *   - wallMs        : construct → overlap-free wall time
 *   - maxTickMs     : the LARGEST single synchronous tick — the frozen-frame metric. The
 *                     old terminal VPSC projection is ONE unbounded call, so its maxTick is
 *                     the whole projection; FORBID chunks across ticks so its maxTick is one
 *                     bounded SGD epoch batch.
 *   - overlaps      : strict disk overlaps in the final layout (must be 0 for VPSC/FORBID)
 *   - edgeStress    : RMS deviation of edge length from ideal (lower = better fidelity)
 *
 * The stress+VPSC row runs the SAME sparse-stress phase as stress+FORBID (identical solver
 * config), then a single `VpscOverlapRemover.removeOverlaps` call, reproducing the old
 * synchronous mega-call. `overlap-removal.ts` is kept solely for this comparison.
 *
 * Run (from apps/hash-frontend):
 *   node_modules/.bin/vitest bench --run \
 *     src/pages/shared/graph-visualizer-2/worker/layout/forbid-vs-vpsc.bench.ts
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { buildForceGraphWithCoincidentHub } from "../bench-fixtures";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createCommunityLayout } from "./community-layout";
import { ForbidOverlapSolver } from "./forbid";
import { countOverlaps } from "./overlap-relax";
import { VpscOverlapRemover } from "./overlap-removal";
import { SparseStressSolver } from "./sparse-stress-solver";
import { createStressLayout } from "./stress-layout";

import type { GraphShape } from "../bench-fixtures";
import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";

/** Mirror of the stress engine's private layout constants (kept in sync with stress-layout.ts). */
const IDEAL = 60;
const OVERLAP_PADDING = 8;
const OVERLAP_WEIGHT = 4;
const SEED_JITTER = 0.01;
const STRESS_TICK_WORK = 16_384;
const STRESS_MAX_EPOCHS = 60;
const STRESS_MIN_EPOCHS = 8;
const CONVERGENCE_EPSILON = 3e-3;

/** Production worker cadence: one simulation step per animation frame gets ~1 ms. */
const TICK_BUDGET_MS = 1;
const HUB_LEAVES = 150;

/** Cloud + coincident-hub fixtures at the three sizes the freeze was reported around. */
const AB_SIZES = [1_000, 3_000, 5_000] as const;

function hubShape(cloudCount: number): GraphShape {
  return {
    nodeCount: cloudCount,
    linkCount: Math.round(cloudCount * 2.6),
    typeCount: 1,
    hubCount: Math.max(4, Math.round(cloudCount / 40)),
    rootFraction: 1,
    seed: 7_000 + cloudCount,
  };
}

function cloneNodes(nodes: readonly ForceNode[]): ForceNode[] {
  return nodes.map((node) => ({ ...node }));
}

/** RMS deviation of edge length from the ideal hop length (lower ⇒ better distance fidelity). */
function edgeStressOf(
  nodes: readonly ForceNode[],
  edges: readonly ForceEdge[],
): number {
  const idToIndex = new Map<string, number>();
  for (const [index, node] of nodes.entries()) {
    idToIndex.set(node.id, index);
  }
  let sumSq = 0;
  let counted = 0;
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
    const sourceNode = nodes[source]!;
    const targetNode = nodes[target]!;
    const length = Math.hypot(
      (targetNode.x ?? 0) - (sourceNode.x ?? 0),
      (targetNode.y ?? 0) - (sourceNode.y ?? 0),
    );
    const ratio = length / IDEAL - 1;
    sumSq += ratio * ratio;
    counted += 1;
  }
  return counted > 0 ? Math.sqrt(sumSq / counted) : 0;
}

function overlapsOf(nodes: readonly ForceNode[]): number {
  const count = nodes.length;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const radii = new Float32Array(count);
  for (const [index, node] of nodes.entries()) {
    x[index] = node.x ?? 0;
    y[index] = node.y ?? 0;
    radii[index] = node.radius;
  }
  return countOverlaps({ x, y, radii, count, padding: 0 });
}

interface Measurement {
  readonly wallMs: number;
  readonly maxTickMs: number;
  readonly overlaps: number;
  readonly edgeStress: number;
}

/** Drive a whole engine to `settled` at the 1 ms cadence, timing each tick. */
function driveEngine(
  make: (
    nodes: ForceNode[],
    edges: ForceEdge[],
    buffer: FlatGraphBuffer,
  ) => LayoutSimulation,
  nodes: readonly ForceNode[],
  edges: ForceEdge[],
): Measurement {
  const runNodes = cloneNodes(nodes);
  const buffer = new FlatGraphBuffer(Math.max(1, runNodes.length));
  let maxTickMs = 0;
  let wallMs = 0;
  const layout = make(runNodes, edges, buffer);
  for (let step = 0; step < 500_000 && !layout.isSettled; step++) {
    const start = performance.now();
    const moved = layout.tick(TICK_BUDGET_MS);
    const tickMs = performance.now() - start;
    wallMs += tickMs;
    maxTickMs = Math.max(maxTickMs, tickMs);
    if (!moved) {
      break;
    }
  }
  return {
    wallMs,
    maxTickMs,
    overlaps: overlapsOf(layout.nodes),
    edgeStress: edgeStressOf(layout.nodes, edges),
  };
}

/** Build the stress SGD solver over the fixture with the engine's production knobs. */
function buildStressSolver(
  nodes: readonly ForceNode[],
  edges: readonly ForceEdge[],
  x: Float32Array,
  y: Float32Array,
  radii: Float32Array,
): SparseStressSolver {
  const idToIndex = new Map<string, number>();
  for (const [index, node] of nodes.entries()) {
    idToIndex.set(node.id, index);
  }
  const src: number[] = [];
  const dst: number[] = [];
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
    src.push(source);
    dst.push(target);
  }
  return new SparseStressSolver(
    {
      n: nodes.length,
      src: Uint32Array.from(src),
      dst: Uint32Array.from(dst),
      x,
      y,
      radii,
    },
    {
      idealEdgeLength: IDEAL,
      randomSeed: 1,
      jitter: SEED_JITTER,
      maxEpochs: STRESS_MAX_EPOCHS,
      minEpochs: STRESS_MIN_EPOCHS,
      convergenceEpsilon: CONVERGENCE_EPSILON,
      overlapPadding: OVERLAP_PADDING,
      overlapWeight: OVERLAP_WEIGHT,
      keepInitialPositions: false,
      packComponents: true,
      returnPivotDistances: false,
    },
  );
}

/** Run the chunked stress phase (timing each tick), returning the settled coordinates. */
function runStressPhase(
  nodes: readonly ForceNode[],
  edges: readonly ForceEdge[],
): {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radii: Float32Array;
  readonly maxTickMs: number;
  readonly wallMs: number;
} {
  const count = nodes.length;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const radii = new Float32Array(count);
  for (const [index, node] of nodes.entries()) {
    x[index] = node.x ?? 0;
    y[index] = node.y ?? 0;
    radii[index] = node.radius;
  }
  const solver = buildStressSolver(nodes, edges, x, y, radii);
  let maxTickMs = 0;
  let wallMs = 0;
  let done = false;
  while (!done) {
    const start = performance.now();
    const result = solver.tick({ maxWork: STRESS_TICK_WORK });
    const tickMs = performance.now() - start;
    wallMs += tickMs;
    maxTickMs = Math.max(maxTickMs, tickMs);
    done = result.done;
  }
  return { x, y, radii, maxTickMs, wallMs };
}

/** OLD path: stress phase (chunked) then a single synchronous VPSC projection. */
function measureStressVpsc(
  nodes: readonly ForceNode[],
  edges: ForceEdge[],
): Measurement {
  const count = nodes.length;
  const stress = runStressPhase(nodes, edges);
  const x = Float32Array.from(stress.x);
  const y = Float32Array.from(stress.y);
  const halfW = new Float32Array(count);
  const halfH = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const half = stress.radii[index]! + OVERLAP_PADDING / 2;
    halfW[index] = half;
    halfH[index] = half;
  }

  const remover = new VpscOverlapRemover(count);
  const start = performance.now();
  remover.removeOverlaps(x, y, halfW, halfH, count);
  const vpscCallMs = performance.now() - start;

  const settled = cloneNodes(nodes);
  for (let index = 0; index < count; index++) {
    settled[index]!.x = x[index]!;
    settled[index]!.y = y[index]!;
  }
  return {
    wallMs: stress.wallMs + vpscCallMs,
    maxTickMs: Math.max(stress.maxTickMs, vpscCallMs),
    overlaps: overlapsOf(settled),
    edgeStress: edgeStressOf(settled, edges),
  };
}

/** NEW path: stress phase (chunked) then FORBID chunked across 1 ms ticks. */
function measureStressForbid(
  nodes: readonly ForceNode[],
  edges: ForceEdge[],
): Measurement {
  const count = nodes.length;
  const stress = runStressPhase(nodes, edges);
  const x = Float32Array.from(stress.x);
  const y = Float32Array.from(stress.y);

  const forbid = new ForbidOverlapSolver(count);
  forbid.reset(x, y, stress.radii, count, { margin: OVERLAP_PADDING, seed: 1 });
  let maxTickMs = stress.maxTickMs;
  let wallMs = stress.wallMs;
  while (!forbid.done) {
    const start = performance.now();
    // Batch epochs into one ~1 ms tick (mirrors the worker looping advance() per tick).
    let stepped = forbid.step();
    while (!stepped.done && performance.now() - start < TICK_BUDGET_MS) {
      stepped = forbid.step();
    }
    const tickMs = performance.now() - start;
    wallMs += tickMs;
    maxTickMs = Math.max(maxTickMs, tickMs);
  }

  const settled = cloneNodes(nodes);
  for (let index = 0; index < count; index++) {
    settled[index]!.x = x[index]!;
    settled[index]!.y = y[index]!;
  }
  return {
    wallMs,
    maxTickMs,
    overlaps: overlapsOf(settled),
    edgeStress: edgeStressOf(settled, edges),
  };
}

function pad(text: string, width: number): string {
  return text.padStart(width);
}

function abReport(cloudCount: number): string {
  const { nodes, edges } = buildForceGraphWithCoincidentHub(
    hubShape(cloudCount),
    HUB_LEAVES,
  );
  const rows: { readonly name: string; readonly m: Measurement }[] = [
    {
      name: "FA2",
      m: driveEngine(
        (runNodes, runEdges, buffer) =>
          createCommunityLayout(runNodes, runEdges, buffer),
        nodes,
        edges,
      ),
    },
    { name: "stress+VPSC", m: measureStressVpsc(nodes, edges) },
    { name: "stress+FORBID", m: measureStressForbid(nodes, edges) },
  ];

  const columns = [14, 12, 12, 10, 12];
  const line = (cells: readonly string[]): string =>
    cells.map((cell, index) => pad(cell, columns[index]!)).join("  ");
  const lines: string[] = [];
  lines.push(
    `\n=== FA2 vs VPSC vs FORBID: ${nodes.length} nodes / ${edges.length} edges ` +
      `(cloud ${cloudCount} + ${HUB_LEAVES}-leaf coincident hub) ===`,
  );
  const header = line([
    "engine",
    "wallMs",
    "maxTickMs",
    "overlaps",
    "edgeStress",
  ]);
  lines.push(header);
  lines.push("-".repeat(header.length));
  for (const { name, m } of rows) {
    lines.push(
      line([
        name,
        m.wallMs.toFixed(1),
        m.maxTickMs.toFixed(2),
        String(m.overlaps),
        m.edgeStress.toFixed(4),
      ]),
    );
  }
  return lines.join("\n");
}

for (const cloudCount of AB_SIZES) {
  console.log(abReport(cloudCount));
}

/** Timing cross-check: whole stress+FORBID engine to overlap-free at the two smaller sizes. */
const BENCH_OPTIONS = {
  time: 0,
  iterations: 2,
  warmupTime: 0,
  warmupIterations: 0,
} as const;

for (const cloudCount of AB_SIZES.slice(0, 2)) {
  describe(`stress+FORBID to overlap-free (${cloudCount} + hub)`, () => {
    const { nodes, edges } = buildForceGraphWithCoincidentHub(
      hubShape(cloudCount),
      HUB_LEAVES,
    );
    bench(
      "stress+FORBID",
      () => {
        driveEngine(
          (runNodes, runEdges, buffer) =>
            createStressLayout(runNodes, runEdges, buffer),
          nodes,
          edges,
        );
      },
      BENCH_OPTIONS,
    );
  });
}
