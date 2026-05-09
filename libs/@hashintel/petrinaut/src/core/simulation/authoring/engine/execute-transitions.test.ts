import { describe, expect, it } from "vitest";

import type { Color, Place, Transition } from "../../../types/sdcpn";
import { executeTransitions } from "./execute-transitions";
import type {
  EngineFrame,
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

const type2: Color = {
  id: "type2",
  name: "Type2",
  iconSlug: "square",
  displayColor: "#00FF00",
  elements: [
    { elementId: "e1", name: "x", type: "real" },
    { elementId: "e2", name: "y", type: "real" },
  ],
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
    name: "Transition",
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

describe("executeTransitions", () => {
  it("returns the original frame when no transitions can fire", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p2", weight: 1 }],
    });
    const simulation = makeSimulation({
      transitions: [transition],
      lambdaFns: new Map([["t1", () => 1.0]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ p2: [{ x: 1.0 }] })],
      ]),
    });
    const frame: EngineFrame = {
      time: 0,
      places: {
        p1: { offset: 0, count: 0, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([]),
    };

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame).toBe(frame);
    expect(result.transitionFired).toBe(false);
  });

  it("removes tokens and adds new tokens when a single transition fires", () => {
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
    const frame: EngineFrame = {
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

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame.places.p1?.count).toBe(1);
    expect(result.frame.buffer[0]).toBe(1.5);
    expect(result.frame.places.p2?.count).toBe(1);
    expect(result.frame.buffer[1]).toBe(2.0);
    expect(result.frame.time).toBe(0.1);
    expect(result.frame.transitions.t1?.timeSinceLastFiringMs).toBe(0);
    expect(result.transitionFired).toBe(true);
  });

  it("executes multiple transitions sequentially with proper token removal between each", () => {
    const transitions = [
      makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
        lambdaCode: "return 10.0;",
        transitionKernelCode: "return [[[5.0]]];",
      }),
      makeTransition({
        id: "t2",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p3", weight: 1 }],
        lambdaCode: "return 10.0;",
        transitionKernelCode: "return [[[10.0]]];",
      }),
    ];
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Place 1", "type1"),
        makePlace("p2", "Place 2", "type1"),
        makePlace("p3", "Place 3", "type1"),
      ],
      transitions,
      types: [type1],
      lambdaFns: new Map([
        ["t1", () => 10.0],
        ["t2", () => 10.0],
      ]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ "Place 2": [{ x: 5.0 }] })],
        ["t2", () => ({ "Place 3": [{ x: 10.0 }] })],
      ]),
    });
    const frame: EngineFrame = {
      time: 0,
      places: {
        p1: { offset: 0, count: 3, dimensions: 1 },
        p2: { offset: 3, count: 0, dimensions: 1 },
        p3: { offset: 3, count: 0, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(),
        t2: transitionState(),
      },
      buffer: new Float64Array([1.0, 2.0, 3.0]),
    };

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame.places.p1?.count).toBe(1);
    expect(result.frame.places.p2?.count).toBe(1);
    expect(result.frame.places.p3?.count).toBe(1);
    expect(result.frame.transitions.t1?.timeSinceLastFiringMs).toBe(0);
    expect(result.frame.transitions.t2?.timeSinceLastFiringMs).toBe(0);
  });

  it("handles transitions with multi-dimensional tokens", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p2", weight: 1 }],
      lambdaCode: "return 10.0;",
      transitionKernelCode: "return [[[3.0, 4.0]]];",
    });
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Place 1", "type2"),
        makePlace("p2", "Place 2", "type2"),
      ],
      transitions: [transition],
      types: [type2],
      lambdaFns: new Map([["t1", () => 10.0]]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ "Place 2": [{ x: 3.0, y: 4.0 }] })],
      ]),
    });
    const frame: EngineFrame = {
      time: 0,
      places: {
        p1: { offset: 0, count: 1, dimensions: 2 },
        p2: { offset: 2, count: 0, dimensions: 2 },
      },
      transitions: {
        t1: transitionState(),
      },
      buffer: new Float64Array([1.0, 2.0]),
    };

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame.places.p1?.count).toBe(0);
    expect(result.frame.places.p2?.count).toBe(1);
    expect(result.frame.buffer[0]).toBe(3.0);
    expect(result.frame.buffer[1]).toBe(4.0);
  });

  it("updates timeSinceLastFiringMs for transitions that did not fire", () => {
    const transitions = [
      makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
        lambdaCode: "return 10.0;",
        transitionKernelCode: "return [[[2.0]]];",
      }),
      makeTransition({
        id: "t2",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
        lambdaCode: "return 0.001;",
        transitionKernelCode: "return [[[3.0]]];",
      }),
    ];
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Place 1", "type1"),
        makePlace("p2", "Place 2", "type1"),
      ],
      transitions,
      types: [type1],
      lambdaFns: new Map([
        ["t1", () => 10.0],
        ["t2", () => 0.001],
      ]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        ["t1", () => ({ "Place 2": [{ x: 2.0 }] })],
        ["t2", () => ({ "Place 2": [{ x: 3.0 }] })],
      ]),
    });
    const frame: EngineFrame = {
      time: 0,
      places: {
        p1: { offset: 0, count: 2, dimensions: 1 },
        p2: { offset: 2, count: 0, dimensions: 1 },
      },
      transitions: {
        t1: transitionState(0.5),
        t2: transitionState(0.3),
      },
      buffer: new Float64Array([1.0, 1.5]),
    };

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame.transitions.t1?.timeSinceLastFiringMs).toBe(0);
    expect(result.frame.transitions.t2?.timeSinceLastFiringMs).toBe(0.4);
  });
});
