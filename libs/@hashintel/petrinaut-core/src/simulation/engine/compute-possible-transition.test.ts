/* eslint-disable no-param-reassign -- buffer-ABI kernel mocks write into the
   staging views they receive */
import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../hir";
import { instantiateHirBufferKernel } from "../../hir-runtime";
import { createEngineFrameLayout } from "../frames/internal-frame";
import { makeCompiledTransition } from "./compiled-transition.test-helpers";
import { computePossibleTransition as computePossibleTransitionImpl } from "./compute-possible-transition";
import { nextRandom } from "./seeded-rng";
import { StringPool } from "./string-pool";
import {
  decodeTokenBlock,
  makeTestFrame,
  type TestFrame,
} from "./token-layout.test-helpers";
import { formatUuid, parseUuid, toUuid } from "./uuid";

import type {
  HirCompiledBufferKernel,
  HirCompiledBufferLambda,
} from "../../hir-runtime";
import type { Color, Place, SDCPN, Transition } from "../../types/sdcpn";
import type { SimulationInstance } from "./types";

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
    lambdaCode: "",
    transitionKernelCode: "",
    x: 0,
    y: 0,
    ...transition,
  };
}

const makeMiniSdcpn = (
  places: Place[],
  types: Color[],
  transition: Transition,
): SDCPN => ({
  types,
  differentialEquations: [],
  parameters: [],
  places,
  transitions: [transition],
});

/** Compiles a transition's kernel code to a real buffer program and
 * instantiates it against `stringPool`. */
