import { describe, expect, it } from "vitest";

import {
  type PetriNetIr,
  petriNetIrArcWeight,
  petriNetIrPlaceCapacity,
  petriNetIrPlaceInitial,
  renderPetriNetIr,
} from "./petri-net-ir";

export const cycleIr: PetriNetIr = {
  name: "cycle",
  description: "One token alternates between two places.",
  kind: "plain",
  places: { A: { initial: 1 }, B: null, C: { capacity: 3 } },
  transitions: {
    Go: { inputs: { A: null }, outputs: { B: { weight: 2 } } },
    Back: { inputs: { B: null }, outputs: { C: null } },
  },
};

describe("renderPetriNetIr", () => {
  it("writes block YAML with bare keys for defaulted entries", () => {
    expect(renderPetriNetIr(cycleIr)).toBe(
      [
        "name: cycle",
        "description: One token alternates between two places.",
        "kind: plain",
        "places:",
        "  A:",
        "    initial: 1",
        "  B:",
        "  C:",
        "    capacity: 3",
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

  it("keeps record order and writes a stochastic rate after the arcs", () => {
    const rendered = renderPetriNetIr({
      name: "arrivals",
      kind: "stochastic",
      places: { Arrived: null },
      transitions: { Arrive: { outputs: { Arrived: null }, rate: 2 } },
    });
    expect(rendered).toBe(
      "name: arrivals\nkind: stochastic\nplaces:\n  Arrived:\ntransitions:\n  Arrive:\n    outputs:\n      Arrived:\n    rate: 2\n",
    );
  });
});

describe("IR accessors", () => {
  it("read the defaults behind bare keys", () => {
    expect(petriNetIrArcWeight(null)).toBe(1);
    expect(petriNetIrArcWeight({ weight: 3 })).toBe(3);
    expect(petriNetIrPlaceInitial(null)).toBe(0);
    expect(petriNetIrPlaceInitial({ initial: 4 })).toBe(4);
    expect(petriNetIrPlaceCapacity(null)).toBeUndefined();
    expect(petriNetIrPlaceCapacity({ capacity: 0 })).toBe(0);
  });
});
