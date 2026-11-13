import { describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "./extensions";
import {
  isContinuousNet,
  isSourcePredicate,
  isTimedNet,
  runClockOf,
  runContinuityOf,
} from "./net-timing";

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

describe("isContinuousNet", () => {
  const rated = net({
    transitions: [transition({ lambdaType: "stochastic" })],
  });

  it("is discrete with predicates only, and with rates only", () => {
    expect(isContinuousNet(net())).toBe(false);
    // Time passes between two firings, and nothing else does.
    expect(isContinuousNet(rated)).toBe(false);
  });

  it("is continuous once a place runs dynamics", () => {
    expect(isContinuousNet(net({ places: [movingPlace] }))).toBe(true);
  });

  it("ignores dynamics that are switched off, untyped or empty, or whose extension is disabled", () => {
    expect(
      isContinuousNet(
        net({
          places: [
            { ...movingPlace, dynamicsEnabled: false },
            { ...movingPlace, colorId: null },
            { ...movingPlace, dynamics: [] },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isContinuousNet(net({ places: [movingPlace] }), {
        ...DEFAULT_PETRINAUT_EXTENSIONS,
        dynamics: false,
      }),
    ).toBe(false);
  });

  it("ignores dynamics on tokens with no real attribute, which nothing can move", () => {
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

    expect(isContinuousNet(typed("real"))).toBe(true);
    expect(isContinuousNet(typed("integer"))).toBe(false);
    expect(isTimedNet(typed("integer"))).toBe(false);
  });

  it("counts a subnet's dynamics", () => {
    const subnet = {
      id: "subnet",
      name: "Subnet",
      places: [movingPlace],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    };
    expect(isContinuousNet(net({ subnets: [subnet] }))).toBe(true);
    expect(
      isContinuousNet(net({ subnets: [subnet] }), {
        ...DEFAULT_PETRINAUT_EXTENSIONS,
        subnets: false,
      }),
    ).toBe(false);
  });

  it("leaves three kinds of run: a continuous net is always timed", () => {
    const kindOf = (sdcpn: SDCPN) =>
      `${runClockOf(sdcpn)}, ${runContinuityOf(sdcpn)}`;

    expect(kindOf(net())).toBe("steps, discrete");
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
