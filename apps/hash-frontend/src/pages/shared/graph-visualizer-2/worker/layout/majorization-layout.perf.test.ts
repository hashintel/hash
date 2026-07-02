/**
 * Perf + motion gates for the constrained stress-MAJORIZATION engine, mirroring the
 * SGD engine's gates (stress-layout.perf.test.ts / stress-layout.monotonic.test.ts)
 * plus the PRIMARY real-shape gate from the relayout-motion brief:
 *
 *   1. Per-tick budget: at 1k/3k/5k (cloud + 150-leaf coincident hub), at default AND
 *      elevated shaping weights, no single 1 ms-budget tick blows past 100 ms, the
 *      layout settles, and the settled result is strictly overlap-free.
 *   2. PRIMARY: the real graph shape (~1000 nodes, TWO ~150-leaf near-coincident hubs
 *      + sparse background) reaches settled in ≤ 2 s wall time, overlap-free.
 *   3. No contract→expand: the RMS-spread trajectory shows no significant
 *      dip-below-final-then-rebound after its widest point (same terminal-rebound
 *      metric as the SGD engine's monotonicity gate).
 *   4. Region disjointness: on the real shape, majorization's region-overlap
 *      (fraction of nodes strictly inside a foreign community's packing disk —
 *      see region-metrics.ts) must beat the SGD engine's measured in the same run
 *      AND stay under an absolute ceiling far below the pre-fix baseline (0.32
 *      before the community-region floors; the folding artifact the user reported).
 */
import { describe, expect, it } from "vitest";

import {
  buildForceGraphWithCoincidentHub,
  buildRealShapeFixture,
} from "../bench-fixtures";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createMajorizationLayout } from "./majorization-layout";
import { countOverlaps } from "./overlap-relax";
import { measureRegionOverlap } from "./region-metrics";
import { createStressLayout } from "./stress-layout";

import type { GraphShape } from "../bench-fixtures";
import type { LayoutSimulation } from "./force-simulation";
import type { MajorizationLayoutOptions } from "./majorization-layout";

/** Largest single tick may not approach a dropped frame; the old VPSC call was ~6.5 s. */
const MAX_TICK_MS = 100;
/** PRIMARY gate: wall-to-settled budget for the real two-hub shape. */
const REAL_SHAPE_WALL_MS = 2_000;
/**
 * Region-overlap ceiling on the real shape at default weights. Pre-fix baseline was
 * 0.32 (a third of the graph sat inside foreign community disks); the community-region
 * floors bring it to ~0.03. The ceiling is set with slack for the small violations the
 * bridge-endpoint exemption legitimately allows, while still failing loudly if the
 * floors regress toward the folding regime.
 */
const REAL_SHAPE_REGION_OVERLAP_MAX = 0.08;
const HUB_LEAVES = 150;

/** Weight sets exercised on every fixture: gentle defaults and a clearly elevated set. */
const WEIGHT_CONFIGS: readonly {
  readonly label: string;
  readonly options: MajorizationLayoutOptions | undefined;
}[] = [
  { label: "default", options: undefined },
  {
    label: "elevated",
    options: {
      communityCohesion: 0.15,
      communitySeparation: 0.4,
      degreeRepulsion: 0.12,
    },
  },
];

function overlapCountOf(layout: LayoutSimulation): number {
  const count = layout.nodes.length;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const radii = new Float32Array(count);
  for (const [index, node] of layout.nodes.entries()) {
    x[index] = node.x ?? 0;
    y[index] = node.y ?? 0;
    radii[index] = node.radius;
  }
  return countOverlaps({ x, y, radii, count, padding: 0 });
}

/**
 * Region-overlap (disk containment) over the engine's OWN Louvain labels — the
 * partition the rendered community bubbles come from, i.e. what the user sees.
 */
function regionOverlapOf(layout: LayoutSimulation): number {
  const communities = (layout as unknown as { communities?: readonly number[] })
    .communities;
  return measureRegionOverlap(
    layout.nodes.map((node, index) => ({
      x: node.x ?? 0,
      y: node.y ?? 0,
      radius: node.radius,
      community: communities?.[index] ?? -1,
    })),
  ).diskContainment;
}

interface DriveResult {
  readonly ticks: number;
  readonly totalMs: number;
  readonly maxTickMs: number;
  /** RMS spread sampled after every tick (for the rebound metric). */
  readonly spreads: readonly number[];
}

