/* eslint-disable no-console -- committed A/B harness whose whole purpose is to PRINT a
   terms-off / default / elevated comparison table for the community + degree knobs. */
/* eslint-disable id-length -- community/centroid + edge-endpoint index math (k, c, u, v) mirrors the solver and reads best short. */
/**
 * A/B harness for the two stress-solver knobs added on top of FORBID:
 *
 *   - communityCohesion / communitySeparation : Noack-style centroid term.
 *   - degreeRepulsion                          : FA2-style near-field, hubs claim space.
 *
 * Two fixtures, each driven to `settled` at the production 1 ms tick budget, at three
 * weight settings (terms OFF, gentle DEFAULT, and clearly ELEVATED):
 *
 *  1. A clique-community graph (Louvain recovers the cliques) → reports the ratio of
 *     mean inter-community centroid distance to mean intra-community radius. Higher ⇒
 *     communities are more cleanly separated.
 *  2. The production coincident-hub fixture (one super-hub + 150 near-coincident leaves)
 *     → reports the hub's mean spacing to its own leaves. Higher ⇒ the hub claims more
 *     space. Both fixtures also report strict overlaps (must stay 0 — FORBID guarantees
 *     it) and construct-to-settled wall time.
 *
 * Run (from apps/hash-frontend):
 *   node_modules/.bin/vitest bench --run \
 *     src/pages/shared/graph-visualizer-2/worker/layout/community-degree-terms.bench.ts
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { FlatGraphBuffer } from "../buffers/position-buffer";
import { countOverlaps } from "./overlap-relax";
import { createStressLayout } from "./stress-layout";

import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";
import type { StressLayoutOptions } from "./stress-layout";

interface WeightSet {
  readonly label: string;
  readonly options: StressLayoutOptions;
}

/**
 * Each fixture isolates its own knob (the unrelated knob is held at 0) so the reported
 * metric moves for one clear reason. Production runs all three together at the gentle
 * defaults; the isolation here is only to make the A/B causally unambiguous.
 */
const COMMUNITY_WEIGHTS: readonly WeightSet[] = [
  {
    label: "off",
    options: {
      communityCohesion: 0,
      communitySeparation: 0,
      degreeRepulsion: 0,
    },
  },
  {
    label: "default",
    options: {
      communityCohesion: 0.02,
      communitySeparation: 0.08,
      degreeRepulsion: 0,
    },
  },
  {
    label: "elevated",
    options: {
      communityCohesion: 0.15,
      communitySeparation: 0.4,
      degreeRepulsion: 0,
    },
  },
];

const DEGREE_WEIGHTS: readonly WeightSet[] = [
  {
    label: "off",
    options: {
      communityCohesion: 0,
      communitySeparation: 0,
      degreeRepulsion: 0,
    },
  },
  {
    label: "default",
    options: {
      communityCohesion: 0,
      communitySeparation: 0,
      degreeRepulsion: 0.02,
    },
  },
  {
    label: "elevated",
    options: {
      communityCohesion: 0,
      communitySeparation: 0,
      degreeRepulsion: 0.12,
    },
  },
];

/**
 * A pure star: one hub with `leaves` degree-1 leaves. `leaves` is kept below the point where
 * the leaves jam into a ring at the ideal edge length (≈37 at radius 5 / ideal 60), so the
 * halo is *repulsion-limited* not packing-limited. That matters at the layout level: on a
 * jammed hub FORBID scales the whole cluster up to clear overlaps and that scaling — not the
 * repulsion knob — dominates the hub's spacing, hiding (even reversing) the term's effect.
 * With a loose ring FORBID stays inert and degree-repulsion is the only outward push.
 */
function starHubGraph(leaves: number): {
  nodes: ForceNode[];
  edges: ForceEdge[];
} {
  const nodes: ForceNode[] = [{ id: "hub", x: 0, y: 0, radius: 8 }];
  const edges: ForceEdge[] = [];
  for (let i = 0; i < leaves; i++) {
    const id = `leaf-${i}`;
    nodes.push({ id, x: Math.cos(i) * 3, y: Math.sin(i) * 3, radius: 5 });
    edges.push({ source: "hub", target: id, weight: 1 });
  }
  return { nodes, edges };
}

/** `communities` cliques of `size` nodes, chained by one bridge; a clean community fixture. */
function cliqueCommunityGraph(
  communities: number,
  size: number,
): { nodes: ForceNode[]; edges: ForceEdge[] } {
  const nodes: ForceNode[] = [];
  const edges: ForceEdge[] = [];
  for (let clique = 0; clique < communities; clique++) {
    const base = clique * size;
    for (let i = 0; i < size; i++) {
      nodes.push({ id: String(base + i), x: base + i, y: clique, radius: 6 });
      for (let j = i + 1; j < size; j++) {
        edges.push({
          source: String(base + i),
          target: String(base + j),
          weight: 1,
        });
      }
    }
    if (clique > 0) {
      edges.push({
        source: String((clique - 1) * size),
        target: String(base),
        weight: 1,
      });
    }
  }
  return { nodes, edges };
}

function cloneNodes(nodes: readonly ForceNode[]): ForceNode[] {
  return nodes.map((node) => ({ ...node }));
}

function driveToSettled(layout: LayoutSimulation): void {
  for (let guard = 0; guard < 5_000_000 && !layout.isSettled; guard++) {
    if (!layout.tick(1)) {
      break;
    }
  }
}

