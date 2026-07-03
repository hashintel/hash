/* eslint-disable no-console -- committed diagnostic harness: prints the
   post-absorb responsiveness timeline for streaming-hub regression hunts. */
/**
 * Streaming responsiveness of the majorization engine: how long after a warm
 * `absorb()` does the layout visibly REACT? Reproduces the reported "a hub
 * that forms after the fact has no pull" feel on the captured 20k fixture:
 *
 *   1. settle the fixture cold (the pre-stream state),
 *   2. absorb one newcomer wired to `HUB_FANOUT` random placed nodes (a hub
 *      forming after the fact, the worst case: every spoke term changes),
 *   3. tick at the app cadence and record when positions first publish, when
 *      the spokes' mean distance to the hub first drops by 25 % / 50 %, and
 *      when the layout re-settles.
 *
 * The absorb→first-pull window is the streaming feel: the engine re-runs
 * analysis (pivot BFS, term emission, Laplacian) before any majorization
 * iteration can act on the new spokes, and during that window the layout sits
 * still no matter how hard the hub "should" pull.
 *
 * Env knobs:
 *   MAJORIZATION_ABSORB_FANOUT  spokes on the late hub (default 200)
 *
 * Run (from apps/hash-frontend):
 *   node_modules/.bin/vitest bench --run \
 *     src/pages/shared/graph-visualizer/worker/layout/majorization-absorb.bench.ts \
 *     --disable-console-intercept
 */
import { readFileSync } from "node:fs";

// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { mulberry32 } from "../../math/random";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createMajorizationLayout } from "./majorization-layout";

import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";

const HUB_FANOUT = Number(process.env.MAJORIZATION_ABSORB_FANOUT ?? 200);
/** Per-tick solver budget (ms) mirroring the app's frame share. */
const TICK_BUDGET_MS = 8;
const SETTLE_WALL_CAP_MS = 300_000;

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

/** Same cold replay as the scale bench: keep topology/radii, scramble seeds. */
function loadFixture(): { nodes: ForceNode[]; edges: ForceEdge[] } {
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
  return { nodes, edges: fixture.edges.map((edge) => ({ ...edge })) };
}

function tickUntilSettled(
  layout: LayoutSimulation,
  label: string,
): { wallMs: number; ticks: number } {
  const start = performance.now();
  let ticks = 0;
  while (!layout.isSettled && performance.now() - start < SETTLE_WALL_CAP_MS) {
    layout.tick(TICK_BUDGET_MS);
    ticks += 1;
  }
  const wallMs = performance.now() - start;
  console.log(
    `${label}: wallMs=${wallMs.toFixed(0)} ticks=${ticks} ` +
      `settled=${layout.isSettled}`,
  );
  return { wallMs, ticks };
}

