import { describe, expect, it } from "vitest";

import { getArcEndpointPlaceId } from "../../arc-endpoints";
import { createEngineFrameLayout } from "../frames/internal-frame";
import { computePossibleTransition as computePossibleTransitionImpl } from "./compute-possible-transition";
import { computeTokenSlotLayout } from "./token-layout";
import {
  decodeTokenBlock,
  makeTestFrame,
  type TestFrame,
} from "./token-layout.test-helpers";

import type { Color, Place, Transition } from "../../types/sdcpn";
import type {
  CompiledTransition,
  LambdaFn,
  SimulationInstance,
  TransitionKernelFn,
  TransitionTokenValues,
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

function makeCompiledTransitions({
  places,
  transitions,
  types,
  lambdaFns,
  transitionKernelFns,
}: {
  places: Place[];
  transitions: Transition[];
  types: Color[];
  lambdaFns: ReadonlyMap<string, LambdaFn>;
  transitionKernelFns: ReadonlyMap<string, TransitionKernelFn>;
}): Map<string, CompiledTransition> {
  const placesMap = new Map(places.map((place) => [place.id, place]));
  const typesMap = new Map(types.map((type) => [type.id, type]));
  const getElements = (placeId: string) => {
    const place = placesMap.get(placeId);
    if (!place?.colorId) {
      return null;
    }

    return typesMap.get(place.colorId)?.elements ?? null;
  };

  return new Map(
    transitions.map((transition) => {
      const lambdaFn = lambdaFns.get(transition.id);
      const transitionKernelFn = transitionKernelFns.get(transition.id);
      if (!lambdaFn || !transitionKernelFn) {
        throw new Error(`Missing compiled functions for ${transition.id}`);
      }

      return [
        transition.id,
        {
          id: transition.id,
          name: transition.name,
          inputPlaces: transition.inputArcs.map((arc) => {
            const placeId = getArcEndpointPlaceId(arc)!;
            const elements = getElements(placeId);
            return {
              placeId,
              placeName: placesMap.get(placeId)?.name ?? placeId,
              weight: arc.weight,
              arcType: arc.type,
              elements,
              tokenLayout: elements ? computeTokenSlotLayout(elements) : null,
            };
          }),
          outputPlaces: transition.outputArcs.map((arc) => {
            const placeId = getArcEndpointPlaceId(arc)!;
            const elements = getElements(placeId);
            return {
              placeId,
              placeName: placesMap.get(placeId)?.name ?? placeId,
              weight: arc.weight,
              elements,
              tokenLayout: elements ? computeTokenSlotLayout(elements) : null,
            };
          }),
          lambdaFn,
          transitionKernelFn,
        },
      ];
    }),
  );
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
  lambdaFns: ReadonlyMap<string, LambdaFn>;
  transitionKernelFns: ReadonlyMap<string, TransitionKernelFn>;
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
    compiledTransitions: makeCompiledTransitions({
      places,
      transitions,
      types,
      lambdaFns,
      transitionKernelFns,
    }),
    parameterValues: {},
    dt: 0.1,
    maxTime: null,
    currentTime: 0,
    rngState: 42,
    frameLayout,
    frames: [],
    currentFrameNumber: 0,
  };
}

