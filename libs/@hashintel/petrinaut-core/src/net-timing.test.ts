import { describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "./extensions";
import { isSourcePredicate, isTimedNet } from "./net-timing";

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

const movingPlace = place({
  colorId: "type",
  dynamicsEnabled: true,
  dynamics: [{ differentialEquationId: "equation" }],
});

describe("isTimedNet", () => {
  it("is untimed with predicates only and no dynamics", () => {
    expect(isTimedNet(net())).toBe(false);
  });

  it("is timed once a transition fires at a rate", () => {
    expect(
      isTimedNet(
        net({ transitions: [transition({ lambdaType: "stochastic" })] }),
      ),
    ).toBe(true);
  });

  it("is timed once a place runs dynamics", () => {
    expect(isTimedNet(net({ places: [movingPlace] }))).toBe(true);
  });

  it("ignores dynamics that are switched off, untyped or empty", () => {
    expect(
      isTimedNet(
        net({
          places: [
            { ...movingPlace, dynamicsEnabled: false },
            { ...movingPlace, colorId: null },
            { ...movingPlace, dynamics: [] },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("ignores what a disabled extension would run", () => {
    const rated = net({
      transitions: [transition({ lambdaType: "stochastic" })],
    });
    expect(
      isTimedNet(rated, {
        ...DEFAULT_PETRINAUT_EXTENSIONS,
        stochasticity: false,
      }),
    ).toBe(false);
    expect(
      isTimedNet(net({ places: [movingPlace] }), {
        ...DEFAULT_PETRINAUT_EXTENSIONS,
        dynamics: false,
      }),
    ).toBe(false);
  });

  it("counts a subnet's rates and dynamics", () => {
    const subnet = {
      id: "subnet",
      name: "Subnet",
      places: [],
      transitions: [transition({ lambdaType: "stochastic" })],
      types: [],
      differentialEquations: [],
      parameters: [],
    };
    expect(isTimedNet(net({ subnets: [subnet] }))).toBe(true);
    expect(
      isTimedNet(net({ subnets: [subnet] }), {
        ...DEFAULT_PETRINAUT_EXTENSIONS,
        subnets: false,
      }),
    ).toBe(false);
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
