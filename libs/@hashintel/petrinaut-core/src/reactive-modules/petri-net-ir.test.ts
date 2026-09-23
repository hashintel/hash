import { describe, expect, it } from "vitest";

import {
  type PetriNetIr,
  petriNetIrArcWeight,
  petriNetIrInitialTokens,
  petriNetIrPlaceCapacity,
  renderPetriNetIr,
  resolveZerothTarget,
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
});

describe("zerothTargetForNet", () => {
  const stochastic: Pick<PetriNetIr, "kind" | "transitions"> = {
    kind: "stochastic",
    transitions: { Arrive: { rate: 2 } },
  };
  const controllable: Pick<PetriNetIr, "kind" | "transitions"> = {
    kind: "plain",
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
      marking: "real",
      control: "closed",
      dt: 1,
    });
    expect(resolveZerothTarget({ shape: "modular" }).shape).toBe("modular");
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
