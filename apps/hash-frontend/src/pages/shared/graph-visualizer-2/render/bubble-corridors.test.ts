/**
 * Corridor planner tests: the community-bubble CONNECTIVITY guarantee.
 *
 * The contract under test: for every rendered community, the metaball field
 * (point kernels + planned capsule corridors, as the shader sums it) has ONE
 * connected above-threshold region containing all members no matter how they
 * clump spatially, while corridors stay clear of (or narrow over)
 * foreign nodes, deterministically.
 */
import { describe, expect, it } from "vitest";

import {
  CORRIDOR_FIELD_RADIUS,
  CORRIDOR_NARROW_FACTOR,
  evaluateBubbleField,
  planBubbleCorridors,
} from "./bubble-corridors";

import type { CorridorPlan } from "./bubble-corridors";

/** Matches the shader defaults in render/community.ts. */
const FIELD_RADIUS = 50;
const ISO_THRESHOLD = 0.58;

/** SAB record layout used by the real caller (header 8 B, record 20 B). */
const HEADER_FLOATS = 2;
const RECORD_FLOATS = 5;

interface WorldNode {
  readonly x: number;
  readonly y: number;
  readonly radius?: number;
  /** −1 = no community. */
  readonly community: number;
}

interface World {
  readonly plan: CorridorPlan;
  readonly segmentsOf: (ci: number) => {
    readonly aSlot: number;
    readonly bSlot: number;
    readonly ax: number;
    readonly ay: number;
    readonly bx: number;
    readonly by: number;
    readonly radius: number;
  }[];
  readonly membersOf: (ci: number) => readonly (readonly [number, number])[];
}

/**
 * Build planner inputs exactly the way `render/community.ts` does: an
 * SAB-shaped float array, kept communities in first-seen order, members in
 * node-index order, point texels gathered at stride 4.
 */
function makeWorld(
  nodes: readonly WorldNode[],
  keptCommunityIds: readonly number[],
): World {
  const floats = new Float32Array(HEADER_FLOATS + nodes.length * RECORD_FLOATS);
  const membership = new Int32Array(nodes.length);
  for (const [idx, node] of nodes.entries()) {
    floats[HEADER_FLOATS + idx * RECORD_FLOATS] = node.x;
    floats[HEADER_FLOATS + idx * RECORD_FLOATS + 1] = node.y;
    floats[HEADER_FLOATS + idx * RECORD_FLOATS + 2] = node.radius ?? 8;
    membership[idx] = node.community;
  }

  const memberSlots: number[][] = keptCommunityIds.map((community) =>
    nodes.flatMap((node, idx) => (node.community === community ? [idx] : [])),
  );
  const totalMembers = memberSlots.reduce((sum, list) => sum + list.length, 0);
  const ranges = new Float32Array(keptCommunityIds.length * 2);
  const segmentStorageOffsets = new Int32Array(keptCommunityIds.length);
  const pointTexels = new Float32Array(totalMembers * 4);
  let offset = 0;
  let segmentStorage = 0;
  const segmentCapacity = memberSlots.reduce(
    (sum, list) => sum + Math.max(0, list.length - 1) * 2,
    0,
  );
  for (const [ci, list] of memberSlots.entries()) {
    ranges[ci * 2] = offset;
    ranges[ci * 2 + 1] = list.length;
    segmentStorageOffsets[ci] = segmentStorage;
    segmentStorage += Math.max(0, list.length - 1) * 2;
    for (const idx of list) {
      pointTexels[offset * 4] = nodes[idx]!.x;
      pointTexels[offset * 4 + 1] = nodes[idx]!.y;
      offset += 1;
    }
  }

  const plan: CorridorPlan = {
    keptCount: keptCommunityIds.length,
    ranges,
    communityIds: Int32Array.from(keptCommunityIds),
    pointTexels,
    replan: null,
    floats,
    headerFloats: HEADER_FLOATS,
    recordFloats: RECORD_FLOATS,
    membership,
    nodeCount: nodes.length,
    segmentSlots: new Int32Array(segmentCapacity * 2),
    segmentRadius: new Float32Array(segmentCapacity),
    segmentCounts: new Int32Array(keptCommunityIds.length),
    segmentStorageOffsets,
  };

  return {
    plan,
    segmentsOf: (ci) => {
      const list = [];
      const start = plan.segmentStorageOffsets[ci]!;
      for (let segment = 0; segment < plan.segmentCounts[ci]!; segment++) {
        const aSlot = plan.segmentSlots[(start + segment) * 2]!;
        const bSlot = plan.segmentSlots[(start + segment) * 2 + 1]!;
        list.push({
          aSlot,
          bSlot,
          ax: pointTexels[aSlot * 4]!,
          ay: pointTexels[aSlot * 4 + 1]!,
          bx: pointTexels[bSlot * 4]!,
          by: pointTexels[bSlot * 4 + 1]!,
          radius: plan.segmentRadius[start + segment]!,
        });
      }
      return list;
    },
    membersOf: (ci) => {
      const start = ranges[ci * 2]!;
      const count = ranges[ci * 2 + 1]!;
      const list: (readonly [number, number])[] = [];
      for (let member = 0; member < count; member++) {
        list.push([
          pointTexels[(start + member) * 4]!,
          pointTexels[(start + member) * 4 + 1]!,
        ]);
      }
      return list;
    },
  };
}

