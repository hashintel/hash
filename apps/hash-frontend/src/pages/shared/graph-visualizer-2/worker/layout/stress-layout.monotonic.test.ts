/**
 * Monotonicity gate: the settling motion must not contract into a clump and then expand
 * back out (the "relayout fight" the user saw on video — stress compacts, a separate
 * terminal overlap phase re-expands). We drive the layout at the production 1 ms cadence,
 * sample the RMS spread (root-mean-square distance from the centroid) every tick, and
 * assert there is no significant contract→expand cycle.
 *
 * The guard metric is the terminal rebound: after the layout reaches its widest point
 * (argmax spread — the PivotMDS seed / high-eta opening), how far does it dip BELOW its
 * final size and then climb back? `rebound = (finalSpread - min(spread after the peak)) /
 * finalSpread`. Settling monotonically inward to the final size gives ~0; a stress-then-
 * overlap swing dips to a transient clump and rebounds, giving a large value. (The initial
 * seed→settle contraction is expected and is NOT what this measures — it happens before,
 * or up to, the peak, so it never contributes to the post-peak rebound.)
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { buildForceGraphWithCoincidentHub } from "../bench-fixtures";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createStressLayout } from "./stress-layout";

import type { GraphShape } from "../bench-fixtures";
import type { LayoutSimulation } from "./force-simulation";
import type { StressLayoutOptions } from "./stress-layout";

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

interface Trajectory {
  readonly peak: number;
  readonly finalSpread: number;
  /** Smallest spread seen at or after the widest point (the transient "clump"). */
  readonly postPeakMin: number;
  /** (finalSpread - postPeakMin) / finalSpread — the contract→expand swing amplitude. */
  readonly terminalRebound: number;
  readonly ticks: number;
}

function driveAndTrace(layout: LayoutSimulation): Trajectory {
  const spreads: number[] = [];
  for (let step = 0; step < 200_000 && !layout.isSettled; step++) {
    const moved = layout.tick(1);
    spreads.push(rmsSpread(layout));
    if (!moved) {
      break;
    }
  }

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
  return {
    peak,
    finalSpread,
    postPeakMin: Number.isFinite(postPeakMin) ? postPeakMin : finalSpread,
    terminalRebound:
      finalSpread > 0 ? (finalSpread - postPeakMin) / finalSpread : 0,
    ticks: spreads.length,
  };
}

const HUB_LEAVES = 150;

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

const CLOUD_SIZES = [1_000, 3_000] as const;

const CASES = CLOUD_SIZES.flatMap((cloudCount) =>
  WEIGHT_CONFIGS.map((config) => ({ cloudCount, config })),
);

describe("stress layout — settling monotonicity (no contract→expand)", () => {
  it.each(CASES)(
    "settles without a large contract-then-expand swing ($cloudCount-node cloud + coincident hub, $config.label weights)",
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

      const trajectory = driveAndTrace(layout);
      const diag = layout as unknown as {
        overlapProjectionCalls?: number;
        forbidExpansions?: number;
      };

      // eslint-disable-next-line no-console
      console.log(
        `[monotonic] n=${nodes.length} weights=${config.label} ticks=${trajectory.ticks} ` +
          `epochs=${diag.overlapProjectionCalls ?? "?"} ` +
          `expansions=${diag.forbidExpansions ?? "?"} ` +
          `peak=${trajectory.peak.toFixed(1)} final=${trajectory.finalSpread.toFixed(1)} ` +
          `postPeakMin=${trajectory.postPeakMin.toFixed(1)} ` +
          `rebound=${trajectory.terminalRebound.toFixed(3)}`,
      );

      expect(layout.isSettled).toBe(true);
      // The transient clump-then-expand swing must be gone: after the widest point the
      // layout settles inward monotonically and does not rebound outward by more than a
      // few percent of its final size.
      expect(trajectory.terminalRebound).toBeLessThan(0.08);
    },
    60_000,
  );
});
