import { describe, expect, it } from "vitest";

import { applyFusions } from "./apply-fusions";

import type { Color, Place, Transition } from "../types/sdcpn";

const place = (id: string, overrides: Partial<Place> = {}): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
  ...overrides,
});

const transition = (
  id: string,
  overrides: Partial<Transition> = {},
): Transition => ({
  id,
  name: id,
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
  ...overrides,
});

const color = (id: string, elements: Color["elements"]): Color => ({
  id,
  name: id,
  iconSlug: "circle",
  displayColor: "#000",
  elements,
});

describe("applyFusions", () => {
  it("keeps the root place and moves the port's arcs onto it", () => {
    const net = {
      places: [place("buffer"), place("m1::in")],
      transitions: [
        transition("m1::work", {
          inputArcs: [{ placeId: "m1::in", weight: 2, type: "standard" }],
        }),
        transition("feed", {
          outputArcs: [{ placeId: "buffer", weight: 1 }],
        }),
      ],
      types: [],
    };

    const aliases = applyFusions(net, [
      { fusionId: "f1", placeIds: ["buffer", "m1::in"], name: undefined },
    ]);

    expect([...aliases]).toEqual([["m1::in", "buffer"]]);
    expect(net.places.map(({ id }) => id)).toEqual(["buffer"]);
    expect(net.transitions[0]!.inputArcs).toEqual([
      { placeId: "buffer", weight: 2, type: "standard" },
    ]);
  });

  it("fuses two ports into the first one and names it after the fusion", () => {
    const net = {
      places: [place("m1::out"), place("m2::in")],
      transitions: [
        transition("m1::work", {
          outputArcs: [{ placeId: "m1::out", weight: 1 }],
        }),
        transition("m2::work", {
          inputArcs: [{ placeId: "m2::in", weight: 1, type: "standard" }],
        }),
      ],
      types: [],
    };

    const aliases = applyFusions(net, [
      { fusionId: "f1", placeIds: ["m1::out", "m2::in"], name: "Conveyor" },
    ]);

    expect([...aliases]).toEqual([["m2::in", "m1::out"]]);
    expect(net.places).toMatchObject([{ id: "m1::out", name: "Conveyor" }]);
    expect(net.transitions[1]!.inputArcs[0]!.placeId).toBe("m1::out");
  });

  it("chains fusions that share a place into one set led by the outermost place", () => {
    const net = {
      places: [place("a::b::deep"), place("a::mid"), place("top")],
      transitions: [],
      types: [],
    };

    const aliases = applyFusions(net, [
      { fusionId: "f1", placeIds: ["a::b::deep", "a::mid"], name: undefined },
      { fusionId: "f2", placeIds: ["a::mid", "top"], name: undefined },
    ]);

    expect(Object.fromEntries(aliases)).toEqual({
      "a::b::deep": "top",
      "a::mid": "top",
    });
    expect(net.places.map(({ id }) => id)).toEqual(["top"]);
  });

  it("adds the weights of two arcs that land on one fused place", () => {
    const net = {
      places: [place("buffer"), place("m1::in")],
      transitions: [
        transition("take", {
          inputArcs: [
            { placeId: "buffer", weight: 1, type: "standard" },
            { placeId: "m1::in", weight: 2, type: "standard" },
            { placeId: "m1::in", weight: 1, type: "read" },
          ],
        }),
      ],
      types: [],
    };

    applyFusions(net, [
      { fusionId: "f1", placeIds: ["buffer", "m1::in"], name: undefined },
    ]);

    expect(net.transitions[0]!.inputArcs).toEqual([
      { placeId: "buffer", weight: 3, type: "standard" },
      { placeId: "buffer", weight: 1, type: "read" },
    ]);
  });

  it("gives the fused place the capacity and dynamics a member declares", () => {
    const net = {
      places: [
        place("buffer", { colorId: "root_part" }),
        place("m1::in", {
          colorId: "m1::part",
          capacity: 4,
          dynamicsEnabled: true,
          differentialEquationId: "m1::cool",
        }),
      ],
      transitions: [],
      types: [
        color("root_part", [{ elementId: "w", name: "weight", type: "real" }]),
        color("m1::part", [{ elementId: "w", name: "weight", type: "real" }]),
      ],
    };

    applyFusions(net, [
      { fusionId: "f1", placeIds: ["buffer", "m1::in"], name: undefined },
    ]);

    expect(net.places).toMatchObject([
      {
        id: "buffer",
        colorId: "root_part",
        capacity: 4,
        dynamicsEnabled: true,
        differentialEquationId: "m1::cool",
      },
    ]);
  });

  it("throws on members of different token types", () => {
    const net = {
      places: [
        place("buffer", { colorId: "root_part" }),
        place("m1::in", { colorId: "m1::part" }),
      ],
      transitions: [],
      types: [
        color("root_part", [{ elementId: "w", name: "weight", type: "real" }]),
        color("m1::part", [{ elementId: "n", name: "count", type: "integer" }]),
      ],
    };

    expect(() =>
      applyFusions(net, [
        { fusionId: "f1", placeIds: ["buffer", "m1::in"], name: "Shared" },
      ]),
    ).toThrow(/different token types/);
  });
});
