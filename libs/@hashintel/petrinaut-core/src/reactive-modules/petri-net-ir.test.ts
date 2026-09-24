import { describe, expect, it } from "vitest";

import {
  type PetriNetIr,
  petriNetIrArcWeight,
  petriNetIrConflictingTransitions,
  petriNetIrInitialTokens,
  petriNetIrKindOf,
  petriNetIrPlaceCapacity,
  renderPetriNetIr,
  resolveZerothTarget,
  zerothTargetComposes,
  zerothTargetForNet,
} from "./petri-net-ir";

export const cycleIr: PetriNetIr = {
  name: "cycle",
  description: "One token alternates between two places.",
  kind: "plain",
  places: { A: null, B: null, C: { capacity: 3 } },
  marking: { A: 1 },
  transitions: {
    Go: { inputs: { A: null }, outputs: { B: { weight: 2 } } },
    Back: { inputs: { B: null }, outputs: { C: null } },
  },
};

describe("renderPetriNetIr", () => {
  it("writes block YAML with bare keys for defaulted entries and a blank line between sections", () => {
    expect(renderPetriNetIr(cycleIr)).toBe(
      [
        "name: cycle",
        "description: One token alternates between two places.",
        "kind: plain",
        "",
        "places:",
        "  A:",
        "  B:",
        "  C:",
        "    capacity: 3",
        "",
        "marking:",
        "  A: 1",
        "",
        "transitions:",
        "  Go:",
        "    inputs:",
        "      A:",
        "    outputs:",
        "      B:",
        "        weight: 2",
        "  Back:",
        "    inputs:",
        "      B:",
        "    outputs:",
        "      C:",
        "",
      ].join("\n"),
    );
  });

  it("leaves the marking section out when every place starts empty", () => {
    const rendered = renderPetriNetIr({
      name: "arrivals",
      kind: "stochastic",
      places: { Arrived: null },
      transitions: { Arrive: { outputs: { Arrived: null }, rate: 2 } },
    });
    expect(rendered).toBe(
      "name: arrivals\nkind: stochastic\n\nplaces:\n  Arrived:\n\ntransitions:\n  Arrive:\n    outputs:\n      Arrived:\n    rate: 2\n",
    );
  });
});

describe("renderPetriNetIr with a zeroth section", () => {
  it("writes the compiler flags as the last section", () => {
    const rendered = renderPetriNetIr({
      name: "arrivals",
      kind: "stochastic",
      places: { Arrived: null },
      transitions: {
        Arrive: { outputs: { Arrived: null }, rate: 2, controllable: true },
      },
      zeroth: { shape: "modular", marking: "int", control: "open", dt: 0.5 },
    });
    expect(rendered).toBe(
      [
        "name: arrivals",
        "kind: stochastic",
        "",
        "places:",
        "  Arrived:",
        "",
        "transitions:",
        "  Arrive:",
        "    outputs:",
        "      Arrived:",
        "    rate: 2",
        "    controllable: true",
        "",
        "zeroth:",
        "  shape: modular",
        "  marking: int",
        "  control: open",
        "  dt: 0.5",
        "",
      ].join("\n"),
    );
  });

  it("writes the rates flag between the shape and the marking", () => {
    expect(
      renderPetriNetIr({
        name: "arrivals",
        kind: "stochastic",
        places: { Arrived: null },
        transitions: { Arrive: { outputs: { Arrived: null }, rate: 2 } },
        zeroth: { shape: "modular", rates: "clock", marking: "int" },
      }),
    ).toContain(
      "\nzeroth:\n  shape: modular\n  rates: clock\n  marking: int\n",
    );
  });

  it("writes the conflicts flag after the rates", () => {
    expect(
      renderPetriNetIr({
        name: "fork",
        kind: "stochastic",
        places: { Pool: null },
        transitions: {
          Left: { inputs: { Pool: null }, rate: 1 },
          Right: { inputs: { Pool: null }, rate: 2 },
        },
        zeroth: { rates: "clock", conflicts: "nondet", layout: "per-module" },
      }),
    ).toContain(
      "\nzeroth:\n  rates: clock\n  conflicts: nondet\n  layout: per-module\n",
    );
  });
});

describe("petriNetIrConflictingTransitions", () => {
  it("names the transitions that share an input place, read arcs included, in record order", () => {
    expect([
      ...petriNetIrConflictingTransitions({
        Lone: { inputs: { A: null } },
        Right: { inputs: { Pool: null, B: null } },
        Left: { inputs: { Pool: { kind: "read" } } },
        Source: { outputs: { Pool: null } },
      }),
    ]).toEqual(["Right", "Left"]);
    expect(
      petriNetIrConflictingTransitions({
        Go: { inputs: { A: null }, outputs: { B: null } },
        Back: { inputs: { B: null }, outputs: { A: null } },
      }).size,
    ).toBe(0);
  });
});