/** A tight 4-node clump centred on (cx, cy). */
function clump(cx: number, cy: number, community: number): WorldNode[] {
  return [
    { x: cx - 15, y: cy - 12, community },
    { x: cx + 15, y: cy - 12, community },
    { x: cx - 15, y: cy + 12, community },
    { x: cx + 15, y: cy + 12, community },
  ];
}

/**
 * Count the connected above-threshold components of a community's field that
 * contain at least one member (raster flood fill, cell ≪ corridor width).
 */
function fieldComponentsContainingMembers(
  world: World,
  ci: number,
  { withSegments = true }: { withSegments?: boolean } = {},
): number {
  const members = world.membersOf(ci);
  const segments = withSegments
    ? world.segmentsOf(ci).map((segment) => ({
        ax: segment.ax,
        ay: segment.ay,
        bx: segment.bx,
        by: segment.by,
        radius: segment.radius,
      }))
    : [];
  const pad = FIELD_RADIUS;
  const minX = Math.min(...members.map(([mx]) => mx)) - pad;
  const maxX = Math.max(...members.map(([mx]) => mx)) + pad;
  const minY = Math.min(...members.map(([, my]) => my)) - pad;
  const maxY = Math.max(...members.map(([, my]) => my)) + pad;
  // Narrow corridors are ~0.49·narrowRadius wide at the threshold; sample at
  // a quarter of that so the raster cannot pinch a genuinely connected ribbon.
  const cell = (CORRIDOR_FIELD_RADIUS * CORRIDOR_NARROW_FACTOR * 0.49) / 4;
  const cols = Math.ceil((maxX - minX) / cell) + 1;
  const rows = Math.ceil((maxY - minY) / cell) + 1;

  const inside = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const field = evaluateBubbleField(
        minX + col * cell,
        minY + row * cell,
        members,
        segments,
        FIELD_RADIUS,
      );
      inside[row * cols + col] = field >= ISO_THRESHOLD ? 1 : 0;
    }
  }

  const componentOf = new Int32Array(cols * rows).fill(-1);
  let componentCount = 0;
  const stack: number[] = [];
  for (const [memberX, memberY] of members) {
    const col = Math.round((memberX - minX) / cell);
    const row = Math.round((memberY - minY) / cell);
    const seed = row * cols + col;
    if (inside[seed] !== 1) {
      throw new Error("member cell below threshold (fixture broken)");
    }
    if (componentOf[seed] !== -1) {
      continue;
    }
    const component = componentCount;
    componentCount += 1;
    stack.push(seed);
    componentOf[seed] = component;
    while (stack.length > 0) {
      const cellIdx = stack.pop()!;
      const cellRow = Math.floor(cellIdx / cols);
      const cellCol = cellIdx % cols;
      for (const [dCol, dRow] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nCol = cellCol + dCol;
        const nRow = cellRow + dRow;
        if (nCol < 0 || nCol >= cols || nRow < 0 || nRow >= rows) {
          continue;
        }
        const neighbour = nRow * cols + nCol;
        if (inside[neighbour] === 1 && componentOf[neighbour] === -1) {
          componentOf[neighbour] = component;
          stack.push(neighbour);
        }
      }
    }
  }
  return componentCount;
}

/** Union-find spanning check: do the segments connect every member slot? */
function segmentsSpanAllMembers(world: World, ci: number): boolean {
  const start = world.plan.ranges[ci * 2]!;
  const count = world.plan.ranges[ci * 2 + 1]!;
  const parent = Array.from({ length: count }, (_, member) => member);
  const find = (member: number): number => {
    let root = member;
    while (parent[root] !== root) {
      root = parent[root]!;
    }
    return root;
  };
  for (const segment of world.segmentsOf(ci)) {
    parent[find(segment.aSlot - start)] = find(segment.bSlot - start);
  }
  const root = find(0);
  for (let member = 1; member < count; member++) {
    if (find(member) !== root) {
      return false;
    }
  }
  return true;
}

