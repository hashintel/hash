import { describe, expect, it } from "vitest";

import type { Color, Place, Transition } from "../../../types/sdcpn";
import { computePossibleTransition } from "./compute-possible-transition";
import type {
  SimulationFrame,
  SimulationInstance,
  TransitionKernelFn,
} from "./types";

const type1: Color = {
  id: "type1",
  name: "Type1",
  iconSlug: "circle",
  displayColor: "#FF0000",
  elements: [{ elementId: "e1", name: "x", type: "real" }],
};

const transitionState = (timeSinceLastFiringMs = 1.0) => ({
  timeSinceLastFiringMs,
  firedInThisFrame: false,
  firingCount: 0,
});

function makePlace(id: string, name: string, colorId: string | null): Place {
  return {
    id,
    name,
    colorId,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
  };
}

function makeTransition(
  transition: Pick<Transition, "id" | "inputArcs" | "outputArcs"> &
    Partial<Omit<Transition, "id" | "inputArcs" | "outputArcs">>,
): Transition {
  return {
    name: "Transition 1",
    lambdaType: "stochastic",
    lambdaCode: "return 1.0;",
    transitionKernelCode: "return {};",
    x: 0,
    y: 0,
    ...transition,
  };
}

function makeSimulation({
  places = [],
  transitions,
  types = [],
  lambdaFns,
  transitionKernelFns,
}: {
  places?: Place[];
  transitions: Transition[];
  types?: Color[];
  lambdaFns: SimulationInstance["lambdaFns"];
  transitionKernelFns: SimulationInstance["transitionKernelFns"];
}): SimulationInstance {
  return {
    places: new Map(places.map((place) => [place.id, place])),
    transitions: new Map(
      transitions.map((transition) => [transition.id, transition]),
    ),
    types: new Map(types.map((type) => [type.id, type])),
    differentialEquationFns: new Map(),
    lambdaFns,
    transitionKernelFns,
    parameterValues: {},
    dt: 0.1,
    maxTime: null,
    rngState: 42,
    frames: [],
    currentFrameNumber: 0,
  };
}

describe("computePossibleTransition", () => {
  it("returns null when transition is not enabled due to insufficient tokens", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 2, type: "standard" }],
      outputArcs: [],
    });
    const simulation = makeSimulation({
      transitions: [transition],
      lambdaFns: new Map([["t1", () => 1.0]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ p2: [{ x: 1.0 }] })],
      ]),
    });
    const frame: SimulationFrame = {
      time: 0,
      places: {
        p1: { offset: 0, count: 1, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([1.0]),
    };

    expect(computePossibleTransition(frame, simulation, "t1", 42)).toBeNull();
  });

  it("returns null when inhibitor arc condition is not met", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 2, type: "inhibitor" }],
      outputArcs: [],
    });
    const simulation = makeSimulation({
      transitions: [transition],
      lambdaFns: new Map([["t1", () => 1.0]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({})],
      ]),
    });
    const frame: SimulationFrame = {
      time: 0,
      places: {
        p1: { offset: 0, count: 2, dimensions: 0 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([]),
    };

    expect(computePossibleTransition(frame, simulation, "t1", 42)).toBeNull();
  });

  it("does not consume tokens from inhibitor arc when transition fires", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [
        { placeId: "p1", weight: 1, type: "standard" },
        { placeId: "p2", weight: 1, type: "inhibitor" },
      ],
      outputArcs: [{ placeId: "p3", weight: 1 }],
      lambdaCode: "return 10.0;",
      transitionKernelCode: "return { Target: [{ x: 5.0 }] };",
    });
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Source", "type1"),
        makePlace("p2", "Guard", null),
        makePlace("p3", "Target", "type1"),
      ],
      transitions: [transition],
      types: [type1],
      lambdaFns: new Map([["t1", () => 10.0]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ Target: [{ x: 5.0 }] })],
      ]),
    });
    const frame: SimulationFrame = {
      time: 0,
      places: {
        p1: { offset: 0, count: 1, dimensions: 1 },
        p2: { offset: 1, count: 0, dimensions: 0 },
        p3: { offset: 1, count: 0, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([3.0]),
    };

    const result = computePossibleTransition(frame, simulation, "t1", 42);

    expect(result).not.toBeNull();
    expect(result!.remove).toHaveProperty("p1");
    expect(result!.remove).not.toHaveProperty("p2");
    expect(result!.add).toMatchObject({ p3: [[5.0]] });
  });

  it("returns token combinations when transition is enabled and fires", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p2", weight: 1 }],
      lambdaCode: "return 10.0;",
      transitionKernelCode: "return [[[2.0]]];",
    });
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Place 1", "type1"),
        makePlace("p2", "Place 2", "type1"),
      ],
      transitions: [transition],
      types: [type1],
      lambdaFns: new Map([["t1", () => 10.0]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ "Place 2": [{ x: 2.0 }] })],
      ]),
    });
    const frame: SimulationFrame = {
      time: 0,
      places: {
        p1: { offset: 0, count: 2, dimensions: 1 },
        p2: { offset: 2, count: 0, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([1.0, 1.5]),
    };

    const result = computePossibleTransition(frame, simulation, "t1", 42);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      remove: { p1: new Set([0]) },
      add: { p2: [[2.0]] },
    });
    expect(result?.newRngState).toBeTypeOf("number");
  });
});
