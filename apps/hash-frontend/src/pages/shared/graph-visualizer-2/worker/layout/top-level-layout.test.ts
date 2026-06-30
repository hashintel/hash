// eslint-disable-next-line import/no-extraneous-dependencies -- vitest is provided by the monorepo; the frontend's own test runner is not yet wired up.
import { describe, expect, it } from "vitest";

import {
  type Anchor,
  type LayoutNode,
  measureLayout,
  optimizeTopLevel,
  relaxOverlaps,
} from "./top-level-layout";

/** A regular polygon of `count` equal bubbles at radius `ring` from the origin. */
function polygon(count: number, ring: number, radius: number): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  for (let idx = 0; idx < count; idx++) {
    const angle = (idx / count) * 2 * Math.PI;
    nodes.push({
      x: Math.cos(angle) * ring,
      y: Math.sin(angle) * ring,
      radius,
    });
  }
  return nodes;
}

/** Ring edges (0-1, 1-2, …, n-1-0): a crossing-free cycle for the polygon. */
function ringEdges(count: number): [number, number][] {
  return Array.from(
    { length: count },
    (_, idx) => [idx, (idx + 1) % count] as [number, number],
  );
}

/** Mean-removed displacement of each node from its anchor (translation-invariant). */
function relativeDisplacements(
  nodes: readonly LayoutNode[],
  anchors: readonly (Anchor | null)[],
): number[] {
  let dxSum = 0;
  let dySum = 0;
  let anchored = 0;
  for (let idx = 0; idx < nodes.length; idx++) {
    const anchor = anchors[idx];
    if (!anchor) {
      continue;
    }
    dxSum += nodes[idx]!.x - anchor.x;
    dySum += nodes[idx]!.y - anchor.y;
    anchored += 1;
  }
  const meanX = anchored > 0 ? dxSum / anchored : 0;
  const meanY = anchored > 0 ? dySum / anchored : 0;
  return nodes.map((node, idx) => {
    const anchor = anchors[idx];
    if (!anchor) {
      return Number.NaN;
    }
    return Math.hypot(node.x - anchor.x - meanX, node.y - anchor.y - meanY);
  });
}

