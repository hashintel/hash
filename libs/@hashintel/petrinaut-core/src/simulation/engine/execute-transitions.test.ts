/* eslint-disable no-param-reassign -- buffer-ABI kernel mocks write into the
   staging views they receive */
import { describe, expect, it } from "vitest";

import {
  createEngineFrameLayout,
  materializeEngineFrame,
  type EngineFrameSnapshot,
} from "../frames/internal-frame";
import { makeCompiledTransition } from "./compiled-transition.test-helpers";
import { executeTransitions as executeEngineTransitions } from "./execute-transitions";
import { StringPool } from "./string-pool";
import {
  decodePlaceTokens,
  makeTestFrame,
  type TestFrame,
} from "./token-layout.test-helpers";

import type {
  HirCompiledBufferKernel,
  HirCompiledBufferLambda,
} from "../../hir-runtime";
import type { Color, Place, Transition } from "../../types/sdcpn";
import type { SimulationInstance } from "./types";

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
    lambdaCode: "",
    transitionKernelCode: "",
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
  kernelFns,
}: {
  places?: Place[];
  transitions: Transition[];
  types?: Color[];
  lambdaFns: ReadonlyMap<string, HirCompiledBufferLambda>;
  kernelFns?: ReadonlyMap<string, HirCompiledBufferKernel | null>;
}): SimulationInstance {
  const frameLayout = createEngineFrameLayout({
    places,
    transitions,
    types,
  });

  return {
    places: new Map(places.map((place) => [place.id, place])),
    transitions: new Map(
      transitions.map((transition) => [transition.id, transition]),
    ),
    types: new Map(types.map((type) => [type.id, type])),
    differentialEquationFns: new Map(),
    compiledTransitions: new Map(
      transitions.map((transition) => {
        const lambdaFn = lambdaFns.get(transition.id);
        if (!lambdaFn) {
          throw new Error(`Missing compiled lambda for ${transition.id}`);
        }
        return [
          transition.id,
          makeCompiledTransition({
            transition,
            places,
            types,
            lambdaFn,
            kernelFn: kernelFns?.get(transition.id) ?? null,
          }),
        ];
      }),
    ),
    parameterValues: {},
    dt: 0.1,
    maxTime: null,
    currentTime: 0,
    rngState: 42,
    stringPool: new StringPool(),
    frameLayout,
    frames: [],
    currentFrameNumber: 0,
  };
}

function executeTransitions(
  frame: TestFrame,
  simulation: SimulationInstance,
  dt: number,
  rngState: number,
) {
  const result = executeEngineTransitions(
    frame,
    { ...simulation, frameLayout: frame.layout },
    dt,
    rngState,
  );

  return {
    ...result,
    rawFrame: result.frame,
    frame:
      result.frame === frame
        ? (frame as unknown as EngineFrameSnapshot)
        : materializeEngineFrame(frame.layout, result.frame),
  };
}

