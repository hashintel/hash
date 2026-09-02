import { describe, expect, it } from "vitest";

import { sirModel } from "../examples/sir-model";
import { supplyChainWithDisruption } from "../examples/supply-chain-with-disruption";
import { PAIR_EXACT_TOKEN_LIMIT } from "./compile-net-shader/pair-selection";
import { assessGpuEligibility, formatGpuIneligibility } from "./eligibility";

import type { Color, Place, SDCPN, Transition } from "../types/sdcpn";

function place(id: string, overrides: Partial<Place> = {}): Place {
  return {
    id,
    name: id,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
    ...overrides,
  };
}

function transition(
  id: string,
  inputArcs: Transition["inputArcs"] = [],
  outputArcs: Transition["outputArcs"] = [],
): Transition {
  return {
    id,
    name: id,
    inputArcs,
    outputArcs,
    lambdaType: "predicate",
    lambdaCode: "export default Lambda(() => true);",
    transitionKernelCode: "export default TransitionKernel(() => ({}));",
    x: 0,
    y: 0,
  };
}

function color(id: string, elements: Color["elements"]): Color {
  return {
    id,
    name: id,
    iconSlug: "circle",
    displayColor: "#00FF00",
    elements,
  };
}

function net(overrides: Partial<SDCPN>): SDCPN {
  return {
    types: [],
    places: [],
    transitions: [],
    differentialEquations: [],
    parameters: [],
    ...overrides,
  };
}