/** RMS distance of the node positions from their centroid (the layout's "size"). */
function rmsSpread(layout: LayoutSimulation): number {
  const nodes = layout.nodes;
  const count = nodes.length;
  if (count === 0) {
    return 0;
  }
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

/** Drive at the production 1 ms cadence, recording per-tick cost and the spread trace. */
function drive(layout: LayoutSimulation): DriveResult {
  let maxTickMs = 0;
  let totalMs = 0;
  let ticks = 0;
  const spreads: number[] = [];
  for (let step = 0; step < 200_000 && !layout.isSettled; step++) {
    const start = performance.now();
    const moved = layout.tick(1);
    const tickMs = performance.now() - start;
    totalMs += tickMs;
    maxTickMs = Math.max(maxTickMs, tickMs);
    ticks += 1;
    spreads.push(rmsSpread(layout));
    if (!moved) {
      break;
    }
  }
  return { ticks, totalMs, maxTickMs, spreads };
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

const CLOUD_SIZES = [1_000, 3_000, 5_000] as const;

const GATE_CASES = CLOUD_SIZES.flatMap((cloudCount) =>
  WEIGHT_CONFIGS.map((config) => ({ cloudCount, config })),
);

describe("majorization layout — coincident-hub perf gate", () => {
  it.each(GATE_CASES)(
    "stays within the tick budget and ends overlap-free ($cloudCount-node cloud + coincident hub, $config.label weights)",
    ({ cloudCount, config }) => {
      const shape: GraphShape = {
        nodeCount: cloudCount,
        linkCount: Math.round(cloudCount * 2.6),
        typeCount: 1,
        hubCount: Math.max(4, Math.round(cloudCount / 40)),
        rootFraction: 1,
        seed: 4_000 + cloudCount,
      };
      const { nodes, edges } = buildForceGraphWithCoincidentHub(
        shape,
        HUB_LEAVES,
      );
      const layout = createMajorizationLayout(
        nodes,
        edges,
        new FlatGraphBuffer(nodes.length),
        config.options,
      );

      const result = drive(layout);
      const diag = layout as unknown as {
        iterations?: number;
        capped?: boolean;
      };

      // eslint-disable-next-line no-console
      console.log(
        `[majorization] n=${nodes.length} edges=${edges.length} ` +
          `weights=${config.label} ticks=${result.ticks} ` +
          `iterations=${diag.iterations} capped=${diag.capped} ` +
          `totalMs=${result.totalMs.toFixed(1)} ` +
          `maxTickMs=${result.maxTickMs.toFixed(2)} ` +
          `rebound=${terminalReboundOf(result.spreads).toFixed(3)}`,
      );

      expect(layout.isSettled).toBe(true);
      expect(result.maxTickMs).toBeLessThan(MAX_TICK_MS);
      expect(overlapCountOf(layout)).toBe(0);
      // The motion gate holds at every size, not only on the real shape.
      expect(terminalReboundOf(result.spreads)).toBeLessThan(0.08);
    },
    120_000,
  );
});

describe("majorization layout — real two-hub shape (PRIMARY gate)", () => {
  it.each(WEIGHT_CONFIGS.map((config) => ({ config })))(
    "settles the ~1k node / two 150-leaf-hub shape in ≤ 2 s, overlap-free, no contract→expand ($config.label weights)",
    ({ config }) => {
      const { nodes, edges } = buildRealShapeFixture();
      const layout = createMajorizationLayout(
        nodes,
        edges,
        new FlatGraphBuffer(nodes.length),
        config.options,
      );

      const result = drive(layout);
      const rebound = terminalReboundOf(result.spreads);
      const diag = layout as unknown as {
        iterations?: number;
        capped?: boolean;
      };

      // eslint-disable-next-line no-console
      console.log(
        `[majorization-real-shape] n=${nodes.length} edges=${edges.length} ` +
          `weights=${config.label} ticks=${result.ticks} ` +
          `iterations=${diag.iterations} capped=${diag.capped} ` +
          `wallMs=${result.totalMs.toFixed(1)} ` +
          `maxTickMs=${result.maxTickMs.toFixed(2)} rebound=${rebound.toFixed(3)}`,
      );

      expect(layout.isSettled).toBe(true);
      expect(result.totalMs).toBeLessThan(REAL_SHAPE_WALL_MS);
      expect(result.maxTickMs).toBeLessThan(MAX_TICK_MS);
      expect(overlapCountOf(layout)).toBe(0);
      expect(rebound).toBeLessThan(0.08);
    },
    60_000,
  );
});

describe("majorization layout — region disjointness gate", () => {
  it("keeps community regions disjoint on the real shape (≤ SGD engine, below the folding baseline)", () => {
    const majorization = (() => {
      const { nodes, edges } = buildRealShapeFixture();
      const layout = createMajorizationLayout(
        nodes,
        edges,
        new FlatGraphBuffer(nodes.length),
      );
      drive(layout);
      return layout;
    })();
    const stress = (() => {
      const { nodes, edges } = buildRealShapeFixture();
      const layout = createStressLayout(
        nodes,
        edges,
        new FlatGraphBuffer(nodes.length),
      );
      drive(layout);
      return layout;
    })();

    const majorizationOverlap = regionOverlapOf(majorization);
    const stressOverlap = regionOverlapOf(stress);

    // eslint-disable-next-line no-console
    console.log(
      `[majorization-region] real-shape regionOverlap: ` +
        `majorization=${majorizationOverlap.toFixed(4)} ` +
        `stress=${stressOverlap.toFixed(4)} ` +
        `(pre-fix majorization baseline: 0.32)`,
    );

    expect(majorization.isSettled).toBe(true);
    expect(overlapCountOf(majorization)).toBe(0);
    expect(majorizationOverlap).toBeLessThan(REAL_SHAPE_REGION_OVERLAP_MAX);
    expect(majorizationOverlap).toBeLessThanOrEqual(stressOverlap);
  }, 60_000);
});