describe("renderPetriNetIr with colours, dynamics and code", () => {
  it("writes code as literal blocks and a token's attributes on one line", () => {
    const rendered = renderPetriNetIr({
      name: "drone_patrol",
      kind: "mixed",
      colours: {
        Drone: { battery: "real", state: { enum: ["idle", "flying"] } },
      },
      dynamics: {
        Drain: {
          colour: "Drone",
          code: "return tokens.map((drone) => ({ battery: -2.5 }));",
        },
      },
      places: {
        Hangar: { colour: "Drone", capacity: 16 },
        Airborne: { colour: "Drone", dynamics: "Drain" },
        Sorties: null,
      },
      marking: {
        Hangar: [
          { battery: 100, state: "idle" },
          { battery: 80, state: "idle" },
        ],
        Sorties: 2,
      },
      transitions: {
        Launch: {
          inputs: { Hangar: null, Sorties: { kind: "read" } },
          outputs: { Airborne: null, Sorties: null },
          rate: "return 0.6 * (input.Hangar[0].battery / 100);",
          kernel:
            'const drone = input.Hangar[0];\nreturn { Airborne: [{ battery: drone.battery, state: "flying" }] };',
        },
        Land: {
          inputs: { Airborne: null, Sorties: { weight: 5, kind: "inhibitor" } },
          outputs: { Hangar: null },
          guard: "return input.Airborne[0].battery < 20;",
          kernel: 'return { Hangar: [{ battery: 100, state: "idle" }] };',
        },
      },
    });
    expect(rendered).toBe(
      [
        "name: drone_patrol",
        "kind: mixed",
        "",
        "colours:",
        "  Drone:",
        "    battery: real",
        "    state:",
        "      enum:",
        "        - idle",
        "        - flying",
        "",
        "dynamics:",
        "  Drain:",
        "    colour: Drone",
        "    code: |",
        "      return tokens.map((drone) => ({ battery: -2.5 }));",
        "",
        "places:",
        "  Hangar:",
        "    colour: Drone",
        "    capacity: 16",
        "  Airborne:",
        "    colour: Drone",
        "    dynamics: Drain",
        "  Sorties:",
        "",
        "marking:",
        "  Hangar:",
        "    - {battery: 100, state: idle}",
        "    - {battery: 80, state: idle}",
        "  Sorties: 2",
        "",
        "transitions:",
        "  Launch:",
        "    inputs:",
        "      Hangar:",
        "      Sorties:",
        "        kind: read",
        "    outputs:",
        "      Airborne:",
        "      Sorties:",
        "    rate: |",
        "      return 0.6 * (input.Hangar[0].battery / 100);",
        "    kernel: |",
        "      const drone = input.Hangar[0];",
        '      return { Airborne: [{ battery: drone.battery, state: "flying" }] };',
        "  Land:",
        "    inputs:",
        "      Airborne:",
        "      Sorties:",
        "        weight: 5",
        "        kind: inhibitor",
        "    outputs:",
        "      Hangar:",
        "    guard: |",
        "      return input.Airborne[0].battery < 20;",
        "    kernel: |",
        '      return { Hangar: [{ battery: 100, state: "idle" }] };',
        "",
      ].join("\n"),
    );
  });
});

describe("petriNetIrKindOf", () => {
  it("names a net by which transitions carry a rate", () => {
    expect(petriNetIrKindOf({ Go: {}, Back: {} })).toBe("plain");
    expect(
      petriNetIrKindOf({ Go: { rate: 1 }, Back: { rate: "return 2;" } }),
    ).toBe("stochastic");
    expect(petriNetIrKindOf({ Go: { rate: 1 }, Back: {} })).toBe("mixed");
    expect(
      petriNetIrInitialTokens({ marking: { A: [{ x: 1 }, { x: 2 }] } }, "A"),
    ).toBe(2);
  });
});

