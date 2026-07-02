import { describe, expect, it } from "vitest";

import { EntityIndex, nodeIdForEntityIndex, TypeSetId } from "../../../ids";
import { PositionScratch } from "../../collections/position-scratch";
import { radiusForDegree } from "../../entity-style";
import { LinkStore } from "../../store/link";
import { seedFlatNodes } from "./flat-seed";

const TYPE = TypeSetId(0);

/** World-unit offset a streamed node is seeded at, from flat-seed.ts. */
const NEIGHBOUR_OFFSET = 24;

let nextLinkEntity = 1000;
function link(links: LinkStore, left: number, right: number): void {
  links.insert(
    EntityIndex(left),
    EntityIndex(right),
    TYPE,
    EntityIndex(nextLinkEntity++),
  );
}

function scratchWith(
  entries: readonly (readonly [number, number, number])[],
): PositionScratch<EntityIndex> {
  const scratch = new PositionScratch<EntityIndex>();
  scratch.reset(64);
  for (const [idx, x, y] of entries) {
    scratch.set(EntityIndex(idx), x, y);
  }
  return scratch;
}

// ForceNode declares x/y optional (unseeded nodes); seeded output always has them.
const distance = (
  a: { x?: number; y?: number },
  b: { x?: number; y?: number },
) =>
  Math.hypot(
    (a.x ?? Number.NaN) - (b.x ?? Number.NaN),
    (a.y ?? Number.NaN) - (b.y ?? Number.NaN),
  );

describe("seedFlatNodes", () => {
  it("keeps prior positions exactly and records radii from link degree", () => {
    const links = new LinkStore();
    link(links, 0, 1);

    const nodes = seedFlatNodes(
      [EntityIndex(0), EntityIndex(1)],
      scratchWith([
        [0, 100, -50],
        [1, 130, -50],
      ]),
      links,
    );

    expect(nodes[0]).toEqual({
      id: nodeIdForEntityIndex(EntityIndex(0)),
      x: 100,
      y: -50,
      radius: radiusForDegree(1),
    });
    expect(nodes[1]!.x).toBe(130);
    expect(nodes[1]!.y).toBe(-50);
  });

  it("seeds an unplaced node one neighbour-offset away from a placed link neighbour", () => {
    const links = new LinkStore();
    link(links, 0, 1);

    const nodes = seedFlatNodes(
      [EntityIndex(0), EntityIndex(1)],
      scratchWith([[0, 100, 50]]),
      links,
    );

    expect(distance(nodes[1]!, nodes[0]!)).toBeCloseTo(NEIGHBOUR_OFFSET, 6);
  });

  it("cascades placement along link chains within one call", () => {
    const links = new LinkStore();
    link(links, 0, 1);
    link(links, 1, 2);

    // Node 2 precedes its (initially unplaced) neighbour 1 in input order, so
    // placement needs the outward-growth sweep to repeat.
    const nodes = seedFlatNodes(
      [EntityIndex(2), EntityIndex(1), EntityIndex(0)],
      scratchWith([[0, 0, 0]]),
      links,
    );

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const node0 = byId.get(nodeIdForEntityIndex(EntityIndex(0)))!;
    const node1 = byId.get(nodeIdForEntityIndex(EntityIndex(1)))!;
    const node2 = byId.get(nodeIdForEntityIndex(EntityIndex(2)))!;

    expect(distance(node1, node0)).toBeCloseTo(NEIGHBOUR_OFFSET, 6);
    expect(distance(node2, node1)).toBeCloseTo(NEIGHBOUR_OFFSET, 6);
  });

  it("places orphans deterministically on distinct positions", () => {
    const links = new LinkStore();
    const orphanIdxs = [EntityIndex(0), EntityIndex(1), EntityIndex(2)];

    const first = seedFlatNodes(orphanIdxs, scratchWith([]), links);
    const second = seedFlatNodes(orphanIdxs, scratchWith([]), links);

    expect(second).toEqual(first);
    const positions = new Set(first.map((node) => `${node.x},${node.y}`));
    expect(positions.size).toBe(first.length);
  });

  it("extends the scratch in place so every input index ends up placed", () => {
    const links = new LinkStore();
    link(links, 0, 1);
    const scratch = scratchWith([[0, 10, 10]]);

    seedFlatNodes(
      [EntityIndex(0), EntityIndex(1), EntityIndex(2)],
      scratch,
      links,
    );

    expect(scratch.has(EntityIndex(1))).toBe(true);
    expect(scratch.has(EntityIndex(2))).toBe(true);
  });
});