function computePossibleTransition(
  frame: TestFrame,
  simulation: SimulationInstance,
  transitionId: string,
  rngState: number,
) {
  return computePossibleTransitionImpl(
    frame,
    { ...simulation, frameLayout: frame.layout },
    transitionId,
    rngState,
  );
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
    const frame = makeTestFrame({
      places: {
        p1: { elements: type1.elements, tokens: [{ x: 1.0 }] },
      },
      transitions: {
        t1: transitionState(),
      },
    });

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
    const frame = makeTestFrame({
      places: {
        p1: { count: 2 },
      },
      transitions: {
        t1: transitionState(),
      },
    });

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
    const frame = makeTestFrame({
      places: {
        p1: { elements: type1.elements, tokens: [{ x: 3.0 }] },
        p2: { count: 0 },
        p3: { elements: type1.elements, tokens: [] },
      },
      transitions: {
        t1: transitionState(),
      },
    });

    const result = computePossibleTransition(frame, simulation, "t1", 42);

    expect(result).not.toBeNull();
    expect(result!.remove).toHaveProperty("p1");
    expect(result!.remove).not.toHaveProperty("p2");
    expect(
      result!.add.p3!.map((block) => decodeTokenBlock(type1.elements, block)),
    ).toEqual([{ x: 5 }]);
  });

  it("passes read arc tokens to lambda and kernel without consuming them", () => {
    const transition = makeTransition({
      id: "t1",
      inputArcs: [
        { placeId: "p1", weight: 1, type: "standard" },
        { placeId: "p2", weight: 1, type: "read" },
      ],
      outputArcs: [{ placeId: "p3", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "return true;",
      transitionKernelCode: "return { Target: input.Guard };",
    });
    let lambdaInput: TransitionTokenValues | null = null;
    let kernelInput: TransitionTokenValues | null = null;
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Source", "type1"),
        makePlace("p2", "Guard", "type1"),
        makePlace("p3", "Target", "type1"),
      ],
      transitions: [transition],
      types: [type1],
      lambdaFns: new Map([
        [
          "t1",
          (input) => {
            lambdaInput = input;
            return true;
          },
        ],
      ]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        [
          "t1",
          (input) => {
            kernelInput = input;
            const guardToken = input.Guard?.[0];
            if (guardToken?.x === undefined) {
              throw new Error("Expected read arc token");
            }
            return { Target: [{ x: guardToken.x }] };
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

    const result = computePossibleTransition(frame, simulation, "t1", 42);

    expect(result).not.toBeNull();
    expect(lambdaInput).toMatchObject({
      Source: [{ x: 3.0 }],
      Guard: [{ x: 7.0 }],
    });
    expect(kernelInput).toMatchObject({
      Source: [{ x: 3.0 }],
      Guard: [{ x: 7.0 }],
    });
    expect(result!.remove).toEqual({ p1: new Set([0]) });
    expect(Object.keys(result!.add)).toEqual(["p3"]);
    expect(
      result!.add.p3!.map((block) => decodeTokenBlock(type1.elements, block)),
    ).toEqual([{ x: 7 }]);
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
    const frame = makeTestFrame({
      places: {
        p1: { elements: type1.elements, tokens: [{ x: 1.0 }, { x: 1.5 }] },
        p2: { elements: type1.elements, tokens: [] },
      },
      transitions: {
        t1: transitionState(),
      },
    });

    const result = computePossibleTransition(frame, simulation, "t1", 42);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      remove: { p1: new Set([0]) },
    });
    expect(
      result!.add.p2!.map((block) => decodeTokenBlock(type1.elements, block)),
    ).toEqual([{ x: 2 }]);
    expect(result?.newRngState).toBeTypeOf("number");
  });

  it("decodes typed input tokens and encodes typed output tokens", () => {
    const typedColor: Color = {
      id: "typed",
      name: "Typed",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [
        { elementId: "amount", name: "amount", type: "real" },
        { elementId: "count", name: "count", type: "integer" },
        { elementId: "active", name: "active", type: "boolean" },
      ],
    };
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p2", weight: 1 }],
    });
    let lambdaInput: unknown;
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Source", typedColor.id),
        makePlace("p2", "Target", typedColor.id),
      ],
      transitions: [transition],
      types: [typedColor],
      lambdaFns: new Map([
        [
          "t1",
          (tokens) => {
            lambdaInput = tokens;
            return 10.0;
          },
        ],
      ]),
      transitionKernelFns: new Map<string, TransitionKernelFn>([
        [
          "t1",
          () => ({
            Target: [
              {
                amount: 2.5,
                count: 3.6,
                active: false,
              },
            ],
          }),
        ],
      ]),
    });
    const frame = makeTestFrame({
      places: {
        p1: {
          elements: typedColor.elements,
          tokens: [{ amount: 1.25, count: 3, active: true }],
        },
        p2: { elements: typedColor.elements, tokens: [] },
      },
      transitions: {
        t1: transitionState(),
      },
    });

    const result = computePossibleTransition(frame, simulation, "t1", 42);

    expect(lambdaInput).toEqual({
      Source: [
        {
          amount: 1.25,
          count: 3,
          active: true,
        },
      ],
    });
    expect(result).toMatchObject({
      remove: { p1: new Set([0]) },
    });
    expect(
      result!.add.p2!.map((block) =>
        decodeTokenBlock(typedColor.elements, block),
      ),
    ).toEqual([{ amount: 2.5, count: 4, active: false }]);
  });
});
