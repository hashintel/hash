import { describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "./extensions";
import {
  isSourcePredicate,
  netColoringOf,
  netTimeOf,
  runClockOf,
  runContinuityOf,
} from "./net-class";

import type { Place, SDCPN, Transition } from "./types/sdcpn";

const place = (overrides: Partial<Place> = {}): Place => ({
  id: "place",
  name: "Place",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
  ...overrides,
});

const transition = (overrides: Partial<Transition> = {}): Transition => ({
  id: "transition",
  name: "Transition",
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
  ...overrides,
});

const net = (overrides: Partial<SDCPN> = {}): SDCPN => ({
  places: [place()],
  transitions: [transition()],
  types: [],
  differentialEquations: [],
  parameters: [],
  ...overrides,
});

const subnet = (overrides: Partial<SDCPN>) => ({
  id: "subnet",
  name: "Subnet",
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  ...overrides,
});

const without = (extension: keyof typeof DEFAULT_PETRINAUT_EXTENSIONS) => ({
  ...DEFAULT_PETRINAUT_EXTENSIONS,
  [extension]: false,
});

const typedPlace = place({ colorId: "type" });

const movingPlace = place({
  colorId: "type",
  dynamicsEnabled: true,
  dynamics: [{ differentialEquationId: "equation" }],
});

const rated = net({ transitions: [transition({ lambdaType: "stochastic" })] });

describe("netTimeOf", () => {
  it("is untimed with predicates only and no dynamics", () => {
    expect(netTimeOf(net())).toBe("untimed");
  });

  it("is timed once a transition fires at a rate", () => {
    expect(netTimeOf(rated)).toBe("timed");
  });

  it("is timed once a place runs dynamics", () => {
    expect(netTimeOf(net({ places: [movingPlace] }))).toBe("timed");
  });

  it("ignores dynamics that are switched off, untyped or empty", () => {
    expect(
      netTimeOf(
        net({
          places: [
            { ...movingPlace, dynamicsEnabled: false },
            { ...movingPlace, colorId: null },
            { ...movingPlace, dynamics: [] },
          ],
        }),
      ),
    ).toBe("untimed");
  });

  it("ignores what a disabled extension would run", () => {
    expect(netTimeOf(rated, without("stochasticity"))).toBe("untimed");
    expect(netTimeOf(net({ places: [movingPlace] }), without("dynamics"))).toBe(
      "untimed",
    );
  });

  it("counts a subnet's rates", () => {
    const nested = net({
      subnets: [subnet({ transitions: rated.transitions })],
    });
    expect(netTimeOf(nested)).toBe("timed");
    expect(netTimeOf(nested, without("subnets"))).toBe("untimed");
  });
});

describe("netColoringOf", () => {
  it("is uncoloured while no place has a type", () => {
    expect(netColoringOf(net())).toBe("none");
    expect(netColoringOf(rated)).toBe("none");
  });

  it("is statically coloured once a place has a type", () => {
    expect(netColoringOf(net({ places: [typedPlace] }))).toBe("static");
    expect(
      netColoringOf(net({ places: [typedPlace] }), without("colors")),
    ).toBe("none");
  });

  it("is dynamically coloured once a place runs dynamics", () => {
    expect(netColoringOf(net({ places: [movingPlace] }))).toBe("dynamic");
  });

  it("stays statically coloured while dynamics are switched off or empty, or their extension is disabled", () => {
    expect(
      netColoringOf(
        net({
          places: [
            { ...movingPlace, dynamicsEnabled: false },
            { ...movingPlace, dynamics: [] },
          ],
        }),
      ),
    ).toBe("static");
    expect(
      netColoringOf(net({ places: [movingPlace] }), without("dynamics")),
    ).toBe("static");
  });

  it("stays statically coloured with dynamics on tokens with no real attribute, which nothing can move", () => {
    const typed = (type: "real" | "integer") =>
      net({
        places: [movingPlace],
        types: [
          {
            id: "type",
            name: "Type",
            iconSlug: "circle",
            displayColor: "#000000",
            elements: [{ elementId: "element", name: "value", type }],
          },
        ],
      });

    expect(netColoringOf(typed("real"))).toBe("dynamic");
    expect(netColoringOf(typed("integer"))).toBe("static");
    expect(netTimeOf(typed("integer"))).toBe("untimed");
  });

  it("counts a subnet's places", () => {
    const nested = net({ subnets: [subnet({ places: [movingPlace] })] });
    expect(netColoringOf(nested)).toBe("dynamic");
    expect(netColoringOf(nested, without("subnets"))).toBe("none");
  });
});

describe("a run of the net", () => {
  it("is of three kinds: a dynamically coloured net is always timed", () => {
    const kindOf = (sdcpn: SDCPN) =>
      `${runClockOf(sdcpn)}, ${runContinuityOf(sdcpn)}`;

    expect(kindOf(net())).toBe("steps, discrete");
    expect(kindOf(net({ places: [typedPlace] }))).toBe("steps, discrete");
    expect(kindOf(rated)).toBe("time, discrete");
    expect(kindOf(net({ places: [movingPlace] }))).toBe("time, continuous");
  });
});

describe("isSourcePredicate", () => {
  const extensions = DEFAULT_PETRINAUT_EXTENSIONS;

  it("holds for a predicate with no input arc", () => {
    expect(isSourcePredicate(transition(), extensions)).toBe(true);
  });

  it("does not hold once any arc feeds the transition", () => {
    expect(
      isSourcePredicate(
        transition({
          inputArcs: [{ placeId: "place", weight: 1, type: "inhibitor" }],
        }),
        extensions,
      ),
    ).toBe(false);
  });

  it("does not hold for a transition that fires at a rate", () => {
    expect(
      isSourcePredicate(transition({ lambdaType: "stochastic" }), extensions),
    ).toBe(false);
  });
});
