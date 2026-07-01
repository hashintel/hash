/**
 * Production-realistic perf gate for the stress engine's incremental FORBID phase.
 *
 * The fixtures mirror the graph that froze the old terminal VPSC projection: a large
 * cloud (1k / 3k / 5k) plus one super-hub with 150+ near-coincident degree-1 leaves.
 * Driving the layout with the worker's 1 ms tick budget, we assert BOTH the perf gate
 * (no single tick blows past a frame — the whole point of chunking FORBID across ticks)
 * AND correctness (the settled layout is strictly overlap-free).
 *
 * Each fixture is run at BOTH the gentle default community/degree weights and clearly
 * elevated ones, because those outward terms (like FORBID) push nodes apart and must
 * not break either gate — the whole knob set has to stay frame-safe and overlap-free.
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { buildForceGraphWithCoincidentHub } from "../bench-fixtures";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { countOverlaps } from "./overlap-relax";
import { createStressLayout } from "./stress-layout";

import type { GraphShape } from "../bench-fixtures";
import type { StressLayoutOptions } from "./stress-layout";

/** Largest single tick may not approach a dropped frame; the old VPSC call was ~6.5 s. */
const MAX_TICK_MS = 100;
const HUB_LEAVES = 150;

/** Weight sets exercised on every fixture: gentle defaults and a clearly elevated set. */
const WEIGHT_CONFIGS: readonly {
  readonly label: string;
  readonly options: StressLayoutOptions | undefined;
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

function overlapCountOf(layout: {
  nodes: readonly { x?: number; y?: number; radius: number }[];
}): number {
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

const CLOUD_SIZES = [1_000, 3_000, 5_000] as const;

const GATE_CASES = CLOUD_SIZES.flatMap((cloudCount) =>
  WEIGHT_CONFIGS.map((config) => ({ cloudCount, config })),
);

describe("stress layout — coincident-hub perf gate", () => {
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
      const layout = createStressLayout(
        nodes,
        edges,
        new FlatGraphBuffer(nodes.length),
        config.options,
      );

      let maxTickMs = 0;
      let totalMs = 0;
      let ticks = 0;
      // Drive at the production 1 ms cadence; guard is generous but finite.
      for (let step = 0; step < 200_000 && !layout.isSettled; step++) {
        const start = performance.now();
        const moved = layout.tick(1);
        const tickMs = performance.now() - start;
        totalMs += tickMs;
        maxTickMs = Math.max(maxTickMs, tickMs);
        ticks += 1;
        if (!moved) {
          break;
        }
      }

      // eslint-disable-next-line no-console
      console.log(
        `[stress+forbid] n=${nodes.length} edges=${edges.length} ` +
          `weights=${config.label} ticks=${ticks} totalMs=${totalMs.toFixed(1)} ` +
          `maxTickMs=${maxTickMs.toFixed(2)}`,
      );

      expect(layout.isSettled).toBe(true);
      expect(maxTickMs).toBeLessThan(MAX_TICK_MS);
      expect(overlapCountOf(layout)).toBe(0);
    },
    60_000,
  );
});