function compileKernelFn({
  places,
  types,
  transition,
  stringPool,
}: {
  places: Place[];
  types: Color[];
  transition: Transition;
  stringPool: StringPool;
}): HirCompiledBufferKernel {
  const { artifacts, failures } = compileHirArtifacts(
    makeMiniSdcpn(places, types, { ...transition, lambdaCode: "" }),
  );
  expect(failures).toEqual([]);
  return instantiateHirBufferKernel(
    artifacts.kernels[transition.id]!.source,
    {},
    stringPool,
  );
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
      kernelFns: new Map<string, HirCompiledBufferKernel>([
        [
          "t1",
          (_f64, _u64, _u8, _placeBases, _indices, outF64) => {
            outF64[0] = 5.0;
          },
        ],
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
    });
    // type1 tokens are a single f64 (x) — stride 8 bytes.
    let lambdaSeen: { source: number; guard: number } | null = null;
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Source", "type1"),
        makePlace("p2", "Guard", "type1"),
        makePlace("p3", "Target", "type1"),
      ],
      transitions: [transition],
      types: [type1],
      lambdaFns: new Map<string, HirCompiledBufferLambda>([
        [
          "t1",
          (f64, _u64, _u8, placeBases, indices) => {
            lambdaSeen = {
              source: f64[(placeBases[0]! + indices[0]! * 8) / 8]!,
              guard: f64[(placeBases[1]! + indices[1]! * 8) / 8]!,
            };
            return true;
          },
        ],
      ]),
      kernelFns: new Map<string, HirCompiledBufferKernel>([
        [
          "t1",
          (f64, _u64, _u8, placeBases, indices, outF64) => {
            // Forward the read arc (Guard) token's x to the output.
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

    const result = computePossibleTransition(frame, simulation, "t1", 42);

    expect(result).not.toBeNull();
    expect(lambdaSeen).toEqual({ source: 3.0, guard: 7.0 });
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
    });
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Place 1", "type1"),
        makePlace("p2", "Place 2", "type1"),
      ],
      transitions: [transition],
      types: [type1],
      lambdaFns: new Map([["t1", () => 10.0]]),
      kernelFns: new Map<string, HirCompiledBufferKernel>([
        [
          "t1",
          (_f64, _u64, _u8, _placeBases, _indices, outF64) => {
            outF64[0] = 2.0;
          },
        ],
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

  it("reads typed input tokens and encodes typed output tokens", () => {
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
    // Packed layout: amount(f64)@0, count(f64)@8, active(u8)@16 — stride 24.
    const transition = makeTransition({
      id: "t1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p2", weight: 1 }],
    });
    let lambdaSeen: unknown;
    const simulation = makeSimulation({
      places: [
        makePlace("p1", "Source", typedColor.id),
        makePlace("p2", "Target", typedColor.id),
      ],
      transitions: [transition],
      types: [typedColor],
      lambdaFns: new Map<string, HirCompiledBufferLambda>([
        [
          "t1",
          (f64, _u64, u8, placeBases, indices) => {
            const base = placeBases[0]! + indices[0]! * 24;
            lambdaSeen = {
              amount: f64[base / 8],
              count: Math.round(f64[(base + 8) / 8]!),
              active: u8[base + 16] !== 0,
            };
            return 10.0;
          },
        ],
      ]),
      kernelFns: new Map<string, HirCompiledBufferKernel>([
        [
          "t1",
          (_f64, _u64, _u8, _placeBases, _indices, outF64, _outU64, outU8) => {
            outF64[0] = 2.5;
            outF64[1] = Math.round(3.6); // integer attributes are pre-rounded
            outU8[16] = 0;
          },
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

    expect(lambdaSeen).toEqual({
      amount: 1.25,
      count: 3,
      active: true,
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
    const uuidPlaces = [
      makePlace("p1", "Source", uuidColor.id),
      makePlace("p2", "Target", uuidColor.id),
    ];

    const makeUuidTransition = (transitionKernelCode: string) =>
      makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
        transitionKernelCode,
      });

    const makeUuidSimulation = (kernelCode: string) => {
      const transition = makeUuidTransition(kernelCode);
      return makeSimulation({
        places: uuidPlaces,
        transitions: [transition],
        types: [uuidColor],
        lambdaFns: new Map([["t1", () => 10.0]]),
        kernelFns: new Map([
          [
            "t1",
            compileKernelFn({
              places: uuidPlaces,
              types: [uuidColor],
              transition,
              stringPool: new StringPool(),
            }),
          ],
        ]),
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
      const simulation = makeUuidSimulation(
        `export default TransitionKernel(() => ({ Target: [{ x: 2.0 }] }));`,
      );

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
      expect(first!.newRngState).not.toBe(nextRandom(42)[1]);
    });

    it("resolves the Uuid.generate() sentinel with the same seeded draw as omission", () => {
      const omitted = computePossibleTransition(
        makeUuidFrame(),
        makeUuidSimulation(
          `export default TransitionKernel(() => ({ Target: [{ x: 2.0 }] }));`,
        ),
        "t1",
        42,
      );
      const sentinel = computePossibleTransition(
        makeUuidFrame(),
        makeUuidSimulation(
          `export default TransitionKernel(() => ({ Target: [{ id: Uuid.generate(), x: 2.0 }] }));`,
        ),
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
          makeUuidSimulation(
            `export default TransitionKernel(() => ({ Target: [{ id: Uuid.from("order-1"), x: 2.0 }] }));`,
          ),
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
        makeUuidSimulation(
          `export default TransitionKernel((input) => ({ Target: [{ id: input.Source[0].id, x: 3.0 }] }));`,
        ),
        "t1",
        42,
      );

      expect(firstAddedToken(result)).toEqual({ id: inputUuid, x: 3.0 });
    });

    it("rejects a Distribution for a uuid element at compile time", () => {
      const { failures } = compileHirArtifacts(
        makeMiniSdcpn(
          uuidPlaces,
          [uuidColor],
          makeUuidTransition(
            `export default TransitionKernel(() => ({ Target: [{ id: Distribution.Uniform(0, 1), x: 2.0 }] }));`,
          ),
        ),
      );

      expect(
        failures.map((failure) => `${failure.itemType}:${failure.itemId}`),
      ).toEqual(["transition-kernel:t1"]);
      expect(
        failures[0]!.diagnostics.map((diagnostic) => diagnostic.message),
      ).toEqual(
        expect.arrayContaining([expect.stringMatching(/discrete \(uuid\)/)]),
      );
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
    const stringPlaces = [
      makePlace("p1", "Source", stringColor.id),
      makePlace("p2", "Target", stringColor.id),
    ];

    const makeStringTransition = (transitionKernelCode: string) =>
      makeTransition({
        id: "t1",
        inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "p2", weight: 1 }],
        transitionKernelCode,
      });

    const makeStringSetup = (kernelCode: string) => {
      const transition = makeStringTransition(kernelCode);
      const stringPool = new StringPool();
      const simulation = {
        ...makeSimulation({
          places: stringPlaces,
          transitions: [transition],
          types: [stringColor],
          lambdaFns: new Map([["t1", () => 10.0]]),
          kernelFns: new Map([
            [
              "t1",
              compileKernelFn({
                places: stringPlaces,
                types: [stringColor],
                transition,
                stringPool,
              }),
            ],
          ]),
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
      const { simulation, frame, stringPool } = makeStringSetup(
        `export default TransitionKernel(() => ({ Target: [{ label: "shipped", x: 2.0 }] }));`,
      );

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
      const { simulation, frame, stringPool } = makeStringSetup(
        `export default TransitionKernel((input) => ({ Target: [{ label: input.Source[0].label, x: 3.0 }] }));`,
      );

      const result = computePossibleTransition(frame, simulation, "t1", 42);

      expect(firstAddedToken(result, stringPool)).toEqual({
        label: "order-1",
        x: 3.0,
      });
      // Forwarding did not create a new pool entry.
      expect(stringPool.size).toBe(2);
    });

    it("rejects omitted or non-string values for string elements at compile time", () => {
      // Omitting a string attribute is a compile failure (no "" default).
      const omitted = compileHirArtifacts(
        makeMiniSdcpn(
          stringPlaces,
          [stringColor],
          makeStringTransition(
            `export default TransitionKernel(() => ({ Target: [{ x: 2.0 }] }));`,
          ),
        ),
      );
      expect(
        omitted.failures.map(
          (failure) => `${failure.itemType}:${failure.itemId}`,
        ),
      ).toEqual(["transition-kernel:t1"]);
      expect(omitted.failures[0]!.diagnostics[0]!.message).toMatch(
        /missing the `label` attribute/,
      );

      // Numbers are not stringified implicitly either.
      const numeric = compileHirArtifacts(
        makeMiniSdcpn(
          stringPlaces,
          [stringColor],
          makeStringTransition(
            `export default TransitionKernel(() => ({ Target: [{ label: 42, x: 2.0 }] }));`,
          ),
        ),
      );
      expect(
        numeric.failures.map(
          (failure) => `${failure.itemType}:${failure.itemId}`,
        ),
      ).toEqual(["transition-kernel:t1"]);
      expect(numeric.failures[0]!.diagnostics[0]!.message).toMatch(
        /`label` is a string attribute/,
      );
    });

    it("rejects a Distribution for a string element at compile time", () => {
      const { failures } = compileHirArtifacts(
        makeMiniSdcpn(
          stringPlaces,
          [stringColor],
          makeStringTransition(
            `export default TransitionKernel(() => ({ Target: [{ label: Distribution.Uniform(0, 1), x: 2.0 }] }));`,
          ),
        ),
      );

      expect(
        failures.map((failure) => `${failure.itemType}:${failure.itemId}`),
      ).toEqual(["transition-kernel:t1"]);
      expect(
        failures[0]!.diagnostics.map((diagnostic) => diagnostic.message),
      ).toEqual(
        expect.arrayContaining([expect.stringMatching(/discrete \(string\)/)]),
      );
    });
  });
});