describe("assessGpuEligibility", () => {
  it("accepts an uncoloured net, the case the backend handles best", () => {
    const result = assessGpuEligibility(sirModel.petriNetDefinition);

    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.profile.uncolouredOnly).toBe(true);
    // Three counts, two transitions x (elapsed + firings), rng, status = 9 words.
    expect(result.profile.bytesPerRun).toBe(28);
  });

  it("derives a capacity for a typed place that declares none", () => {
    const result = assessGpuEligibility(
      net({
        types: [color("c", [{ elementId: "x", name: "x", type: "real" }])],
        places: [place("p", { colorId: "c" })],
        transitions: [transition("t", [], [{ placeId: "p", weight: 1 }])],
      }),
    );

    // No refusal: the backend probes a slab and calibrates it — see
    // `gpu-experiment-handle.ts`. The profile marks the place so the shader
    // detects overflow instead of blocking firings.
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    const typed = result.profile.places.find((entry) => entry.id === "p");
    expect(typed?.capacitySource).toBe("derived");
    expect(typed?.capacity).toBe(0);
  });

  it("accepts a typed place once it declares a capacity", () => {
    const result = assessGpuEligibility(
      net({
        types: [
          color("c", [
            { elementId: "x", name: "x", type: "real" },
            { elementId: "n", name: "n", type: "integer" },
          ]),
        ],
        places: [place("p", { colorId: "c", capacity: 4 })],
        transitions: [transition("t", [], [{ placeId: "p", weight: 1 }])],
      }),
    );

    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    const [profilePlace] = result.profile.places;
    expect(profilePlace?.realFields).toStrictEqual(["x"]);
    expect(profilePlace?.discreteFields).toStrictEqual(["n"]);
    expect(result.profile.uncolouredOnly).toBe(false);
  });

  it.each(["string", "uuid"] as const)(
    "rejects a %s attribute, which needs more than 32 bits",
    (type) => {
      const result = assessGpuEligibility(
        net({
          types: [color("c", [{ elementId: "s", name: "s", type }])],
          places: [place("p", { colorId: "c", capacity: 2 })],
          transitions: [transition("t", [], [{ placeId: "p", weight: 1 }])],
        }),
      );

      expect(result.eligible).toBe(false);
      if (result.eligible) return;
      expect(result.reasons.map((reason) => reason.code)).toContain(
        "unsupported-attribute-type",
      );
    },
  );

  it("allows a pair arc on a typed place, which has a closed-form unranking", () => {
    // Weight 2 maps a flat index to the k-th pair in the engine's own order
    // (`pair-selection.ts`), so the scan keeps the CPU's first-passing choice.
    const result = assessGpuEligibility(
      net({
        types: [color("c", [{ elementId: "x", name: "x", type: "real" }])],
        places: [place("p", { colorId: "c", capacity: 8 })],
        transitions: [
          transition("t", [{ placeId: "p", weight: 2, type: "standard" }], []),
        ],
      }),
    );

    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.profile.places[0]?.pairConsumed).toBe(true);
  });

  it("rejects a pair arc on a typed place whose capacity exceeds the exact unranking range", () => {
    // The shader unranks pairs in f32, and the closed form first rounds at
    // 5793 tokens: a place that can hold that many would pair the wrong
    // tokens silently.
    const pairNet = (capacity: number) =>
      net({
        types: [color("c", [{ elementId: "x", name: "x", type: "real" }])],
        places: [place("p", { colorId: "c", capacity })],
        transitions: [
          transition("t", [{ placeId: "p", weight: 2, type: "standard" }], []),
        ],
      });

    expect(assessGpuEligibility(pairNet(PAIR_EXACT_TOKEN_LIMIT)).eligible).toBe(
      true,
    );

    const result = assessGpuEligibility(pairNet(PAIR_EXACT_TOKEN_LIMIT + 1));
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons.map((reason) => reason.code)).toContain(
      "colored-pair-capacity",
    );
    expect(formatGpuIneligibility(result.reasons)).toContain("5792");
  });

  it("rejects an input arc wider than a pair on a typed place", () => {
    // Beyond pairs there is no closed-form unranking in use, so the shader has no
    // way to walk combinations in the engine's order.
    const result = assessGpuEligibility(
      net({
        types: [color("c", [{ elementId: "x", name: "x", type: "real" }])],
        places: [place("p", { colorId: "c", capacity: 8 })],
        transitions: [
          transition("t", [{ placeId: "p", weight: 3, type: "standard" }], []),
        ],
      }),
    );

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons.map((reason) => reason.code)).toContain(
      "colored-input-arc-weight",
    );
  });

  it("allows a weighted arc on an untyped place, which needs no enumeration", () => {
    const result = assessGpuEligibility(
      net({
        places: [place("p"), place("q")],
        transitions: [
          transition(
            "t",
            [{ placeId: "p", weight: 3, type: "standard" }],
            [{ placeId: "q", weight: 1 }],
          ),
        ],
      }),
    );

    expect(result.eligible).toBe(true);
  });

  it("allows a weighted inhibitor arc on a typed place", () => {
    // An inhibitor consumes nothing, so there is no combination to choose.
    const result = assessGpuEligibility(
      net({
        types: [color("c", [{ elementId: "x", name: "x", type: "real" }])],
        places: [place("p", { colorId: "c", capacity: 8 }), place("q")],
        transitions: [
          transition(
            "t",
            [{ placeId: "p", weight: 4, type: "inhibitor" }],
            [{ placeId: "q", weight: 1 }],
          ),
        ],
      }),
    );

    expect(result.eligible).toBe(true);
  });

  it("rejects state too large to schedule usefully", () => {
    // Run tiling absorbs large per-run state, so the gate sits at a megabyte
    // per run: 100k single-word tokens (400 KB) now pass, 10M do not.
    const accepted = assessGpuEligibility(
      net({
        types: [color("c", [{ elementId: "x", name: "x", type: "real" }])],
        places: [place("p", { colorId: "c", capacity: 100_000 })],
        transitions: [transition("t", [], [{ placeId: "p", weight: 1 }])],
      }),
    );
    expect(accepted.eligible).toBe(true);

    const result = assessGpuEligibility(
      net({
        types: [color("c", [{ elementId: "x", name: "x", type: "real" }])],
        places: [place("p", { colorId: "c", capacity: 10_000_000 })],
        transitions: [transition("t", [], [{ placeId: "p", weight: 1 }])],
      }),
    );

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons.map((reason) => reason.code)).toContain(
      "state-too-large",
    );
  });

  it("rejects a net with nothing to simulate", () => {
    const result = assessGpuEligibility(net({ places: [place("p")] }));

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons.map((reason) => reason.code)).toContain(
      "no-transitions",
    );
  });

  it("derives capacities for a real net whose typed places declare none", () => {
    // This example's typed places set no capacities; that used to be its
    // blocker, and its slabs now derive by probing instead.
    const result = assessGpuEligibility(
      supplyChainWithDisruption.petriNetDefinition,
    );

    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(
      result.profile.places.some((entry) => entry.capacitySource === "derived"),
    ).toBe(true);
  });

  it("reports every reason a net is ineligible, not just the first", () => {
    const result = assessGpuEligibility(
      net({
        types: [
          color("c", [
            { elementId: "x", name: "x", type: "string" },
            { elementId: "y", name: "y", type: "uuid" },
          ]),
        ],
        places: [place("p", { colorId: "c" })],
        transitions: [transition("t", [], [{ placeId: "p", weight: 1 }])],
      }),
    );

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons.length).toBeGreaterThan(1);
    // The message has to name the place, or a user cannot act on it.
    expect(formatGpuIneligibility(result.reasons)).toMatch(/attribute/i);
  });
});
