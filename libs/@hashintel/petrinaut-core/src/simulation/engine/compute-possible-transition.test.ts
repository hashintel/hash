import { describe, expect, it } from "vitest";

import { getArcEndpointPlaceId } from "../../arc-endpoints";
import { createEngineFrameLayout } from "../frames/internal-frame";
import { computePossibleTransition as computePossibleTransitionImpl } from "./compute-possible-transition";
import { nextRandom } from "./seeded-rng";
import { StringPool } from "./string-pool";
import { computeTokenSlotLayout } from "./token-layout";
import {
  decodeTokenBlock,
  makeTestFrame,
  type TestFrame,
} from "./token-layout.test-helpers";
import { formatUuid, parseUuid, toUuid } from "./uuid";

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
    stringPool: new StringPool(),
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

  describe("uuid kernel outputs", () => {
    const uuidColor: Color = {
      id: "uuidColor",
      name: "UuidColor",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [
        { elementId: "id", name: "id", type: "uuid" },
        { elementId: "x", name: "x", type: "real" },
      ],
    };

    const makeUuidSimulation = (kernelFn: TransitionKernelFn) => {
      const transition = makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
      });
      return makeSimulation({
        places: [
          makePlace("p1", "Source", uuidColor.id),
          makePlace("p2", "Target", uuidColor.id),
        ],
        transitions: [transition],
        types: [uuidColor],
        lambdaFns: new Map([["t1", () => 10.0]]),
        transitionKernelFns: new Map([["t1", kernelFn]]),
      });
    };

    const inputUuid = parseUuid("0f9a3b5c-7d1e-4a2b-8c3d-4e5f6a7b8c9d");

    const makeUuidFrame = () =>
      makeTestFrame({
        places: {
          p1: {
            elements: uuidColor.elements,
            tokens: [{ id: inputUuid, x: 1.0 }],
          },
          p2: { elements: uuidColor.elements, tokens: [] },
        },
        transitions: { t1: transitionState() },
      });

    const firstAddedToken = (
      result: ReturnType<typeof computePossibleTransition>,
    ) => decodeTokenBlock(uuidColor.elements, result!.add.p2![0]!);

    it("auto-generates a v4 uuid deterministically per seed when omitted", () => {
      const simulation = makeUuidSimulation(() => ({ Target: [{ x: 2.0 }] }));

      const first = computePossibleTransition(
        makeUuidFrame(),
        simulation,
        "t1",
        42,
      );
      const second = computePossibleTransition(
        makeUuidFrame(),
        simulation,
        "t1",
        42,
      );
      const differentSeed = computePossibleTransition(
        makeUuidFrame(),
        simulation,
        "t1",
        43,
      );

      const generated = firstAddedToken(first).id as bigint;
      expect(generated).not.toBe(0n);
      expect(firstAddedToken(second).id).toBe(generated);
      expect(firstAddedToken(differentSeed).id).not.toBe(generated);
      // Version/variant bits of the auto-generated value.
      expect(formatUuid(generated)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      // The auto-generation consumed RNG state beyond the firing draw.
      expect(first!.newRngState).not.toBe(
        computePossibleTransition(
          makeUuidFrame(),
          makeUuidSimulation(() => ({ Target: [{ id: 1n, x: 2.0 }] })),
          "t1",
          42,
        )!.newRngState,
      );
    });

    it("resolves the Uuid.generate() sentinel with the same seeded draw as omission", () => {
      const omitted = computePossibleTransition(
        makeUuidFrame(),
        makeUuidSimulation(() => ({ Target: [{ x: 2.0 }] })),
        "t1",
        42,
      );
      const sentinel = computePossibleTransition(
        makeUuidFrame(),
        makeUuidSimulation(() => ({
          Target: [{ id: { __petrinautUuid: "generate" }, x: 2.0 }],
        })),
        "t1",
        42,
      );

      expect(firstAddedToken(sentinel).id).toBe(firstAddedToken(omitted).id);
      expect(sentinel!.newRngState).toBe(omitted!.newRngState);
    });

    it("resolves Uuid.from(value) deterministically without consuming RNG", () => {
      const run = () =>
        computePossibleTransition(
          makeUuidFrame(),
          makeUuidSimulation(() => ({
            Target: [
              { id: { __petrinautUuid: "from", value: "order-1" }, x: 2.0 },
            ],
          })),
          "t1",
          42,
        );

      const first = run();
      const second = run();
      expect(firstAddedToken(first).id).toBe(toUuid("order-1"));
      expect(firstAddedToken(second).id).toBe(toUuid("order-1"));
      // Only the firing draw consumed RNG state.
      expect(first!.newRngState).toBe(nextRandom(42)[1]);
    });

    it("forwards an input token's uuid bigint unchanged", () => {
      const result = computePossibleTransition(
        makeUuidFrame(),
        makeUuidSimulation((input) => ({
          Target: [{ id: input.Source![0]!.id, x: 3.0 }],
        })),
        "t1",
        42,
      );

      expect(firstAddedToken(result)).toEqual({ id: inputUuid, x: 3.0 });
    });

    it("throws when a Distribution is produced for a uuid element", () => {
      const distribution = {
        __brand: "distribution",
        type: "uniform",
        min: 0,
        max: 1,
      } as const;
      const simulation = makeUuidSimulation(() => ({
        Target: [{ id: distribution as never, x: 2.0 }],
      }));

      expect(() =>
        computePossibleTransition(makeUuidFrame(), simulation, "t1", 42),
      ).toThrow("produced a distribution for discrete element id");
    });
  });

  describe("string kernel outputs", () => {
    const stringColor: Color = {
      id: "stringColor",
      name: "StringColor",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [
        { elementId: "label", name: "label", type: "string" },
        { elementId: "x", name: "x", type: "real" },
      ],
    };

    const makeStringSetup = (kernelFn: TransitionKernelFn) => {
      const transition = makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
      });
      const stringPool = new StringPool();
      const simulation = {
        ...makeSimulation({
          places: [
            makePlace("p1", "Source", stringColor.id),
            makePlace("p2", "Target", stringColor.id),
          ],
          transitions: [transition],
          types: [stringColor],
          lambdaFns: new Map([["t1", () => 10.0]]),
          transitionKernelFns: new Map([["t1", kernelFn]]),
        }),
        stringPool,
      };
      const frame = makeTestFrame({
        places: {
          p1: {
            elements: stringColor.elements,
            tokens: [{ label: "order-1", x: 1.0 }],
          },
          p2: { elements: stringColor.elements, tokens: [] },
        },
        transitions: { t1: transitionState() },
        stringPool,
      });
      return { simulation, frame, stringPool };
    };

    const firstAddedToken = (
      result: ReturnType<typeof computePossibleTransition>,
      stringPool: StringPool,
    ) =>
      decodeTokenBlock(stringColor.elements, result!.add.p2![0]!, stringPool);

    it("interns equal output strings once — identical buffer bytes for equal values", () => {
      const { simulation, frame, stringPool } = makeStringSetup(() => ({
        Target: [{ label: "shipped", x: 2.0 }],
      }));

      const first = computePossibleTransition(frame, simulation, "t1", 42);
      expect(firstAddedToken(first, stringPool)).toEqual({
        label: "shipped",
        x: 2.0,
      });

      const second = computePossibleTransition(frame, simulation, "t1", 42);
      // Same output string → same pool ID → identical token bytes.
      expect(second!.add.p2![0]).toEqual(first!.add.p2![0]);
      // "" (pre-seeded) + "order-1" (input) + "shipped" — no duplicates.
      expect(stringPool.size).toBe(3);
    });

    it("forwards an input token's string unchanged and reuses its pool id", () => {
      const { simulation, frame, stringPool } = makeStringSetup((input) => ({
        Target: [{ label: input.Source![0]!.label, x: 3.0 }],
      }));

      const result = computePossibleTransition(frame, simulation, "t1", 42);

      expect(firstAddedToken(result, stringPool)).toEqual({
        label: "order-1",
        x: 3.0,
      });
      // Forwarding did not create a new pool entry.
      expect(stringPool.size).toBe(2);
    });

    it('defaults missing string values to "" and stringifies numbers', () => {
      const missing = makeStringSetup(() => ({ Target: [{ x: 2.0 }] }));
      expect(
        firstAddedToken(
          computePossibleTransition(
            missing.frame,
            missing.simulation,
            "t1",
            42,
          ),
          missing.stringPool,
        ),
      ).toEqual({ label: "", x: 2.0 });

      const numeric = makeStringSetup(() => ({
        Target: [{ label: 42 as never, x: 2.0 }],
      }));
      expect(
        firstAddedToken(
          computePossibleTransition(
            numeric.frame,
            numeric.simulation,
            "t1",
            42,
          ),
          numeric.stringPool,
        ),
      ).toEqual({ label: "42", x: 2.0 });
    });

    it("throws when a Distribution is produced for a string element", () => {
      const distribution = {
        __brand: "distribution",
        type: "uniform",
        min: 0,
        max: 1,
      } as const;
      const { simulation, frame } = makeStringSetup(() => ({
        Target: [{ label: distribution as never, x: 2.0 }],
      }));

      expect(() =>
        computePossibleTransition(frame, simulation, "t1", 42),
      ).toThrow("produced a distribution for discrete element label");
    });
  });
});
