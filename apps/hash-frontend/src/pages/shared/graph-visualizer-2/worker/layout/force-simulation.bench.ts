/**
 * Full-layout settle cost for the two individual-entity engines. `build + settle`
 * is the whole time-to-laid-out a user waits on: matrix/seed construction plus
 * every solver iteration to convergence. It shows why flat-force (cola `Descent`,
 * O(N^2) per step + an O(N^2) distance matrix at build) is capped at 200 nodes
 * and community-force (constrained stress majorization) takes the medium tier.
 *
 * Settling dominates and is expensive, so these use a fixed, small iteration
 * count (`SETTLE_OPTS`) rather than vitest's default time budget; treat the means
 * as ballpark (few samples), the cross-size / cross-engine SHAPE is the point.
 *
 * Run: `cd apps/hash-frontend && ../../node_modules/.bin/vitest bench --run \
 * src/pages/shared/graph-visualizer-2/worker/layout/force-simulation.bench.ts`
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { buildForceGraph } from "../bench-fixtures";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createFlatLayout } from "./flat-layout";
import { createMajorizationLayout } from "./majorization-layout";

import type { GraphShape } from "../bench-fixtures";
import type { ForceNode, LayoutSimulation } from "./force-simulation";

/** Exactly `iterations` measured runs (settling is too slow for a time budget). */
const SETTLE_OPTS = {
  time: 0,
  iterations: 6,
  warmupTime: 0,
  warmupIterations: 1,
} as const;

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

/** Drive the phase machine to convergence (each engine self-caps its iterations). */
function settle(layout: LayoutSimulation): void {
  while (!layout.isSettled) {
    if (!layout.tick(60_000)) {
      break;
    }
  }
}

/** Fresh node objects: the solvers mutate node x/y in place, so a shared array
 * would let run N+1 warm-start from run N's settled positions. */
function cloneNodes(nodes: readonly ForceNode[]): ForceNode[] {
  return nodes.map((node) => ({ ...node }));
}

const FLAT_CASES: readonly GraphShape[] = [
  shape(50, 90, 101),
  shape(120, 240, 102),
  shape(200, 400, 103),
];

for (const graphShape of FLAT_CASES) {
  describe(`flat-force build + settle (${graphShape.nodeCount} nodes)`, () => {
    const { nodes, edges } = buildForceGraph(graphShape);
    bench(
      "cola Descent",
      () => {
        const buffer = new FlatGraphBuffer(nodes.length);
        settle(createFlatLayout(cloneNodes(nodes), edges, buffer));
      },
      SETTLE_OPTS,
    );
  });
}

const COMMUNITY_CASES: readonly GraphShape[] = [
  shape(500, 1_200, 201),
  shape(1_500, 4_000, 202),
  shape(3_000, 8_000, 203),
];

for (const graphShape of COMMUNITY_CASES) {
  describe(`community-force (${graphShape.nodeCount} nodes)`, () => {
    const { nodes, edges } = buildForceGraph(graphShape);

    // Synchronous construction (Louvain + typed-array allocation); the analysis
    // and solve are budget-sliced across ticks, so this is what blocks the
    // worker before the first frame can stream.
    bench(
      "build only (construct)",
      () => {
        const buffer = new FlatGraphBuffer(nodes.length);
        createMajorizationLayout(cloneNodes(nodes), edges, buffer);
      },
      SETTLE_OPTS,
    );

    bench(
      "build + settle (majorization)",
      () => {
        const buffer = new FlatGraphBuffer(nodes.length);
        settle(createMajorizationLayout(cloneNodes(nodes), edges, buffer));
      },
      SETTLE_OPTS,
    );
  });
}