describe("optimizeTopLevel", () => {
  it("clears an edge forced straight through a huge obstacle bubble", () => {
    // A↔B connected, with a HUGE bubble C parked on the A–B line between them
    // (C↔D keeps C placeable). This is the "Of Material wraps around Material
    // Movement" case: the straight edge pierces the obstacle.
    const nodes: LayoutNode[] = [
      { x: 0, y: 0, radius: 10 }, // A
      { x: 160, y: 0, radius: 10 }, // B
      { x: 80, y: 0, radius: 50 }, // C — huge, between A and B
      { x: 80, y: 150, radius: 10 }, // D
    ];
    const edges: ReadonlyArray<readonly [number, number]> = [
      [0, 1], // A–B
      [2, 3], // C–D
    ];

    const before = measureLayout(nodes, edges);
    optimizeTopLevel(nodes, edges, 12345);
    const after = measureLayout(nodes, edges);

    // eslint-disable-next-line no-console
    console.log(
      `[toplevel] detour ${before.detour.toFixed(2)} → ${after.detour.toFixed(2)}, energy ${before.energy.toFixed(1)} → ${after.energy.toFixed(1)}`,
    );
    expect(before.detour).toBeGreaterThan(0.8); // edge pierced the obstacle
    expect(after.detour).toBeLessThan(0.2); // optimiser cleared it
    expect(after.energy).toBeLessThan(before.energy);
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it("uncrosses two crossing edges", () => {
    // Square with the two diagonals as edges → they cross. A reposition/swap
    // makes them parallel.
    const nodes: LayoutNode[] = [
      { x: 0, y: 0, radius: 10 }, // A
      { x: 100, y: 100, radius: 10 }, // B
      { x: 100, y: 0, radius: 10 }, // C
      { x: 0, y: 100, radius: 10 }, // D
    ];
    const edges: ReadonlyArray<readonly [number, number]> = [
      [0, 1], // A–B (diagonal)
      [2, 3], // C–D (diagonal)
    ];

    const before = measureLayout(nodes, edges);
    optimizeTopLevel(nodes, edges, 777);
    const after = measureLayout(nodes, edges);

    // eslint-disable-next-line no-console
    console.log(
      `[toplevel] crossings ${before.crossings} → ${after.crossings}`,
    );
    expect(before.crossings).toBe(1);
    expect(after.crossings).toBe(0);
    expect(after.overlap).toBeLessThan(0.1); // didn't introduce overlap
  });

  it("leaves a tiny graph (n < 3) untouched", () => {
    const nodes: LayoutNode[] = [
      { x: 0, y: 0, radius: 10 },
      { x: 50, y: 0, radius: 10 },
    ];
    optimizeTopLevel(nodes, [[0, 1]], 1);
    expect(nodes[0]!.x).toBe(0);
    expect(nodes[1]!.x).toBe(50);
  });
});

describe("optimizeTopLevel anchored refine (incremental stability)", () => {
  it("keeps an already-good layout in place instead of re-deriving it", () => {
    const ring = 120;
    const radius = 12;
    const nodes = polygon(6, ring, radius);
    const edges = ringEdges(6);
    const anchors: (Anchor | null)[] = nodes.map((node) => ({
      x: node.x,
      y: node.y,
    }));

    optimizeTopLevel(nodes, edges, 4242, { anchors });

    // Every existing bubble stays within a fraction of its own radius of where
    // it was: the refine doesn't reshuffle a layout that's already crossing-free.
    const displacements = relativeDisplacements(nodes, anchors);
    for (const displacement of displacements) {
      expect(displacement).toBeLessThan(radius);
    }
    expect(measureLayout(nodes, edges).crossings).toBe(0);
  });

  it("places a new bubble without disturbing the existing arrangement", () => {
    const ring = 120;
    const radius = 12;
    const existing = polygon(6, ring, radius);
    const anchors: (Anchor | null)[] = [
      ...existing.map((node) => ({ x: node.x, y: node.y })),
      null, // the 7th bubble is new — placed freely
    ];

    // New bubble seeded near the centre, connected to one existing bubble.
    const nodes: LayoutNode[] = [...existing, { x: 5, y: 5, radius }];
    const edges: [number, number][] = [...ringEdges(6), [6, 0]];

    optimizeTopLevel(nodes, edges, 99, { anchors });

    // The 6 existing bubbles barely move (mental map preserved)…
    const displacements = relativeDisplacements(nodes, anchors);
    for (let idx = 0; idx < 6; idx++) {
      expect(displacements[idx]!).toBeLessThan(2 * radius);
    }
    // …while the new bubble leaves its poor central seed to find open space.
    const newNode = nodes[6]!;
    expect(Math.hypot(newNode.x - 5, newNode.y - 5)).toBeGreaterThan(radius);
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it("re-optimises far less aggressively than a cold search (the fix)", () => {
    // The same poor seed (six bubbles strung along a line) optimised two ways.
    // A cold global search re-derives a clean arrangement, moving bubbles a long
    // way; the anchored refine keeps them near their previous spot. This is the
    // erratic-vs-stable contrast the anchoring exists to fix.
    const radius = 12;
    const seed = (): LayoutNode[] =>
      Array.from({ length: 6 }, (_, idx) => ({
        x: (idx - 2.5) * 44,
        y: idx % 2 === 0 ? 9 : -9,
        radius,
      }));
    const edges = ringEdges(6);
    const anchors: (Anchor | null)[] = seed().map((node) => ({
      x: node.x,
      y: node.y,
    }));
    const totalMovement = (nodes: readonly LayoutNode[]): number =>
      relativeDisplacements(nodes, anchors).reduce(
        (sum, dist) => sum + dist,
        0,
      );

    const cold = seed();
    optimizeTopLevel(cold, edges, 555);

    const refined = seed();
    optimizeTopLevel(refined, edges, 555, { anchors });

    const coldMovement = totalMovement(cold);
    const refinedMovement = totalMovement(refined);

    // eslint-disable-next-line no-console
    console.log(
      `[toplevel] movement cold ${coldMovement.toFixed(1)} vs anchored ${refinedMovement.toFixed(1)}`,
    );
    // The anchored refine keeps bubbles close to their previous positions…
    expect(refinedMovement).toBeLessThan(coldMovement);
    // …and the geometry it produces is no worse than the seed it started from.
    expect(measureLayout(refined, edges).energy).toBeLessThanOrEqual(
      measureLayout(seed(), edges).energy + 1e-6,
    );
  });

  it("lets a low-weight (off-screen) bubble move while a high-weight one stays", () => {
    // Two connected bubbles seeded far apart, so stress pulls them together.
    // One is pinned (weight 1, "on screen"), the other nearly free (weight 0.02,
    // "off screen"); the free one should yield while the pinned one holds. The
    // third bubble is an isolated, fully-anchored frame reference.
    const radius = 10;
    const nodes: LayoutNode[] = [
      { x: -40, y: 0, radius },
      { x: 40, y: 0, radius },
      { x: 0, y: 120, radius },
    ];
    const anchors: (Anchor | null)[] = [
      { x: -40, y: 0, weight: 1 },
      { x: 40, y: 0, weight: 0.02 },
      { x: 0, y: 120, weight: 1 },
    ];
    const edges: [number, number][] = [[0, 1]];

    optimizeTopLevel(nodes, edges, 31, { anchors });

    const pinnedMove = Math.hypot(nodes[0]!.x + 40, nodes[0]!.y);
    const freeMove = Math.hypot(nodes[1]!.x - 40, nodes[1]!.y);

    // eslint-disable-next-line no-console
    console.log(
      `[toplevel] weighted move pinned ${pinnedMove.toFixed(1)} vs free ${freeMove.toFixed(1)}`,
    );
    expect(freeMove).toBeGreaterThan(pinnedMove);
    expect(pinnedMove).toBeLessThan(radius);
  });

  it("guarantees zero overlap on growth, where the search leaves a sliver", () => {
    // A central bubble grew huge (radius 200) and is pinned, and so are its two
    // neighbours (all weight 1, all on screen) at positions now buried inside
    // it. The anchored search resolves MOST of this on its own, but — anchored
    // to infeasible (overlapping) positions — it leaves a residual sliver it
    // won't close. The final relaxation must turn that sliver into exactly zero.
    const seedNodes = (): LayoutNode[] => [
      { x: 0, y: 0, radius: 200 },
      { x: 40, y: 0, radius: 12 },
      { x: -40, y: 0, radius: 12 },
    ];
    const anchors: (Anchor | null)[] = [
      { x: 0, y: 0, weight: 1 },
      { x: 40, y: 0, weight: 1 },
      { x: -40, y: 0, weight: 1 },
    ];
    const edges: [number, number][] = [
      [0, 1],
      [0, 2],
    ];

    // The search alone (relaxation suppressed) leaves a measurable overlap.
    const searchOnly = seedNodes();
    optimizeTopLevel(searchOnly, edges, 23, {
      anchors,
      skipOverlapRelaxation: true,
    });
    const searchOnlyOverlap = measureLayout(searchOnly, edges).overlap;
    expect(searchOnlyOverlap).toBeGreaterThan(0.01);

    // The full pass drives it to zero — the relaxation is what closes the gap.
    const nodes = seedNodes();
    optimizeTopLevel(nodes, edges, 23, { anchors });
    const fullOverlap = measureLayout(nodes, edges).overlap;
    expect(fullOverlap).toBeLessThan(1e-9);
    expect(fullOverlap).toBeLessThan(searchOnlyOverlap);
  });

  it("relaxOverlaps separates overlaps and moves the heavier bubble less", () => {
    // Two overlapping bubbles, B four times as heavy (pinned) as A. The push
    // apart must (a) actually separate them and (b) move the heavier one less,
    // i.e. distribute by weight rather than 50/50. No SA involved — this is the
    // relaxation in isolation.
    const meanRadius = 10;
    const nodes: LayoutNode[] = [
      { x: 0, y: 0, radius: 10 }, // A: light
      { x: 8, y: 0, radius: 10 }, // B: heavy, overlapping A
    ];
    const anchors: (Anchor | null)[] = [
      { x: 0, y: 0, weight: 1 },
      { x: 8, y: 0, weight: 4 },
    ];

    relaxOverlaps(nodes, anchors, meanRadius);

    // (a) No overlap left: centre distance >= radii + the objective's pad.
    const pad = 0.3 * meanRadius;
    const separation = Math.hypot(nodes[1]!.x - nodes[0]!.x, nodes[1]!.y);
    expect(separation).toBeGreaterThanOrEqual(20 + pad - 1e-6);
    // (b) The heavier bubble moved less than the lighter one.
    const moveA = Math.abs(nodes[0]!.x - 0);
    const moveB = Math.abs(nodes[1]!.x - 8);
    expect(moveB).toBeLessThan(moveA);
  });
});
