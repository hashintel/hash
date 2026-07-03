/* eslint-disable no-console -- committed metrics harness whose whole purpose is to PRINT
   the majorization engine's scalability profile table. */
/**
 * Scalability profile for the community-tier stress-majorization engine on
 * large graphs (20k real capture, 100k / 200k synthetic scale-ups).
 *
 * Unlike {@link "./majorization-baseline.bench"} (quality metrics on small
 * fixtures), this harness answers two questions about big graphs:
 *
 * 1. Wall time to settled at the production 1 ms tick cadence, and
 * 2. Tick-time distribution (p50/p95/p99/max, frame-budget violations), i.e.
 *    whether any single tick would freeze the worker long enough to be felt.
 *
 * Fixtures:
 * - `real-20k`: a captured production layout graph
 *   (fixtures/graph-fixture-20000n-22379e.json), replayed cold (scrambled
 *   seed positions) — one ~15k giant component whose edge set is dominated
 *   by four ~3.8k-degree mega-hubs, ~4.1k singleton nodes, a tail of tiny
 *   fragments.
 * - `synthetic-100k` / `synthetic-200k`: the same structural fingerprint
 *   scaled up (see {@link buildScaledFixture}): 75 % of nodes in one giant
 *   component, four mega-hubs wired to ~19 % of nodes each, tree-ish
 *   background at median degree 2, ~21 % singletons, ~4 % tiny fragments.
 *
 * Run (from apps/hash-frontend):
 *   node_modules/.bin/vitest bench --run \
 *     src/pages/shared/graph-visualizer/worker/layout/majorization-scale.bench.ts
 *
 * Env knobs:
 *   MAJORIZATION_SCALE_SIZES  comma list from {20k,100k,200k} (default all)
 *   MAJORIZATION_SCALE_BUDGET wall budget per fixture in seconds (default 900)
 */
import { readFileSync } from "node:fs";

// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { mulberry32 } from "../../math/random";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createMajorizationLayout } from "./majorization-layout";
import { countOverlaps } from "./overlap-relax";

import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";

/** Radius model of the captured fixture: leaves ~4-5.5 px, mega-hubs ~15.7 px. */
const radiusForDegree = (degree: number): number =>
  4 + Math.min(12, Math.sqrt(Math.max(0, degree)) * 0.19);

interface ScaleFixture {
  readonly name: string;
  readonly nodes: ForceNode[];
  readonly edges: ForceEdge[];
}

interface CapturedFixtureJson {
  readonly nodes: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
  }[];
  readonly edges: readonly {
    readonly source: string;
    readonly target: string;
    readonly weight: number;
  }[];
}

/**
 * Cold replay of the captured 20k graph: keep ids/radii/topology, re-seed
 * positions with a deterministic phyllotaxis scatter (the captured positions
 * are a settled layout; replaying them warm would skip the interesting work).
 */
function loadReal20k(): ScaleFixture {
  const raw = readFileSync(
    new URL("./fixtures/graph-fixture-20000n-22379e.json", import.meta.url),
    "utf8",
  );
  const fixture = JSON.parse(raw) as CapturedFixtureJson;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const random = mulberry32(20_000);
  const nodes: ForceNode[] = fixture.nodes.map((node, index) => {
    const distance = 20 * Math.sqrt(index + 1);
    const angle = index * goldenAngle + random() * Math.PI * 2;
    return {
      id: node.id,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      radius: node.radius,
    };
  });
  return {
    name: "real-20k",
    nodes,
    edges: fixture.edges.map((edge) => ({ ...edge })),
  };
}

/**
 * Synthesizes an n-node graph with the captured fixture's structural
 * fingerprint (measured on graph-fixture-20000n-22379e.json):
 *
 * - one giant component holding 75 % of nodes,
 * - four mega-hubs, each wired to ~19 % of ALL nodes (⇒ ~15.2k of the 22.4k
 *   edges at 20k are hub spokes; hubs share endpoints),
 * - a spanning tree over the giant component's non-hub nodes at median
 *   degree 2 (chain-biased random tree),
 * - ~21 % singleton nodes (isolated dust),
 * - remaining ~4 % in fragments of 2-5 nodes,
 * - total edges ≈ 1.12·n.
 */