function segmentDistanceTo(
  segment: { ax: number; ay: number; bx: number; by: number },
  px: number,
  py: number,
): number {
  const abX = segment.bx - segment.ax;
  const abY = segment.by - segment.ay;
  const lenSq = abX * abX + abY * abY;
  const raw =
    lenSq > 0 ? ((px - segment.ax) * abX + (py - segment.ay) * abY) / lenSq : 0;
  const along = Math.max(0, Math.min(1, raw));
  return Math.hypot(
    px - (segment.ax + abX * along),
    py - (segment.ay + abY * along),
  );
}

describe("bubble corridors, connectivity guarantee", () => {
  it("three spread clumps: MST spans all members and the field is ONE component", () => {
    const world = makeWorld(
      [...clump(0, 0, 7), ...clump(600, 0, 7), ...clump(300, 500, 7)],
      [7],
    );
    planBubbleCorridors(world.plan);

    expect(segmentsSpanAllMembers(world, 0)).toBe(true);
    // The guard: WITHOUT corridors this fixture is three islands...
    expect(
      fieldComponentsContainingMembers(world, 0, { withSegments: false }),
    ).toBeGreaterThan(1);
    // ...and WITH corridors exactly one.
    expect(fieldComponentsContainingMembers(world, 0)).toBe(1);
    // Nothing foreign anywhere: every corridor is full width.
    for (const segment of world.segmentsOf(0)) {
      expect(segment.radius).toBe(CORRIDOR_FIELD_RADIUS);
    }
  });

  it("reroutes a corridor around a foreign node via an intermediate member", () => {
    // A(0,0) and B(600,0) clumps whose direct MST edge passes over a foreign
    // node at (300,0). The lone member M(0,300) is FARTHER from B than the
    // direct edge (so the MST still picks A-B) but offers a clear one-hop
    // detour within the 2× cap: |A-M| + |M-B| ≈ 290 + 660 < 2 × 570.
    const world = makeWorld(
      [
        ...clump(0, 0, 3),
        ...clump(600, 0, 3),
        { x: 0, y: 300, community: 3 },
        { x: 300, y: 0, community: -1 },
      ],
      [3],
    );
    planBubbleCorridors(world.plan);

    expect(segmentsSpanAllMembers(world, 0)).toBe(true);
    expect(fieldComponentsContainingMembers(world, 0)).toBe(1);
    // No full-width corridor may brush the foreign node.
    for (const segment of world.segmentsOf(0)) {
      if (segment.radius === CORRIDOR_FIELD_RADIUS) {
        expect(segmentDistanceTo(segment, 300, 0)).toBeGreaterThan(
          CORRIDOR_FIELD_RADIUS,
        );
      }
    }
    // The reroute SPLIT an edge (no narrow fallback): more segments than a
    // plain MST (k − 1), all at full width.
    const memberCount = world.plan.ranges[1]!;
    expect(world.segmentsOf(0).length).toBeGreaterThan(memberCount - 1);
    for (const segment of world.segmentsOf(0)) {
      expect(segment.radius).toBe(CORRIDOR_FIELD_RADIUS);
    }
  });

  it("falls back to a NARROW corridor when no detour clears a foreign barrier", () => {
    const barrier: WorldNode[] = [];
    for (let wallY = -400; wallY <= 400; wallY += 50) {
      barrier.push({ x: 300, y: wallY, community: -1 });
    }
    const world = makeWorld(
      [...clump(0, 0, 5), ...clump(600, 0, 5), ...barrier],
      [5],
    );
    planBubbleCorridors(world.plan);

    expect(segmentsSpanAllMembers(world, 0)).toBe(true);
    // Still connected via a thin thread, not a fat blob over the barrier.
    expect(fieldComponentsContainingMembers(world, 0)).toBe(1);
    // (float32 storage: compare against full width, not exact product)
    const narrow = world
      .segmentsOf(0)
      .filter((segment) => segment.radius < CORRIDOR_FIELD_RADIUS);
    expect(narrow.length).toBeGreaterThan(0);
    for (const segment of narrow) {
      expect(segment.radius).toBeCloseTo(
        CORRIDOR_FIELD_RADIUS * CORRIDOR_NARROW_FACTOR,
        3,
      );
    }
  });

  it("degenerate communities: singleton member and coincident members", () => {
    const world = makeWorld(
      [
        { x: 0, y: 0, community: 1 },
        // Coincident four-node community.
        { x: 900, y: 900, community: 2 },
        { x: 900, y: 900, community: 2 },
        { x: 900, y: 900, community: 2 },
        { x: 900, y: 900, community: 2 },
      ],
      [1, 2],
    );
    expect(() => planBubbleCorridors(world.plan)).not.toThrow();
    expect(world.plan.segmentCounts[0]).toBe(0);
    expect(world.plan.segmentCounts[1]).toBe(3);
    expect(fieldComponentsContainingMembers(world, 1)).toBe(1);
  });

  it("is deterministic: identical inputs produce identical plans", () => {
    const build = () => {
      const world = makeWorld(
        [
          ...clump(0, 0, 4),
          ...clump(500, 40, 4),
          ...clump(250, 420, 4),
          { x: 250, y: 20, community: -1 },
          { x: 260, y: 180, community: 9 },
        ],
        [4],
      );
      planBubbleCorridors(world.plan);
      return world;
    };
    const first = build();
    const second = build();
    expect([...second.plan.segmentCounts]).toEqual([
      ...first.plan.segmentCounts,
    ]);
    expect([...second.plan.segmentSlots]).toEqual([...first.plan.segmentSlots]);
    expect([...second.plan.segmentRadius]).toEqual([
      ...first.plan.segmentRadius,
    ]);
  });
});