/** Buffer-ABI kernel mock writing one constant real token per output slot. */
const constantKernel =
  (...values: number[]): HirCompiledBufferKernel =>
  (_f64, _u64, _u8, _placeBases, _indices, outF64) => {
    for (const [index, value] of values.entries()) {
      outF64[index] = value;
    }
  };

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
    });
    const frame = makeTestFrame({
      places: {
        p1: { elements: type1.elements, tokens: [] },
      },
      transitions: {
        t1: transitionState(),
      },
    });

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
    });
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Place 1", "type1"),
        makePlace("p2", "Place 2", "type1"),
      ],
      transitions: [transition],
      types: [type1],
      lambdaFns: new Map([["t1", () => 10.0]]),
      kernelFns: new Map([["t1", constantKernel(2.0)]]),
    });
    const frame = makeTestFrame({
      places: {
        p1: { elements: type1.elements, tokens: [{ x: 1.0 }, { x: 1.5 }] },
        p2: { elements: type1.elements, tokens: [] },
      },
      transitions: {
        t1: transitionState(),
      },
    });

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame.places.p1?.count).toBe(1);
    expect(decodePlaceTokens(frame.layout, result.rawFrame, "p1")).toEqual([
      { x: 1.5 },
    ]);
    expect(result.frame.places.p2?.count).toBe(1);
    expect(decodePlaceTokens(frame.layout, result.rawFrame, "p2")).toEqual([
      { x: 2.0 },
    ]);
    expect(result.frame.transitions.t1?.timeSinceLastFiringMs).toBe(0);
    expect(result.transitionFired).toBe(true);
  });

  it("keeps read arc tokens in the frame when a transition fires", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [
        { placeId: "p1", weight: 1, type: "standard" },
        { placeId: "p2", weight: 1, type: "read" },
      ],
      outputArcs: [{ placeId: "p3", weight: 1 }],
      lambdaType: "predicate",
    });
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Source", "type1"),
        makePlace("p2", "Guard", "type1"),
        makePlace("p3", "Target", "type1"),
      ],
      transitions: [transition],
      types: [type1],
      lambdaFns: new Map([["t1", () => true]]),
      kernelFns: new Map<string, HirCompiledBufferKernel>([
        [
          "t1",
          (f64, _u64, _u8, placeBases, indices, outF64) => {
            // Forward the read arc (Guard) token's x — type1 stride is 8.
            outF64[0] = f64[(placeBases[1]! + indices[1]! * 8) / 8]!;
          },
        ],
      ]),
    });
    const frame = makeTestFrame({
      places: {
        p1: { elements: type1.elements, tokens: [{ x: 3.0 }] },
        p2: { elements: type1.elements, tokens: [{ x: 7.0 }] },
        p3: { elements: type1.elements, tokens: [] },
      },
      transitions: {
        t1: transitionState(),
      },
    });

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.transitionFired).toBe(true);
    expect(result.frame.places.p1?.count).toBe(0);
    expect(result.frame.places.p2?.count).toBe(1);
    expect(result.frame.places.p3?.count).toBe(1);
    expect(decodePlaceTokens(frame.layout, result.rawFrame, "p1")).toEqual([]);
    expect(decodePlaceTokens(frame.layout, result.rawFrame, "p2")).toEqual([
      { x: 7.0 },
    ]);
    expect(decodePlaceTokens(frame.layout, result.rawFrame, "p3")).toEqual([
      { x: 7.0 },
    ]);
  });

  it("executes multiple transitions sequentially with proper token removal between each", () => {
    const transitions = [
      makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
      }),
      makeTransition({
        id: "t2",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p3", weight: 1 }],
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
      kernelFns: new Map([
        ["t1", constantKernel(5.0)],
        ["t2", constantKernel(10.0)],
      ]),
    });
    const frame = makeTestFrame({
      places: {
        p1: {
          elements: type1.elements,
          tokens: [{ x: 1.0 }, { x: 2.0 }, { x: 3.0 }],
        },
        p2: { elements: type1.elements, tokens: [] },
        p3: { elements: type1.elements, tokens: [] },
      },
      transitions: {
        t1: transitionState(),
        t2: transitionState(),
      },
    });

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
    });
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Place 1", "type2"),
        makePlace("p2", "Place 2", "type2"),
      ],
      transitions: [transition],
      types: [type2],
      lambdaFns: new Map([["t1", () => 10.0]]),
      kernelFns: new Map([["t1", constantKernel(3.0, 4.0)]]),
    });
    const frame = makeTestFrame({
      places: {
        p1: { elements: type2.elements, tokens: [{ x: 1.0, y: 2.0 }] },
        p2: { elements: type2.elements, tokens: [] },
      },
      transitions: {
        t1: transitionState(),
      },
    });

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame.places.p1?.count).toBe(0);
    expect(result.frame.places.p2?.count).toBe(1);
    expect(decodePlaceTokens(frame.layout, result.rawFrame, "p2")).toEqual([
      { x: 3.0, y: 4.0 },
    ]);
  });

  it("updates timeSinceLastFiringMs for transitions that did not fire", () => {
    const transitions = [
      makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
      }),
      makeTransition({
        id: "t2",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
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
      kernelFns: new Map([
        ["t1", constantKernel(2.0)],
        ["t2", constantKernel(3.0)],
      ]),
    });
    const frame = makeTestFrame({
      places: {
        p1: { elements: type1.elements, tokens: [{ x: 1.0 }, { x: 1.5 }] },
        p2: { elements: type1.elements, tokens: [] },
      },
      transitions: {
        t1: transitionState(0.5),
        t2: transitionState(0.3),
      },
    });

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
