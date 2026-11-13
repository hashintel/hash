import { describe, expect, it } from "vitest";

import { pinLayout, portOnSide } from "./pin-layout";

import type { CanvasPort } from "../../../canvas-scene";
import type { PortDirection } from "@hashintel/petrinaut-core";

const port = (id: string, direction: PortDirection): CanvasPort => ({
  id,
  name: id,
  direction,
  typeColor: undefined,
});

// A 48 px header and a 6 px footer leave this card a 120 px body.
const height = 174;

describe("portOnSide", () => {
  it("pins an input on the left, an output on the right, a two-way port on both", () => {
    expect(portOnSide("in", "left")).toBe(true);
    expect(portOnSide("in", "right")).toBe(false);
    expect(portOnSide("out", "left")).toBe(false);
    expect(portOnSide("out", "right")).toBe(true);
    expect(portOnSide("inout", "left")).toBe(true);
    expect(portOnSide("inout", "right")).toBe(true);
  });
});

describe("pinLayout", () => {
  it("gives every port a row of its own when unfolded", () => {
    const rows = pinLayout(
      [port("a", "in"), port("b", "out"), port("c", "inout")],
      height,
      true,
    );

    expect(rows.map(({ left }) => left)).toEqual([68, 108, 148]);
    expect(rows.map(({ right }) => right)).toEqual([68, 108, 148]);
  });

  it("spreads a folded card's pins along the side each port uses", () => {
    const rows = pinLayout(
      [port("a", "in"), port("b", "out"), port("c", "in"), port("d", "in")],
      height,
      false,
    );

    // Three inputs share the left edge, the one output has the right edge.
    expect(rows.map(({ left }) => left)).toEqual([68, 108, 108, 148]);
    expect(rows.map(({ right }) => right)).toEqual([68, 108, 108, 148]);
  });

  it("keeps a two-way port's pins on the row each side gives it", () => {
    const [input, both] = pinLayout(
      [port("a", "in"), port("b", "inout")],
      height,
      false,
    );

    expect(input).toMatchObject({ left: 78, right: 78 });
    expect(both).toMatchObject({ left: 138, right: 108 });
  });

  it("lays out a card with no ports", () => {
    expect(pinLayout([], height, false)).toEqual([]);
    expect(pinLayout([], height, true)).toEqual([]);
  });
});