function overlapsOf(layout: LayoutSimulation): number {
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

/** Mean inter-community centroid distance ÷ mean intra-community radius (higher = cleaner). */
function interIntraRatio(layout: LayoutSimulation): number {
  const communities = layout.communities!;
  const dense = new Map<number, number>();
  for (const raw of communities) {
    if (!dense.has(raw)) {
      dense.set(raw, dense.size);
    }
  }
  const k = dense.size;
  const sumX = new Float64Array(k);
  const sumY = new Float64Array(k);
  const count = new Int32Array(k);
  const nodes = layout.nodes;
  for (const [index, raw] of communities.entries()) {
    const c = dense.get(raw)!;
    sumX[c]! += nodes[index]!.x ?? 0;
    sumY[c]! += nodes[index]!.y ?? 0;
    count[c]! += 1;
  }
  const cx = new Float64Array(k);
  const cy = new Float64Array(k);
  for (let c = 0; c < k; c++) {
    cx[c] = sumX[c]! / Math.max(1, count[c]!);
    cy[c] = sumY[c]! / Math.max(1, count[c]!);
  }
  let intra = 0;
  for (const [index, raw] of communities.entries()) {
    const c = dense.get(raw)!;
    intra += Math.hypot(
      (nodes[index]!.x ?? 0) - cx[c]!,
      (nodes[index]!.y ?? 0) - cy[c]!,
    );
  }
  intra /= Math.max(1, communities.length);
  let inter = 0;
  let pairs = 0;
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      inter += Math.hypot(cx[a]! - cx[b]!, cy[a]! - cy[b]!);
      pairs += 1;
    }
  }
  inter /= Math.max(1, pairs);
  return inter / Math.max(1e-9, intra);
}

/** Index of the max-degree node and the mean distance from it to its graph neighbours. */
function hubSpacing(
  layout: LayoutSimulation,
  edges: readonly ForceEdge[],
): number {
  const idToIndex = new Map<string, number>();
  for (const [index, node] of layout.nodes.entries()) {
    idToIndex.set(node.id, index);
  }
  const degree = new Int32Array(layout.nodes.length);
  const neighbours: number[][] = layout.nodes.map(() => []);
  for (const edge of edges) {
    const source =
      typeof edge.source === "string" ? edge.source : edge.source.id;
    const target =
      typeof edge.target === "string" ? edge.target : edge.target.id;
    const u = idToIndex.get(source);
    const v = idToIndex.get(target);
    if (u === undefined || v === undefined || u === v) {
      continue;
    }
    degree[u]! += 1;
    degree[v]! += 1;
    neighbours[u]!.push(v);
    neighbours[v]!.push(u);
  }
  let hub = 0;
  for (let i = 1; i < degree.length; i++) {
    if (degree[i]! > degree[hub]!) {
      hub = i;
    }
  }
  const hubNode = layout.nodes[hub]!;
  const hubNeighbours = neighbours[hub]!;
  let sum = 0;
  for (const other of hubNeighbours) {
    const node = layout.nodes[other]!;
    sum += Math.hypot(
      (node.x ?? 0) - (hubNode.x ?? 0),
      (node.y ?? 0) - (hubNode.y ?? 0),
    );
  }
  return hubNeighbours.length > 0 ? sum / hubNeighbours.length : 0;
}

function pad(text: string, width: number): string {
  return text.padStart(width);
}

function row(cells: readonly string[]): string {
  const widths = [10, 12, 14, 12, 10];
  return cells.map((cell, index) => pad(cell, widths[index]!)).join("  ");
}

function report(
  title: string,
  nodes: readonly ForceNode[],
  edges: ForceEdge[],
  metric: (layout: LayoutSimulation) => number,
  metricLabel: string,
  weightSets: readonly WeightSet[],
): string {
  const lines: string[] = [];
  lines.push(
    `\n=== ${title}: ${nodes.length} nodes / ${edges.length} edges ===`,
  );
  lines.push(row(["weights", "wall ms", metricLabel, "overlaps", ""]));
  for (const set of weightSets) {
    const runNodes = cloneNodes(nodes);
    const buffer = new FlatGraphBuffer(Math.max(1, runNodes.length));
    const start = performance.now();
    const layout = createStressLayout(runNodes, edges, buffer, set.options);
    driveToSettled(layout);
    const wallMs = performance.now() - start;
    lines.push(
      row([
        set.label,
        wallMs.toFixed(1),
        metric(layout).toFixed(3),
        String(overlapsOf(layout)),
        "",
      ]),
    );
  }
  return lines.join("\n");
}

const community = cliqueCommunityGraph(5, 10);
console.log(
  report(
    "community separation (5 cliques)",
    community.nodes,
    community.edges,
    interIntraRatio,
    "inter/intra",
    COMMUNITY_WEIGHTS,
  ),
);

const hub = starHubGraph(30);
console.log(
  report(
    "degree repulsion (hub + 30 leaves)",
    hub.nodes,
    hub.edges,
    (layout) => hubSpacing(layout, hub.edges),
    "hub spacing",
    DEGREE_WEIGHTS,
  ),
);

/** Timing cross-check: terms off vs elevated on the hub fixture. */
const BENCH_OPTIONS = {
  time: 0,
  iterations: 3,
  warmupTime: 0,
  warmupIterations: 1,
} as const;

describe("community + degree terms (hub fixture)", () => {
  for (const set of DEGREE_WEIGHTS) {
    bench(
      set.label,
      () => {
        const runNodes = cloneNodes(hub.nodes);
        const buffer = new FlatGraphBuffer(Math.max(1, runNodes.length));
        driveToSettled(
          createStressLayout(runNodes, hub.edges, buffer, set.options),
        );
      },
      BENCH_OPTIONS,
    );
  }
});