function buildScaledFixture(name: string, nodeCount: number): ScaleFixture {
  const random = mulberry32(nodeCount);
  const giantCount = Math.round(nodeCount * 0.75);
  const hubCount = 4;
  const hubDegree = Math.round(nodeCount * 0.19);

  const edgePairs: [number, number][] = [];

  // Chain-biased random tree over the giant component (nodes [0, giantCount)):
  // parent is a recent node 70% of the time (chains), uniform otherwise
  // (bushy). Hubs are nodes [0, hubCount).
  for (let node = hubCount; node < giantCount; node++) {
    const recentSpan = Math.min(node, 32);
    const parent =
      random() < 0.7
        ? node - 1 - Math.floor(random() * recentSpan)
        : Math.floor(random() * node);
    edgePairs.push([Math.min(parent, node), Math.max(parent, node)]);
  }

  // Mega-hub spokes: each hub picks hubDegree distinct giant-component
  // targets. Duplicate (hub, target) pairs are skipped, matching the
  // captured graph's deduped edge list.
  const seen = new Set<number>();
  for (const [sourceIndex, targetIndex] of edgePairs) {
    seen.add(sourceIndex * nodeCount + targetIndex);
  }
  for (let hub = 0; hub < hubCount; hub++) {
    let added = 0;
    while (added < hubDegree) {
      const target = hubCount + Math.floor(random() * (giantCount - hubCount));
      const lo = Math.min(hub, target);
      const hi = Math.max(hub, target);
      const key = lo * nodeCount + hi;
      if (seen.has(key)) {
        // Collisions are rare (hubDegree ≪ giantCount); resample.
        added += 1;
        continue;
      }
      seen.add(key);
      edgePairs.push([lo, hi]);
      added += 1;
    }
  }

  // Tiny fragments: pair/triple chains over [giantCount, fragmentEnd).
  const fragmentCount = Math.round(nodeCount * 0.04);
  const fragmentEnd = giantCount + fragmentCount;
  let cursor = giantCount;
  while (cursor < fragmentEnd - 1) {
    const size = Math.min(2 + Math.floor(random() * 4), fragmentEnd - cursor);
    for (let link = 1; link < size; link++) {
      edgePairs.push([cursor + link - 1, cursor + link]);
    }
    cursor += size;
  }
  // Nodes [fragmentEnd, nodeCount) stay isolated (the singleton dust).

  const degree = new Uint32Array(nodeCount);
  for (const [sourceIndex, targetIndex] of edgePairs) {
    degree[sourceIndex]! += 1;
    degree[targetIndex]! += 1;
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const nodes: ForceNode[] = [];
  for (let node = 0; node < nodeCount; node++) {
    const distance = 20 * Math.sqrt(node + 1);
    const angle = node * goldenAngle;
    nodes.push({
      id: String(node),
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      radius: radiusForDegree(degree[node]!),
    });
  }
  const edges: ForceEdge[] = edgePairs.map(([sourceIndex, targetIndex]) => ({
    source: String(sourceIndex),
    target: String(targetIndex),
    weight: 1,
  }));
  return { name, nodes, edges };
}

interface ProfileResult {
  readonly constructMs: number;
  readonly wallMs: number;
  readonly ticks: number;
  readonly settled: boolean;
  readonly tickP50: number;
  readonly tickP95: number;
  readonly tickP99: number;
  readonly tickMax: number;
  readonly ticksOver16: number;
  readonly ticksOver50: number;
  readonly ticksOver100: number;
  readonly overlaps: number;
}

function percentile(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * quantile),
  );
  return sorted[index]!;
}

