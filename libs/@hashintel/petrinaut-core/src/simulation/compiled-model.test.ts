import { beforeAll, describe, expect, it } from "vitest";

import { sirModel } from "../examples";
import { compilePetrinautModel } from "./compiled-model";

import type { Place, SDCPN, Transition } from "../types/sdcpn";
import type {
  PetrinautChoiceLever,
  PetrinautCompiledModel,
  PetrinautControlledRun,
} from "./compiled-model";

describe("compilePetrinautModel", () => {
  let model: PetrinautCompiledModel;

  beforeAll(() => {
    model = compilePetrinautModel({ sdcpn: sirModel.petriNetDefinition });
  });

  it("generates a valid seed when one is not supplied", () => {
    const result = model.run({ maxSteps: 0 });

    expect(result.seed).toBeGreaterThanOrEqual(1);
    expect(result.seed).toBeLessThanOrEqual(2_147_483_647);
  });

  it.each([-1, 1.5, 2_147_483_648, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid seed %s",
    (seed) => {
      expect(() => model.run({ maxSteps: 0, seed })).toThrow(
        "Run config seed must be an integer between 0 and 2147483647",
      );
    },
  );

  it("accepts the full seeded RNG range", () => {
    expect(model.run({ maxSteps: 0, seed: 0 }).seed).toBe(0);
    expect(model.run({ maxSteps: 0, seed: 2_147_483_647 }).seed).toBe(
      2_147_483_647,
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite maxTime %s",
    (maxTime) => {
      expect(() => model.run({ maxTime })).toThrow(
        "Run config maxTime must be a finite non-negative number or null",
      );
    },
  );

  it("rejects negative maxTime", () => {
    expect(() => model.run({ maxTime: -1 })).toThrow(
      "Run config maxTime must be a finite non-negative number or null",
    );
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid dt %s",
    (dt) => {
      expect(() => model.run({ maxTime: 1, dt })).toThrow(
        "Run config dt must be a finite positive number",
      );
    },
  );

  it("requires at least one stopping condition", () => {
    expect(() => Reflect.apply(model.run, model, [])).toThrow(
      "Run config requires either maxTime or maxSteps",
    );
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid maxSteps %s",
    (maxSteps) => {
      expect(() => model.run({ maxSteps })).toThrow(
        "Run config maxSteps must be a non-negative integer",
      );
    },
  );

  it("keeps repeated seeded runs isolated and deterministic", () => {
    const config = {
      initialMarking: {
        place__susceptible: 20,
        place__infected: 2,
        place__recovered: 0,
      },
      parameterValues: { infection_rate: "1.5", recovery_rate: "0.8" },
      metrics: ["Infected Fraction"],
      maxSteps: 10,
      dt: 0.1,
      seed: 4242,
    } as const;

    expect(model.run(config)).toEqual(model.run(config));
  });

  it.each([
    { dt: 1, maxTime: 0.5, expectedFrames: 2 },
    { dt: 0.1, maxTime: 1, expectedFrames: 11 },
  ])(
    "stops exactly at maxTime with dt=$dt",
    ({ dt, maxTime, expectedFrames }) => {
      const result = model.run({
        initialMarking: {
          place__susceptible: 20,
          place__infected: 2,
          place__recovered: 0,
        },
        maxTime,
        dt,
        seed: 42,
      });

      expect(result.completionReason).toBe("maxTime");
      expect(result.finalTime).toBe(maxTime);
      expect(result.frameCount).toBe(expectedFrames);
    },
  );

  it("validates requested metrics before constructing a run", () => {
    expect(() =>
      model.run({
        initialMarking: { missing_place: 1 },
        metrics: ["Missing metric"],
        maxSteps: 0,
      }),
    ).toThrow('Metric "Missing metric" does not exist in the model');
  });

  it("uses the extension-sanitized model for metadata", () => {
    const restrictedModel = compilePetrinautModel({
      sdcpn: {
        places: [
          {
            id: "place",
            name: "Place",
            colorId: "color",
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        transitions: [],
        types: [
          {
            id: "color",
            name: "Color",
            iconSlug: "circle",
            displayColor: "#000000",
            elements: [{ elementId: "value", name: "value", type: "real" }],
          },
        ],
        differentialEquations: [],
        parameters: [
          {
            id: "parameter",
            name: "Parameter",
            variableName: "parameter",
            type: "real",
            defaultValue: "1",
          },
        ],
        scenarios: [],
        metrics: [],
      },
      extensions: {
        colors: false,
        stochasticity: true,
        dynamics: false,
        parameters: false,
        subnets: true,
      },
    });

    expect(restrictedModel.metadata.parameters).toEqual([]);
    expect(
      restrictedModel.metadata.places.every((place) => place.color === null),
    ).toBe(true);
  });

  it("rejects duplicate metric names before runs can overwrite results", () => {
    const metric = sirModel.petriNetDefinition.metrics?.[0];
    expect(metric).toBeDefined();

    expect(() =>
      compilePetrinautModel({
        sdcpn: {
          ...sirModel.petriNetDefinition,
          metrics: [metric!, { ...metric!, id: "duplicate-metric" }],
        },
      }),
    ).toThrow(
      'Model metric names must be unique because run results are keyed by name: "Infected Fraction"',
    );
  });

  it("rejects duplicate metric ids before HIR artifacts can be overwritten", () => {
    const metric = sirModel.petriNetDefinition.metrics?.[0];
    expect(metric).toBeDefined();

    expect(() =>
      compilePetrinautModel({
        sdcpn: {
          ...sirModel.petriNetDefinition,
          metrics: [metric!, { ...metric!, name: "Duplicate id" }],
        },
      }),
    ).toThrow(`Model metric ids must be unique: "${metric!.id}"`);
  });

  it("rejects metrics that have no compiled artifact", () => {
    expect(() =>
      compilePetrinautModel({
        sdcpn: {
          ...sirModel.petriNetDefinition,
          metrics: [{ id: "empty", name: "Empty", code: "" }],
        },
      }),
    ).toThrow(
      'Metric "Empty" has not been compiled. Check the model\'s metric diagnostics.',
    );
  });

  it("returns metric names such as __proto__ as own result properties", () => {
    const protoMetricModel = compilePetrinautModel({
      sdcpn: {
        ...sirModel.petriNetDefinition,
        metrics: [
          {
            id: "proto-metric",
            name: "__proto__",
            code: "return 7;",
          },
        ],
      },
    });

    const result = protoMetricModel.run({
      metrics: ["__proto__"],
      maxSteps: 0,
      seed: 1,
    });
    expect(Object.hasOwn(result.metrics, "__proto__")).toBe(true);
    expect(result.metrics.__proto__).toBe(7);
  });

  it("validates model references before returning a ready runner", () => {
    expect(() =>
      compilePetrinautModel({
        sdcpn: {
          places: [
            {
              id: "place",
              name: "Place",
              colorId: "missing-color",
              dynamicsEnabled: false,
              differentialEquationId: null,
              x: 0,
              y: 0,
            },
          ],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
        },
      }),
    ).toThrow(
      "Type with ID missing-color referenced by place place does not exist in SDCPN",
    );
  });

  it("enforces integer parameter types for direct Core callers", () => {
    const integerModel = compilePetrinautModel({
      sdcpn: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [
          {
            id: "count",
            name: "Count",
            variableName: "count",
            type: "integer",
            defaultValue: "1",
          },
        ],
      },
    });

    expect(() =>
      integerModel.run({
        parameterValues: { count: "1.5" },
        maxSteps: 0,
      }),
    ).toThrow('Parameter "count" must be an integer');
  });

  it.each([-1, 1.5, 4_294_967_296])(
    "rejects invalid uncolored markings for direct Core callers: %s",
    (count) => {
      expect(() =>
        model.run({
          initialMarking: { place__susceptible: count },
          maxSteps: 0,
        }),
      ).toThrow(
        "Initial marking for uncolored place place__susceptible must be an integer between 0 and 4294967295",
      );
    },
  );

  it("returns token counts only for root places advertised by metadata", () => {
    const place = (id: string) => ({
      id,
      name: id,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });
    const componentModel = compilePetrinautModel({
      sdcpn: {
        places: [place("root")],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
        componentInstances: [
          {
            id: "worker",
            name: "Worker",
            subnetId: "worker-subnet",
            parameterValues: {},
            x: 0,
            y: 0,
          },
        ],
        subnets: [
          {
            id: "worker-subnet",
            name: "Worker subnet",
            places: [place("internal")],
            transitions: [],
            types: [],
            differentialEquations: [],
            parameters: [],
            componentInstances: [],
          },
        ],
      },
    });

    expect(componentModel.metadata.places.map(({ id }) => id)).toEqual([
      "root",
    ]);
    expect(
      componentModel.run({
        initialMarking: { root: 2 },
        maxSteps: 0,
        seed: 1,
      }).finalPlaceTokenCounts,
    ).toEqual({ root: 2 });
  });

  it("accepts record arrays for colors with no elements", () => {
    const emptyColorModel = compilePetrinautModel({
      sdcpn: {
        places: [
          {
            id: "empty-colored-place",
            name: "EmptyColoredPlace",
            colorId: "empty-color",
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        transitions: [],
        types: [
          {
            id: "empty-color",
            name: "EmptyColor",
            iconSlug: "circle",
            displayColor: "#000000",
            elements: [],
          },
        ],
        differentialEquations: [],
        parameters: [],
      },
    });

    expect(
      emptyColorModel.run({
        initialMarking: { "empty-colored-place": [{}, {}] },
        maxSteps: 0,
        seed: 1,
      }).finalPlaceTokenCounts,
    ).toEqual({ "empty-colored-place": 2 });
  });
});

const place = (id: string): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const transition = (
  id: string,
  from: string[],
  to: string[],
  lambda: { type: "predicate" | "stochastic"; body: string },
): Transition => ({
  id,
  name: id,
  inputArcs: from.map((placeId) => ({ placeId, weight: 1, type: "standard" })),
  outputArcs: to.map((placeId) => ({ placeId, weight: 1 })),
  lambdaType: lambda.type,
  lambdaCode: `export default Lambda(() => ${lambda.body});`,
  transitionKernelCode: "export default TransitionKernel(() => ({}));",
  x: 0,
  y: 0,
});

/**
 * Jobs arrive at random and wait in Queue. A controller routes each to Fast
 * or Slow; RouteBlocked's predicate is always false. Left to the net, the
 * routing transitions would empty Queue at once, so a token stays in Queue
 * only if the controller leaves it there.
 */
const routingNet: SDCPN = {
  places: ["Queue", "Fast", "Slow", "Blocked", "Always"].map(place),
  transitions: [
    transition("Arrive", [], ["Queue"], { type: "stochastic", body: "2" }),
    transition("RouteFast", ["Queue"], ["Fast"], {
      type: "stochastic",
      body: "Infinity",
    }),
    transition("RouteSlow", ["Queue"], ["Slow"], {
      type: "stochastic",
      body: "Infinity",
    }),
    transition("RouteBlocked", ["Queue"], ["Blocked"], {
      type: "predicate",
      body: "false",
    }),
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
  metrics: [
    {
      id: "metric_always",
      name: "Always",
      code: "return state.places.Always.count;",
    },
  ],
};

const router = (allowWait = false): PetrinautChoiceLever[] => [
  {
    id: "route",
    transitionIds: ["RouteFast", "RouteSlow", "RouteBlocked"],
    allowWait,
  },
];

const counts = (run: PetrinautControlledRun) => {
  const frame = run.frame();
  return Object.fromEntries(
    ["Queue", "Fast", "Slow", "Blocked"].map((id) => [
      id,
      frame.getPlaceTokenCount(id),
    ]),
  );
};

/** Routes alternately to Fast and Slow until the run ends. */
const alternate = (run: PetrinautControlledRun) => {
  let decisions = 0;
  while (run.point.kind === "decision") {
    run.decide({ fire: decisions % 2 === 0 ? "RouteFast" : "RouteSlow" });
    decisions++;
  }
  return decisions;
};

describe("startControlledRun", () => {
  const model = compilePetrinautModel({ sdcpn: routingNet });

  it("fires a chosen transition before the net's own transitions can take its tokens", () => {
    const leakyNet: SDCPN = {
      ...routingNet,
      places: ["Queue", "Fast", "Leaked"].map(place),
      transitions: [
        transition("Leak", ["Queue"], ["Leaked"], {
          type: "stochastic",
          body: "Infinity",
        }),
        transition("RouteFast", ["Queue"], ["Fast"], {
          type: "predicate",
          body: "true",
        }),
      ],
      metrics: [],
    };
    const run = compilePetrinautModel({ sdcpn: leakyNet }).startControlledRun({
      levers: [{ id: "route", transitionIds: ["RouteFast"] }],
      initialMarking: { Queue: 1 },
      seed: 1,
      dt: 0.1,
      maxSteps: 1,
    });

    run.decide({ fire: "RouteFast" });

    const frame = run.frame();
    expect(frame.getPlaceTokenCount("Fast")).toBe(1);
    expect(frame.getPlaceTokenCount("Leaked")).toBe(0);
  });

  it("fires a lever's transitions only when chosen", () => {
    const run = model.startControlledRun({
      levers: router(true),
      initialMarking: { Queue: 3 },
      seed: 1,
      dt: 0.1,
      maxSteps: 5,
    });

    for (let waits = 0; waits < 5; waits++) {
      expect(run.point.kind).toBe("decision");
      run.decide({ wait: true });
    }
    expect(run.point.kind).toBe("end");
    expect(counts(run)).toMatchObject({ Fast: 0, Slow: 0 });
  });

  it("fires the chosen transition", () => {
    const run = model.startControlledRun({
      levers: router(),
      initialMarking: { Queue: 1 },
      seed: 1,
      dt: 0.1,
      maxSteps: 1,
    });

    run.decide({ fire: "RouteSlow" });

    expect(counts(run)).toMatchObject({ Fast: 0, Slow: 1 });
  });

  it("reports a transition whose predicate is false as not fireable, and refuses it", () => {
    const run = model.startControlledRun({
      levers: router(),
      initialMarking: { Queue: 1 },
      seed: 1,
      dt: 0.1,
      maxSteps: 1,
    });

    expect(run.point).toMatchObject({
      kind: "decision",
      fireable: ["RouteFast", "RouteSlow"],
    });
    expect(() => run.decide({ fire: "RouteBlocked" })).toThrow(
      'Transition "RouteBlocked" of lever "route" cannot fire now',
    );
  });

  it("judges whether a transition can fire after the frame's dynamics", () => {
    const tankNet: SDCPN = {
      places: [
        {
          ...place("Tank"),
          colorId: "tank",
          dynamicsEnabled: true,
          differentialEquationId: "fill",
        },
        place("Done"),
      ],
      transitions: [
        {
          ...transition("Drain", ["Tank"], ["Done"], {
            type: "predicate",
            body: "true",
          }),
          lambdaCode:
            "export default Lambda((tokens) => tokens.Tank[0].level < 1);",
        },
      ],
      types: [
        {
          id: "tank",
          name: "Tank",
          iconSlug: "circle",
          displayColor: "#000000",
          elements: [{ elementId: "level", name: "level", type: "real" }],
        },
      ],
      differentialEquations: [
        {
          id: "fill",
          name: "Fill",
          colorId: "tank",
          code: "export default Dynamics((tokens) => tokens.map(() => ({ level: 1 })));",
        },
      ],
      parameters: [],
      metrics: [],
    };
    const tankModel = compilePetrinautModel({ sdcpn: tankNet });
    const start = (level: number) =>
      tankModel.startControlledRun({
        levers: [{ id: "drain", transitionIds: ["Drain"] }],
        initialMarking: { Tank: [{ level }] },
        seed: 1,
        dt: 0.1,
        maxSteps: 1,
      });

    // The level rises by 0.1 a frame, so 0.95 is under 1 before the dynamics
    // and over it after them.
    expect(start(0.95).point.kind).toBe("end");

    const run = start(0.85);
    run.decide({ fire: "Drain" });
    expect(run.frame().getPlaceTokenCount("Done")).toBe(1);
  });

  it("asks a waiting lever again once the wait's simulation time has passed", () => {
    const run = model.startControlledRun({
      levers: router(true),
      initialMarking: { Queue: 3 },
      seed: 1,
      dt: 0.3,
      maxTime: 5,
    });

    run.decide({ wait: { for: 1 } });

    expect(run.point.kind).toBe("decision");
    expect(run.point.time).toBeCloseTo(1.2);
  });

  it("sets the fields of the tokens a chosen transition adds", () => {
    const orderNet: SDCPN = {
      places: [place("Due"), { ...place("Shipped"), colorId: "order" }],
      transitions: [
        {
          ...transition("Ship", ["Due"], ["Shipped"], {
            type: "predicate",
            body: "true",
          }),
          transitionKernelCode:
            "export default TransitionKernel(() => ({ Shipped: [{ lots: 1 }] }));",
        },
      ],
      types: [
        {
          id: "order",
          name: "Order",
          iconSlug: "circle",
          displayColor: "#000000",
          elements: [{ elementId: "lots", name: "lots", type: "real" }],
        },
      ],
      differentialEquations: [],
      parameters: [],
      metrics: [],
    };
    const run = compilePetrinautModel({ sdcpn: orderNet }).startControlledRun({
      levers: [{ id: "ship", transitionIds: ["Ship"] }],
      initialMarking: { Due: 1 },
      seed: 1,
      dt: 0.1,
      maxSteps: 1,
    });

    run.decide({ fire: "Ship", outcome: { Shipped: { lots: 3 } } });

    expect(run.frame().getPlaceTokens(orderNet.places[1]!)).toEqual([
      { lots: 3 },
    ]);
  });

  it("reproduces a run from its seed and choices", () => {
    const config = {
      levers: router(),
      seed: 4242,
      dt: 0.1,
      maxTime: 20,
    };

    const first = model.startControlledRun(config);
    const firstDecisions = alternate(first);
    const second = model.startControlledRun(config);
    const secondDecisions = alternate(second);

    expect(firstDecisions).toBeGreaterThan(10);
    expect(secondDecisions).toBe(firstDecisions);
    expect(counts(second)).toEqual(counts(first));
  });

  it("plays a fork out independently of the run it was forked from", () => {
    const config = {
      levers: router(),
      initialMarking: { Always: 1 },
      integrate: ["Always"],
      seed: 4242,
      dt: 0.1,
      maxTime: 20,
    };
    const unforked = model.startControlledRun(config);
    alternate(unforked);

    const run = model.startControlledRun(config);
    run.decide({ fire: "RouteFast" });
    run.decide({ fire: "RouteSlow" });
    const fork = run.fork();
    while (fork.point.kind === "decision") {
      fork.decide({ fire: "RouteFast" });
    }
    const twin = run.fork();
    let decisions = 2;
    while (run.point.kind === "decision") {
      run.decide({ fire: decisions % 2 === 0 ? "RouteFast" : "RouteSlow" });
      decisions++;
    }
    alternate(twin);

    expect(counts(fork)).not.toEqual(counts(unforked));
    expect(counts(run)).toEqual(counts(unforked));
    expect(run.integrals()).toEqual(unforked.integrals());
    expect(counts(twin)).toEqual(counts(unforked));
  });

  it("integrates metrics over simulation time, up to maxTime", () => {
    const run = model.startControlledRun({
      levers: router(),
      initialMarking: { Always: 1 },
      integrate: ["Always"],
      seed: 1,
      dt: 0.3,
      maxTime: 1,
    });
    alternate(run);

    expect(run.point).toMatchObject({ kind: "end", reason: "maxTime" });
    expect(run.integrals().Always).toBeCloseTo(1);
  });
});
