import { describe, expect, it } from "vitest";

import { applyFusions } from "./apply-fusions";

import type { Color, Place, Transition } from "../types/sdcpn";

const place = (id: string, overrides: Partial<Place> = {}): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
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

    const { aliases } = applyFusions(net, [
      { label: "f1", placeIds: ["buffer", "m1::in"] },
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

    const { aliases } = applyFusions(net, [
      { label: "f1", placeIds: ["m1::out", "m2::in"], name: "Conveyor" },
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

    const { aliases } = applyFusions(net, [
      { label: "f1", placeIds: ["a::b::deep", "a::mid"] },
      { label: "f2", placeIds: ["a::mid", "top"] },
    ]);

    expect(Object.fromEntries(aliases)).toEqual({
      "a::b::deep": "top",
      "a::mid": "top",
    });
    expect(net.places.map(({ id }) => id)).toEqual(["top"]);
  });

  it("leaves a place fused in from outside its own name, whatever an inner fusion is called", () => {
    const net = {
      places: [place("a::b::deep"), place("a::mid"), place("top")],
      transitions: [],
      types: [],
    };

    applyFusions(net, [
      { label: "f1", placeIds: ["a::b::deep", "a::mid"], name: "Inner" },
      { label: "f2", placeIds: ["a::mid", "top"] },
    ]);

    expect(net.places).toMatchObject([{ id: "top", name: "top" }]);
  });

  it("keeps arcs of different kinds onto one fused place apart, in their order", () => {
    const net = {
      places: [place("buffer"), place("m1::in")],
      transitions: [
        transition("take", {
          inputArcs: [
            { placeId: "buffer", weight: 1, type: "standard" },
            { placeId: "m1::in", weight: 1, type: "read" },
          ],
        }),
      ],
      types: [],
    };

    applyFusions(net, [{ label: "f1", placeIds: ["buffer", "m1::in"] }]);

    expect(net.transitions[0]!.inputArcs).toEqual([
      { placeId: "buffer", weight: 1, type: "standard" },
      { placeId: "buffer", weight: 1, type: "read" },
    ]);
  });

  it("throws when a transition reaches one fused place through two arcs of a kind", () => {
    const fusedTwice = (arcs: Partial<Transition>) => ({
      places: [place("buffer"), place("m1::in")],
      transitions: [transition("take", arcs)],
      types: [],
    });
    const groups = [{ label: "f1", placeIds: ["buffer", "m1::in"] }];

    expect(() =>
      applyFusions(
        fusedTwice({
          inputArcs: [
            { placeId: "buffer", weight: 1, type: "standard" },
            { placeId: "m1::in", weight: 2, type: "standard" },
          ],
        }),
        groups,
      ),
    ).toThrow(/`take` reaches one fused place through two arcs/);
    expect(() =>
      applyFusions(
        fusedTwice({
          outputArcs: [
            { placeId: "m1::in", weight: 1 },
            { placeId: "buffer", weight: 1 },
          ],
        }),
        groups,
      ),
    ).toThrow(/two arcs of the same kind/);
  });

  it("gives the fused place the capacity and dynamics a member declares", () => {
    const net = {
      places: [
        place("buffer", { colorId: "root_part" }),
        place("m1::in", {
          colorId: "m1::part",
          capacity: 4,
          dynamicsEnabled: true,
          dynamics: [{ differentialEquationId: "m1::cool" }],
        }),
      ],
      transitions: [],
      types: [
        color("root_part", [{ elementId: "w", name: "weight", type: "real" }]),
        color("m1::part", [{ elementId: "w", name: "weight", type: "real" }]),
      ],
    };

    const { dynamicsDonors } = applyFusions(net, [
      { label: "f1", placeIds: ["buffer", "m1::in"] },
    ]);

    expect(net.places).toMatchObject([
      {
        id: "buffer",
        colorId: "root_part",
        capacity: 4,
        dynamicsEnabled: true,
        dynamics: [{ differentialEquationId: "m1::cool" }],
      },
    ]);
    // The equations came with `m1::in`, so its parameter values go with them.
    expect([...dynamicsDonors]).toEqual([["buffer", "m1::in"]]);
  });

  it("lets two instances of one component share the dynamics of a fused port", () => {
    const cooled = (id: string, instance: string) =>
      place(id, {
        dynamicsEnabled: true,
        dynamics: [{ differentialEquationId: `${instance}::cool` }],
      });
    const net = {
      places: [cooled("a::bath", "a"), cooled("b::bath", "b")],
      transitions: [],
      types: [],
    };

    const { dynamicsDonors } = applyFusions(net, [
      { label: "f1", placeIds: ["a::bath", "b::bath"] },
    ]);

    expect(net.places).toMatchObject([
      { id: "a::bath", dynamics: [{ differentialEquationId: "a::cool" }] },
    ]);
    expect(dynamicsDonors.size).toBe(0);
  });

  it("throws on members that run different equations, or hold different capacities", () => {
    const groups = [{ label: "f1", placeIds: ["a::bath", "b::bath"] }];
    const running = (id: string, equationId: string) =>
      place(id, {
        dynamicsEnabled: true,
        dynamics: [{ differentialEquationId: equationId }],
      });

    expect(() =>
      applyFusions(
        {
          places: [
            running("a::bath", "a::cool"),
            running("b::bath", "b::heat"),
          ],
          transitions: [],
          types: [],
        },
        groups,
      ),
    ).toThrow(/different differential equations/);
    expect(() =>
      applyFusions(
        {
          places: [
            place("a::bath", { capacity: 3 }),
            place("b::bath", { capacity: 5 }),
          ],
          transitions: [],
          types: [],
        },
        groups,
      ),
    ).toThrow(/different capacities/);
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
        { label: "f1", placeIds: ["buffer", "m1::in"], name: "Shared" },
      ]),
    ).toThrow(/different token types/);
  });
});
