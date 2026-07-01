/**
 * Production-realistic perf gate for the stress engine's incremental FORBID phase.
 *
 * The fixtures mirror the graph that froze the old terminal VPSC projection: a large
 * cloud (1k / 3k / 5k) plus one super-hub with 150+ near-coincident degree-1 leaves.
 * Driving the layout with the worker's 1 ms tick budget, we assert BOTH the perf gate
 * (no single tick blows past a frame — the whole point of chunking FORBID across ticks)
 * AND correctness (the settled layout is strictly overlap-free).
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { buildForceGraphWithCoincidentHub } from "../bench-fixtures";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { countOverlaps } from "./overlap-relax";
import { createStressLayout } from "./stress-layout";

import type { GraphShape } from "../bench-fixtures";

/** Largest single tick may not approach a dropped frame; the old VPSC call was ~6.5 s. */
const MAX_TICK_MS = 100;
const HUB_LEAVES = 150;

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

describe("stress layout — coincident-hub perf gate", () => {
  it.each(CLOUD_SIZES)(
    "stays within the tick budget and ends overlap-free (%i-node cloud + coincident hub)",
    (cloudCount) => {
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
          `ticks=${ticks} totalMs=${totalMs.toFixed(1)} ` +
          `maxTickMs=${maxTickMs.toFixed(2)}`,
      );

      expect(layout.isSettled).toBe(true);
      expect(maxTickMs).toBeLessThan(MAX_TICK_MS);
      expect(overlapCountOf(layout)).toBe(0);
    },
    60_000,
  );
});