describe("zerothTargetForNet", () => {
  const stochastic: Pick<PetriNetIr, "kind" | "places" | "transitions"> = {
    kind: "stochastic",
    places: { Arrived: null },
    transitions: { Arrive: { rate: 2 } },
  };
  const controllable: Pick<PetriNetIr, "kind" | "places" | "transitions"> = {
    kind: "plain",
    places: { A: null },
    transitions: { Go: { controllable: true } },
  };

  it("keeps only the flags off their default", () => {
    expect(zerothTargetForNet(undefined, stochastic)).toBeUndefined();
    expect(
      zerothTargetForNet(
        { shape: "monolithic", marking: "real", control: "closed", dt: 1 },
        stochastic,
      ),
    ).toBeUndefined();
    expect(
      zerothTargetForNet(
        { shape: "modular", marking: "int", dt: 0.5 },
        stochastic,
      ),
    ).toEqual({ shape: "modular", marking: "int", dt: 0.5 });
  });

  it("drops the flags that do not apply to the net", () => {
    expect(
      zerothTargetForNet({ marking: "int", dt: 0.5, control: "open" }, cycleIr),
    ).toBeUndefined();
    expect(
      zerothTargetForNet({ marking: "int", control: "open" }, controllable),
    ).toEqual({ control: "open" });
  });

  it("resolves every flag to a value", () => {
    expect(resolveZerothTarget(undefined)).toEqual({
      shape: "monolithic",
      rates: "coin",
      conflicts: "sweep",
      marking: "real",
      control: "closed",
      dt: 1,
      slots: 8,
      layout: "single",
      syntax: "update",
    });
    expect(resolveZerothTarget({ shape: "modular" }).shape).toBe("modular");
    expect(zerothTargetForNet({ syntax: "next" }, stochastic)).toEqual({
      syntax: "next",
    });
  });

  it("keeps the rates flag for a stochastic net without colours or dynamics, and drops the step flags under clocks", () => {
    const busy = {
      rates: "clock" as const,
      shape: "modular" as const,
      marking: "int" as const,
      control: "open" as const,
      dt: 0.5,
      syntax: "next" as const,
      layout: "per-module" as const,
    };
    const rated: Pick<PetriNetIr, "kind" | "places" | "transitions"> = {
      kind: "stochastic",
      places: { Arrived: null },
      transitions: { Arrive: { rate: 2, controllable: true } },
    };
    expect(zerothTargetForNet(busy, rated)).toEqual({
      rates: "clock",
      layout: "per-module",
    });
    expect(zerothTargetForNet(busy, cycleIr)).toEqual({
      shape: "modular",
      syntax: "next",
      layout: "per-module",
    });
    expect(
      zerothTargetForNet(
        { rates: "clock" },
        {
          kind: "stochastic",
          places: { Pool: { colour: "Ball" } },
          transitions: { Take: { inputs: { Pool: null }, rate: 1 } },
        },
      ),
    ).toBeUndefined();
    expect(zerothTargetForNet({ rates: "coin" }, rated)).toBeUndefined();
  });

  it("keeps the conflicts flag for a net where two transitions share an input place, under either rates", () => {
    const fork: Pick<PetriNetIr, "kind" | "places" | "transitions"> = {
      kind: "stochastic",
      places: { Pool: null },
      transitions: {
        Left: { inputs: { Pool: null }, rate: 1 },
        Right: { inputs: { Pool: null }, rate: 2 },
      },
    };
    expect(zerothTargetForNet({ conflicts: "nondet" }, fork)).toEqual({
      conflicts: "nondet",
    });
    expect(
      zerothTargetForNet({ rates: "clock", conflicts: "nondet" }, fork),
    ).toEqual({ rates: "clock", conflicts: "nondet" });
    expect(zerothTargetForNet({ conflicts: "sweep" }, fork)).toBeUndefined();
    expect(
      zerothTargetForNet({ conflicts: "nondet" }, stochastic),
    ).toBeUndefined();
    expect(
      zerothTargetForNet({ conflicts: "nondet" }, cycleIr),
    ).toBeUndefined();
  });

  it("says which flags compose the modules", () => {
    expect(zerothTargetComposes(resolveZerothTarget(undefined))).toBe(false);
    expect(
      zerothTargetComposes(resolveZerothTarget({ shape: "modular" })),
    ).toBe(true);
    expect(zerothTargetComposes(resolveZerothTarget({ rates: "clock" }))).toBe(
      true,
    );
  });

  it("keeps the layout only under the modular shape", () => {
    expect(
      zerothTargetForNet({ layout: "per-module" }, stochastic),
    ).toBeUndefined();
    expect(
      zerothTargetForNet({ shape: "modular", layout: "single" }, stochastic),
    ).toEqual({ shape: "modular" });
    expect(
      zerothTargetForNet(
        { shape: "modular", layout: "per-module" },
        stochastic,
      ),
    ).toEqual({ shape: "modular", layout: "per-module" });
  });
});

describe("IR accessors", () => {
  it("read the defaults behind bare keys", () => {
    expect(petriNetIrArcWeight(null)).toBe(1);
    expect(petriNetIrArcWeight({ weight: 3 })).toBe(3);
    expect(petriNetIrInitialTokens({}, "A")).toBe(0);
    expect(petriNetIrInitialTokens({ marking: { A: 4 } }, "A")).toBe(4);
    expect(petriNetIrInitialTokens({ marking: { A: 4 } }, "B")).toBe(0);
    expect(petriNetIrPlaceCapacity(null)).toBeUndefined();
    expect(petriNetIrPlaceCapacity({ capacity: 0 })).toBe(0);
  });
});