function printDiagnostics(
  fixture: ScaleFixture,
  layout: LayoutSimulation,
  result: ProfileResult,
): void {
  const diag = layout as unknown as {
    iterations?: number;
    capped?: boolean;
    settleCapped?: boolean;
    edgeCount?: number;
    solverDiagnostics?: {
      phaseCumulativeMs: Partial<Record<string, number>>;
      phaseMaxMs: Partial<Record<string, number>>;
      projectionMs: number;
      maxProjectionMs: number;
      projectionRuns: number;
      termCount: number;
    } | null;
  };

  console.log(
    `\n=== scale ${fixture.name}: ${fixture.nodes.length} nodes / ` +
      `${fixture.edges.length} edges ===`,
  );
  console.log(
    `constructMs=${result.constructMs.toFixed(0)} ` +
      `wallMs=${result.wallMs.toFixed(0)} ticks=${result.ticks} ` +
      `settled=${result.settled} iterations=${diag.iterations} ` +
      `capped=${diag.capped}/${diag.settleCapped} overlaps=${result.overlaps}`,
  );
  console.log(
    `tickMs p50=${result.tickP50.toFixed(2)} p95=${result.tickP95.toFixed(2)} ` +
      `p99=${result.tickP99.toFixed(2)} max=${result.tickMax.toFixed(1)} | ` +
      `>16ms: ${result.ticksOver16}, >50ms: ${result.ticksOver50}, ` +
      `>100ms: ${result.ticksOver100}`,
  );

  const solver = diag.solverDiagnostics;
  if (solver) {
    const phases = Object.entries(solver.phaseCumulativeMs)
      .map(
        ([phase, ms]) =>
          `${phase}=${(ms ?? 0).toFixed(0)}/${(
            solver.phaseMaxMs[phase] ?? 0
          ).toFixed(1)}`,
      )
      .join(" ");
    console.log(`phase cum/maxMs: ${phases}`);
    console.log(
      `terms=${solver.termCount} projection cum=${solver.projectionMs.toFixed(0)}ms ` +
        `max=${solver.maxProjectionMs.toFixed(1)}ms runs=${solver.projectionRuns}`,
    );
  }
}

function profileFixture(
  fixture: ScaleFixture,
  wallBudgetMs: number,
): ProfileResult {
  const constructStart = performance.now();
  const layout = createMajorizationLayout(
    fixture.nodes,
    fixture.edges,
    new FlatGraphBuffer(fixture.nodes.length),
  );
  const constructMs = performance.now() - constructStart;

  const tickMs: number[] = [];
  const wallStart = performance.now();
  // tick() returns publish-happened (not liveness), so the loop is keyed on
  // isSettled alone; the wall budget is the runaway guard.
  while (!layout.isSettled && performance.now() - wallStart < wallBudgetMs) {
    const start = performance.now();
    layout.tick(1);
    tickMs.push(performance.now() - start);
  }
  const wallMs = performance.now() - wallStart;

  const count = fixture.nodes.length;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const radii = new Float32Array(count);
  for (const [index, node] of layout.nodes.entries()) {
    x[index] = node.x ?? 0;
    y[index] = node.y ?? 0;
    radii[index] = node.radius;
  }

  const sorted = [...tickMs].sort((a, b) => a - b);
  const result: ProfileResult = {
    constructMs,
    wallMs,
    ticks: tickMs.length,
    settled: layout.isSettled,
    tickP50: percentile(sorted, 0.5),
    tickP95: percentile(sorted, 0.95),
    tickP99: percentile(sorted, 0.99),
    tickMax: sorted.length > 0 ? sorted[sorted.length - 1]! : 0,
    ticksOver16: tickMs.filter((ms) => ms > 16).length,
    ticksOver50: tickMs.filter((ms) => ms > 50).length,
    ticksOver100: tickMs.filter((ms) => ms > 100).length,
    overlaps: countOverlaps({ x, y, radii, count, padding: 0 }),
  };

  printDiagnostics(fixture, layout, result);
  return result;
}

const requestedSizes = (process.env.MAJORIZATION_SCALE_SIZES ?? "20k,100k,200k")
  .split(",")
  .map((size) => size.trim());
const wallBudgetMs =
  Number(process.env.MAJORIZATION_SCALE_BUDGET ?? 900) * 1000;

const fixtures: ScaleFixture[] = [];
if (requestedSizes.includes("20k")) {
  fixtures.push(loadReal20k());
}
if (requestedSizes.includes("100k")) {
  fixtures.push(buildScaledFixture("synthetic-100k", 100_000));
}
if (requestedSizes.includes("200k")) {
  fixtures.push(buildScaledFixture("synthetic-200k", 200_000));
}

for (const fixture of fixtures) {
  profileFixture(fixture, wallBudgetMs);
}

/** Statistical cross-check on the smallest requested fixture only. */
describe("majorization scale (smoke)", () => {
  bench(
    "noop (profiles run at module scope)",
    () => {
      /* The profile table above is the deliverable. */
    },
    { time: 0, iterations: 1, warmupTime: 0, warmupIterations: 0 },
  );
});
