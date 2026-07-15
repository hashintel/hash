import { beforeAll, describe, expect, it } from "vitest";

import { sirModel } from "../examples";
import { compilePetrinautModel } from "./compiled-model";

import type { PetrinautCompiledModel } from "./compiled-model";

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
    expect(() => model.run()).toThrow(
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