describe("bubble corridors, planning cost", () => {
  it("plans a large realistic frame well inside a frame budget", () => {
    // 10 spread communities × 100 members + 1000 loose foreign nodes: a
    // harsher obstacle field than the production graphs seen so far.
    const nodes: WorldNode[] = [];
    let seed = 42;
    const rand = () => {
      // LCG in plain float math (exact below 2^53; deterministic).
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let community = 0; community < 10; community++) {
      const baseX = (community % 5) * 900;
      const baseY = Math.floor(community / 5) * 900;
      for (let member = 0; member < 100; member++) {
        const clumpIdx = member % 4;
        nodes.push({
          x: baseX + (clumpIdx % 2) * 420 + rand() * 90,
          y: baseY + Math.floor(clumpIdx / 2) * 420 + rand() * 90,
          community,
        });
      }
    }
    for (let loose = 0; loose < 1000; loose++) {
      nodes.push({ x: rand() * 4500, y: rand() * 1800, community: -1 });
    }
    const world = makeWorld(
      nodes,
      Array.from({ length: 10 }, (_, community) => community),
    );

    const startedAt = performance.now();
    planBubbleCorridors(world.plan);
    const elapsedMs = performance.now() - startedAt;

    for (let ci = 0; ci < 10; ci++) {
      expect(segmentsSpanAllMembers(world, ci)).toBe(true);
    }
    // Movement-gated replans happen a handful of times per settle; even at
    // per-frame cadence this must stay far below a 60 fps frame.
    expect(elapsedMs).toBeLessThan(50);
    process.stdout.write(
      `[bubble-corridors] full plan: 10 communities × 100 members + 1000 obstacles = ${elapsedMs.toFixed(2)} ms\n`,
    );

    // Steady-state per-frame ADDED cost (no replan): the segment-endpoint
    // Texel refresh mirrors the loop in render/community.ts.
    const { plan } = world;
    const totalMembers = 1000;
    const segmentTexelBase = totalMembers;
    const texels = new Float32Array(
      (totalMembers + plan.segmentRadius.length * 2) * 4,
    );
    texels.set(plan.pointTexels);
    const frames = 1000;
    const refillStart = performance.now();
    for (let frame = 0; frame < frames; frame++) {
      for (let ci = 0; ci < plan.keptCount; ci++) {
        const storageStart = plan.segmentStorageOffsets[ci]!;
        const segmentCount = plan.segmentCounts[ci]!;
        for (let segment = 0; segment < segmentCount; segment++) {
          const storage = storageStart + segment;
          const slotA = plan.segmentSlots[storage * 2]!;
          const slotB = plan.segmentSlots[storage * 2 + 1]!;
          const texel = (segmentTexelBase + storage * 2) * 4;
          texels[texel] = texels[slotA * 4]!;
          texels[texel + 1] = texels[slotA * 4 + 1]!;
          texels[texel + 2] = plan.segmentRadius[storage]!;
          texels[texel + 4] = texels[slotB * 4]!;
          texels[texel + 5] = texels[slotB * 4 + 1]!;
        }
      }
    }
    const perFrameMs = (performance.now() - refillStart) / frames;
    expect(perFrameMs).toBeLessThan(1);
    process.stdout.write(
      `[bubble-corridors] per-frame segment refill (~${plan.segmentRadius.length} segment capacity) = ${(perFrameMs * 1000).toFixed(1)} µs\n`,
    );
  });
});