function run(): void {
  const { nodes, edges } = loadFixture();

  console.log(`\n=== majorization-absorb fanout=${HUB_FANOUT} ===`);
  const layout = createMajorizationLayout(
    nodes,
    edges,
    new FlatGraphBuffer(nodes.length),
  );
  tickUntilSettled(layout, "cold settle");

  // Spokes: deterministic sample of placed, connected nodes.
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.source as string);
    connected.add(edge.target as string);
  }
  const random = mulberry32(1234);
  const pool = nodes.filter((node) => connected.has(node.id));
  const spokes: ForceNode[] = [];
  const taken = new Set<number>();
  while (spokes.length < Math.min(HUB_FANOUT, pool.length)) {
    const pick = Math.floor(random() * pool.length);
    if (!taken.has(pick)) {
      taken.add(pick);
      spokes.push(pool[pick]!);
    }
  }

  // The hub seeds at the spokes' centroid (the flat tier seeds newcomers
  // beside placed neighbours; the centroid is that, idealised).
  let hubX = 0;
  let hubY = 0;
  for (const spoke of spokes) {
    hubX += spoke.x ?? 0;
    hubY += spoke.y ?? 0;
  }
  hubX /= spokes.length;
  hubY /= spokes.length;
  const hub: ForceNode = { id: "late-hub", x: hubX, y: hubY, radius: 12 };

  const spokeDistance = (): number => {
    let sum = 0;
    for (const spoke of spokes) {
      sum += Math.hypot(
        (spoke.x ?? 0) - (hub.x ?? 0),
        (spoke.y ?? 0) - (hub.y ?? 0),
      );
    }
    return sum / spokes.length;
  };

  const before = spokeDistance();
  const hubEdges: ForceEdge[] = spokes.map((spoke) => ({
    source: hub.id,
    target: spoke.id,
    weight: 1,
  }));
  layout.absorb?.([hub], [...edges, ...hubEdges]);

  // Post-absorb timeline at app cadence. While the hub solve runs, keep
  // feeding unrelated dust batches at the dev harness's streaming interval
  // (150 ms): the reported regression is pull DURING a stream, not after one
  // isolated absorb — every absorb restarts the solver, and when restart
  // latency exceeds the arrival interval no iteration ever runs.
  const allEdges: ForceEdge[] = [...edges, ...hubEdges];
  const start = performance.now();
  let ticks = 0;
  let firstPublishMs = -1;
  let pull25Ms = -1;
  let pull50Ms = -1;
  let nextBatchAt = 150;
  let batchesFed = 0;
  const timeline: [number, number][] = [];
  let nextSampleAt = 0;
  while (performance.now() - start < SETTLE_WALL_CAP_MS) {
    if (layout.isSettled && (pull50Ms >= 0 || batchesFed >= 40)) {
      break;
    }
    const published = layout.tick(TICK_BUDGET_MS);
    ticks += 1;
    const now = performance.now() - start;
    if (batchesFed < 40 && now >= nextBatchAt) {
      const batch: ForceNode[] = [];
      for (let index = 0; index < 50; index++) {
        batch.push({
          id: `stream-${batchesFed}-${index}`,
          x: 4000 + batchesFed * 10,
          y: 4000 + index * 10,
          radius: 6,
        });
      }
      layout.absorb?.(batch, allEdges);
      batchesFed += 1;
      nextBatchAt += 150;
    }
    if (published && firstPublishMs < 0) {
      firstPublishMs = now;
    }
    if (now >= nextSampleAt) {
      timeline.push([now, spokeDistance()]);
      nextSampleAt += 500;
    }
    if (published && (pull25Ms < 0 || pull50Ms < 0)) {
      const distance = spokeDistance();
      if (pull25Ms < 0 && distance < before * 0.75) {
        pull25Ms = now;
      }
      if (pull50Ms < 0 && distance < before * 0.5) {
        pull50Ms = now;
      }
    }
  }
  const wallMs = performance.now() - start;
  console.log(
    `absorb(+1 hub, +${spokes.length} spokes) under 150ms dust stream ` +
      `(${batchesFed} batches x50): spokeDist ${before.toFixed(0)} -> ` +
      `${spokeDistance().toFixed(0)}`,
  );
  console.log(
    `  firstPublishMs=${firstPublishMs.toFixed(0)} ` +
      `pull25Ms=${pull25Ms.toFixed(0)} pull50Ms=${pull50Ms.toFixed(0)} ` +
      `resettleMs=${wallMs.toFixed(0)} ticks=${ticks} ` +
      `settled=${layout.isSettled}`,
  );
  console.log(
    `  timeline(ms:dist): ${timeline
      .map(([atMs, dist]) => `${atMs.toFixed(0)}:${dist.toFixed(0)}`)
      .join(" ")}`,
  );
}

run();

describe("majorization absorb (smoke)", () => {
  bench(
    "noop (measures at module scope)",
    () => {
      /* The timeline above is the deliverable. */
    },
    { time: 0, iterations: 1, warmupTime: 0, warmupIterations: 0 },
  );
});
