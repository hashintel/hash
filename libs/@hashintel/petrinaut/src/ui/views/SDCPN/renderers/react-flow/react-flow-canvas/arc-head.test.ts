import { describe, expect, it } from "vitest";

import { arcHeadOf, arcHeadsOf } from "./arc-head";

import type { CanvasArc } from "../../../canvas-scene";

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
  it("wears the arc's colour, and the casing's colour at the focused item", () => {
    expect(arcHeadOf("canvas", arc({}))).toMatchObject({
      color: "#123456",
      inFocus: false,
    });

    const incoming = arcHeadOf("canvas", arc({ focus: "incoming" }));
    expect(incoming.inFocus).toBe(true);
    expect(incoming.color).not.toBe("#123456");
    expect(incoming.color).not.toBe(
      arcHeadOf("canvas", arc({ focus: "outgoing" })).color,
    );
  });

  it("is another marker on another canvas", () => {
    expect(arcHeadOf("one", arc({})).id).not.toBe(arcHeadOf("two", arc({})).id);
  });
});

describe("the heads a canvas draws", () => {
  it("draws one head per colour, however many arcs wear it", () => {
    const heads = arcHeadsOf("canvas", [
      arc({ id: "a" }),
      arc({ id: "b" }),
      arc({ id: "c", color: "#abcdef" }),
    ]);

    expect(heads.map((head) => head.color).sort()).toEqual([
      "#123456",
      "#abcdef",
    ]);
  });

  it("keeps the heads of the arcs in focus apart from those that fade", () => {
    const heads = arcHeadsOf("canvas", [
      arc({ id: "a" }),
      arc({ id: "b", focus: "incoming" }),
      arc({ id: "c", focus: "incoming", color: "#abcdef" }),
    ]);

    expect(heads.filter((head) => head.inFocus)).toHaveLength(1);
    expect(heads.filter((head) => !head.inFocus)).toHaveLength(1);
    expect(new Set(heads.map((head) => head.id)).size).toBe(2);
  });

  it("draws none for an arc that ends in a mark of its own", () => {
    expect(
      arcHeadsOf("canvas", [arc({ kind: "read" }), arc({ kind: "inhibitor" })]),
    ).toEqual([]);
  });

  it("lists the heads in the same order whatever order the arcs come in", () => {
    const arcs = [arc({ id: "a" }), arc({ id: "b", color: "#abcdef" })];

    expect(arcHeadsOf("canvas", arcs)).toEqual(
      arcHeadsOf("canvas", [...arcs].reverse()),
    );
  });
});
