import { describe, expect, it } from "vitest";

import { arcHeadOf, arcHeadPath, arcHeadsOf } from "./arc-head";

import type { CanvasArc, CanvasPoint } from "../../../canvas-scene";

const arc = (overrides: Partial<CanvasArc>): CanvasArc => ({
  id: "arc",
  kind: "standard",
  weight: 1,
  sourceId: "place",
  targetId: "transition",
  sourcePortId: null,
  targetPortId: null,
  transitionId: "transition",
  color: "#123456",
  selected: false,
  focus: "none",
  ...overrides,
});

describe("the head of an arc", () => {
  it("carries the arc's colour, and the casing's colour at the focused item", () => {
    expect(arcHeadOf("canvas", arc({}))).toMatchObject({
      color: "#123456",
      haloColor: undefined,
    });

    const incoming = arcHeadOf("canvas", arc({ focus: "incoming" }));
    expect(incoming.color).toBe("#123456");
    expect(incoming.haloColor).toBeDefined();
    expect(incoming.haloColor).not.toBe(
      arcHeadOf("canvas", arc({ focus: "outgoing" })).haloColor,
    );
  });

  it("is one marker per colour and role", () => {
    const ids = [
      arcHeadOf("canvas", arc({})),
      arcHeadOf("canvas", arc({ focus: "incoming" })),
      arcHeadOf("canvas", arc({ focus: "outgoing" })),
      arcHeadOf("canvas", arc({ focus: "incoming", color: "#abcdef" })),
    ].map((head) => head.id);

    expect(new Set(ids).size).toBe(4);
    expect(arcHeadOf("canvas", arc({ id: "another" })).id).toBe(ids[0]);
  });

  it("is another marker on another canvas", () => {
    expect(arcHeadOf("one", arc({})).id).not.toBe(arcHeadOf("two", arc({})).id);
  });
});

describe("the heads a canvas draws", () => {
  const idsOf = (arcs: CanvasArc[]) =>
    arcHeadsOf("canvas", arcs).map((head) => head.id);

  it("draws the heads of a colour once, however many arcs wear it", () => {
    const ids = idsOf([
      arc({ id: "a" }),
      arc({ id: "b" }),
      arc({ id: "c", color: "#abcdef" }),
    ]);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(arcHeadOf("canvas", arc({})).id);
    expect(ids).toContain(arcHeadOf("canvas", arc({ color: "#abcdef" })).id);
  });

  // An arc points at the head of a role for longer than it has the role.
  it.each(["focused", "incoming", "outgoing"] as const)(
    "draws the head of an arc that is %s, whether or not an arc is",
    (focus) => {
      expect(idsOf([arc({})])).toContain(
        arcHeadOf("canvas", arc({ focus })).id,
      );
    },
  );

  it("draws none for an arc that ends in a mark of its own", () => {
    expect(
      arcHeadsOf("canvas", [arc({ kind: "read" }), arc({ kind: "inhibitor" })]),
    ).toEqual([]);
  });
});

describe("the head of an arc as a path", () => {
  const numbersOf = (path: string) =>
    [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  /** The corners of a head: each command's last two numbers. */
  const cornersOf = (path: string): CanvasPoint[] =>
    path
      .split(/(?=[MLA])/)
      .map(numbersOf)
      .map((numbers) => ({ x: numbers.at(-2) ?? 0, y: numbers.at(-1) ?? 0 }));

  it("reaches back 11 units from a tip at the end of the arc", () => {
    const corners = cornersOf(arcHeadPath({ x: 100, y: 50 }, { x: 1, y: 0 }));

    expect(Math.min(...corners.map((corner) => corner.x))).toBeCloseTo(89);
    // The round corner at the tip is centred on the end of the arc.
    expect(Math.max(...corners.map((corner) => corner.x))).toBeCloseTo(100.62);
    expect(Math.max(...corners.map((corner) => corner.y))).toBeCloseTo(58.78);
    expect(Math.min(...corners.map((corner) => corner.y))).toBeCloseTo(41.22);
  });

  it("turns with the arc", () => {
    const along = cornersOf(arcHeadPath({ x: 0, y: 0 }, { x: 1, y: 0 }));
    const down = cornersOf(arcHeadPath({ x: 0, y: 0 }, { x: 0, y: 1 }));

    expect(down).toHaveLength(along.length);
    for (const [index, corner] of along.entries()) {
      // A quarter turn clockwise on screen takes (x, y) to (-y, x).
      expect(down[index]?.x).toBeCloseTo(-corner.y);
      expect(down[index]?.y).toBeCloseTo(corner.x);
    }
  });
});
