import { describe, expect, it } from "vitest";

import {
  type PetriNetIr,
  petriNetIrArcWeight,
  petriNetIrInitialTokens,
  petriNetIrPlaceCapacity,
  renderPetriNetIr,
} from "./petri-net-ir";

export const cycleIr: PetriNetIr = {
  name: "cycle",
  description: "One token alternates between two places.",
  kind: "plain",
  places: { A: null, B: null, C: { capacity: 3 } },
  initial: { A: 1 },
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
        "initial:",
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

  it("leaves the initial section out when every place starts empty", () => {
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

describe("IR accessors", () => {
  it("read the defaults behind bare keys", () => {
    expect(petriNetIrArcWeight(null)).toBe(1);
    expect(petriNetIrArcWeight({ weight: 3 })).toBe(3);
    expect(petriNetIrInitialTokens({}, "A")).toBe(0);
    expect(petriNetIrInitialTokens({ initial: { A: 4 } }, "A")).toBe(4);
    expect(petriNetIrInitialTokens({ initial: { A: 4 } }, "B")).toBe(0);
    expect(petriNetIrPlaceCapacity(null)).toBeUndefined();
    expect(petriNetIrPlaceCapacity({ capacity: 0 })).toBe(0);
  });
});
