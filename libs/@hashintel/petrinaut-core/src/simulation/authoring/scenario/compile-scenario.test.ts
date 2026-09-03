import { describe, expect, it } from "vitest";

import { lowerScenarioToHir } from "../../../hir/scenario";
import { compileScenario, prepareScenarioCompiler } from "./compile-scenario";

import type { Color, Parameter, Place, Scenario } from "../../../types/sdcpn";
import type { CompileScenarioOptions } from "./compile-scenario";

// -- Helpers ------------------------------------------------------------------

/** `compileScenario` with the scenario lowered inline, as Node callers do. */
const compile = (
  testScenario: Scenario,
  netParameters: Parameter[] = [],
  places: Place[] = [],
  types: Color[] = [],
  options: CompileScenarioOptions = {},
): ReturnType<typeof compileScenario> =>
  compileScenario(
    testScenario,
    lowerScenarioToHir(testScenario),
    netParameters,
    places,
    types,
    options,
  );

const param = (
  id: string,
  variableName: string,
  defaultValue: string,
  type: Parameter["type"] = "real",
): Parameter => ({
  id,
  name: variableName,
  variableName,
  type,
  defaultValue,
});

const scenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  id: "s1",
  name: "Test",
  scenarioParameters: [],
  parameterOverrides: {},
  initialState: { type: "per_place", content: {} },
  ...overrides,
});

const place = (id: string, name: string, colorId: string | null): Place => ({
  id,
  name,
  colorId,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const color = (id: string): Color => ({
  id,
  name: "Type 1",
  iconSlug: "circle",
  displayColor: "#000000",
  elements: [
    { elementId: "x", name: "x", type: "real" },
    { elementId: "y", name: "y", type: "real" },
  ],
});

// -- Tests --------------------------------------------------------------------

describe("compileScenario", () => {
  describe("basic evaluation", () => {
    it("returns net parameter defaults when no overrides", () => {
      const result = compile(scenario(), [param("p1", "x", "10")]);

      expect(result).toEqual({
        ok: true,
        result: {
          parameterValues: { x: "10" },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any is typed as any
          initialState: expect.any(Object),
        },
      });
    });

    it("evaluates a constant parameter override", () => {
      const result = compile(scenario({ parameterOverrides: { p1: "42" } }), [
        param("p1", "x", "10"),
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.parameterValues.x).toBe("42");
      }
    });

    it("preserves boolean defaults and overrides as boolean strings", () => {
      const withDefault = compile(scenario(), [
        param("enabled", "enabled", "true", "boolean"),
      ]);
      const withOverride = compile(
        scenario({ parameterOverrides: { enabled: "false" } }),
        [param("enabled", "enabled", "true", "boolean")],
      );

      expect(withDefault).toMatchObject({
        ok: true,
        result: { parameterValues: { enabled: "true" } },
      });
      expect(withOverride).toMatchObject({
        ok: true,
        result: { parameterValues: { enabled: "false" } },
      });
    });

    it("rejects fractional integer parameter overrides", () => {
      const result = compile(
        scenario({ parameterOverrides: { count: "1.5" } }),
        [param("count", "count", "1", "integer")],
      );

      expect(result).toEqual({
        ok: false,
        errors: [
          {
            source: "parameterOverride",
            itemId: "count",
            message:
              'Parameter "count" expression evaluated to 1.5, expected an integer.',
          },
        ],
      });
    });

    it("evaluates an initial state expression", () => {
      const result = compile(
        scenario({
          initialState: { type: "per_place", content: { place1: "100" } },
        }),
        [],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toBe(100);
      }
    });

    it("treats empty expressions as defaults", () => {
      const result = compile(
        scenario({
          parameterOverrides: { p1: "", p2: "  " },
          initialState: { type: "per_place", content: { place1: "" } },
        }),
        [param("p1", "x", "5"), param("p2", "y", "7")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.parameterValues).toEqual({ x: "5", y: "7" });
        expect(result.result.initialState.place1).toBe(0);
      }
    });
  });

  describe("scenario parameters", () => {
    it("makes scenario parameters accessible via scenario object", () => {
      const result = compile(
        scenario({
          scenarioParameters: [
            { type: "real", identifier: "rate", default: 3.5 },
          ],
          parameterOverrides: { p1: "scenario.rate * 2" },
        }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.parameterValues.x).toBe("7");
      }
    });

    it("allows scenario params in initial state expressions", () => {
      const result = compile(
        scenario({
          scenarioParameters: [
            { type: "integer", identifier: "count", default: 50 },
          ],
          initialState: {
            type: "per_place",
            content: { place1: "scenario.count" },
          },
        }),
        [],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toBe(50);
      }
    });

    it("exposes boolean scenario parameters as booleans to bindings", () => {
      const result = compile(
        scenario({
          scenarioParameters: [
            { type: "boolean", identifier: "enabled", default: 1 },
          ],
          parameterOverrides: { enabled: "scenario.enabled" },
        }),
        [param("enabled", "enabled", "false", "boolean")],
      );

      expect(result).toMatchObject({
        ok: true,
        result: { parameterValues: { enabled: "true" } },
      });
    });

    it("uses supplied scenario parameter values over defaults", () => {
      const result = compile(
        scenario({
          scenarioParameters: [
            { type: "integer", identifier: "count", default: 50 },
          ],
          parameterOverrides: { p1: "scenario.count * 2" },
          initialState: {
            type: "per_place",
            content: { place1: "scenario.count" },
          },
        }),
        [param("p1", "x", "0")],
        [],
        [],
        { scenarioParameterValues: { count: 75 } },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.parameterValues.x).toBe("150");
        expect(result.result.initialState.place1).toBe(75);
      }
    });

    it("rejects non-finite supplied scenario parameter values", () => {
      const result = compile(
        scenario({
          scenarioParameters: [
            { type: "real", identifier: "rate", default: 1 },
          ],
        }),
        [],
        [],
        [],
        { scenarioParameterValues: { rate: Number.NaN } },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual([
          {
            source: "scenarioParameter",
            itemId: "rate",
            message: 'Scenario parameter "rate" must be a finite number.',
          },
        ]);
      }
    });
  });

  describe("expression features", () => {
    it("supports Math functions", () => {
      const result = compile(
        scenario({ parameterOverrides: { p1: "Math.sqrt(144)" } }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.parameterValues.x).toBe("12");
      }
    });

    it("supports complex expressions with both parameters and scenario", () => {
      const result = compile(
        scenario({
          scenarioParameters: [
            { type: "real", identifier: "altitude", default: 80 },
          ],
          parameterOverrides: {
            p1: "Math.sqrt(400000 / scenario.altitude)",
          },
        }),
        [param("p1", "velocity", "0")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Number(result.result.parameterValues.velocity)).toBeCloseTo(
          Math.sqrt(400000 / 80),
        );
      }
    });

    it("supports ternary expressions", () => {
      const result = compile(
        scenario({
          scenarioParameters: [
            { type: "boolean", identifier: "large", default: 1 },
          ],
          initialState: {
            type: "per_place",
            content: { place1: "scenario.large ? 1000 : 10" },
          },
        }),
        [],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toBe(1000);
      }
    });

    it("rounds initial state to integers", () => {
      const result = compile(
        scenario({
          initialState: { type: "per_place", content: { place1: "3.7" } },
        }),
        [],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toBe(4);
      }
    });

    it("clamps negative initial state to 0", () => {
      const result = compile(
        scenario({
          initialState: { type: "per_place", content: { place1: "-5" } },
        }),
        [],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toBe(0);
      }
    });
  });

  describe("colored places (number[][] data)", () => {
    it("converts number[][] to token records", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "per_place",
            content: {
              place1: [
                [1, 2],
                [4, 5],
              ],
            },
          },
        }),
        [],
        [
          {
            id: "place1",
            name: "Place 1",
            colorId: "type1",
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        [
          {
            id: "type1",
            name: "Type 1",
            iconSlug: "circle",
            displayColor: "#000000",
            elements: [
              { elementId: "x", name: "x", type: "real" },
              { elementId: "y", name: "y", type: "real" },
            ],
          },
        ],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toEqual([
          { x: 1, y: 2 },
          { x: 4, y: 5 },
        ]);
      }
    });

    it("converts typed token row values to token records", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "per_place",
            content: {
              place1: [[1.5, 2.7, true], []],
            },
          },
        }),
        [],
        [place("place1", "Place 1", "type1")],
        [
          {
            id: "type1",
            name: "Typed entity",
            iconSlug: "circle",
            displayColor: "#000000",
            elements: [
              { elementId: "amount", name: "amount", type: "real" },
              { elementId: "count", name: "count", type: "integer" },
              { elementId: "active", name: "active", type: "boolean" },
            ],
          },
        ],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toEqual([
          {
            amount: 1.5,
            count: 3,
            active: true,
          },
          {
            amount: 0,
            count: 0,
            active: false,
          },
        ]);
      }
    });

    it("handles empty token array", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "per_place",
            content: { place1: [] },
          },
        }),
        [],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toEqual([]);
      }
    });

    it("converts empty colored token rows to zero-valued token records", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "per_place",
            content: { place1: [[], []] },
          },
        }),
        [],
        [place("place1", "Place 1", "type1")],
        [color("type1")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toEqual([
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ]);
      }
    });

    it("handles mixed colored and uncolored places", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "per_place",
            content: {
              uncolored: "42",
              colored: [
                [10, 20],
                [30, 40],
              ],
            },
          },
        }),
        [],
        [
          place("uncolored", "Uncolored", null),
          place("colored", "Colored", "type1"),
        ],
        [color("type1")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.uncolored).toBe(42);
        expect(result.result.initialState.colored).toEqual([
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ]);
      }
    });

    it("reports colored token rows when place metadata is missing", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "per_place",
            content: {
              colored: [[10, 20]],
            },
          },
        }),
        [],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual([
          {
            source: "initialState",
            itemId: "colored",
            message:
              'Initial state for place "colored" uses colored token rows, but the place does not exist.',
          },
        ]);
      }
    });

    it("reports empty colored token rows when place metadata is missing", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "per_place",
            content: {
              colored: [[], []],
            },
          },
        }),
        [],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual([
          {
            source: "initialState",
            itemId: "colored",
            message:
              'Initial state for place "colored" uses colored token rows, but the place does not exist.',
          },
        ]);
      }
    });

    it("reports colored token rows when color elements are missing", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "per_place",
            content: {
              colored: [[10, 20]],
            },
          },
        }),
        [],
        [place("colored", "Colored", "missing-type")],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual([
          {
            source: "initialState",
            itemId: "colored",
            message:
              'Initial state for place "colored" uses colored token rows, but the place has no color elements.',
          },
        ]);
      }
    });

    it("reports empty colored token rows when color elements are missing", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "per_place",
            content: {
              colored: [[], []],
            },
          },
        }),
        [],
        [place("colored", "Colored", "missing-type")],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual([
          {
            source: "initialState",
            itemId: "colored",
            message:
              'Initial state for place "colored" uses colored token rows, but the place has no color elements.',
          },
        ]);
      }
    });
  });

  describe("uuid elements", () => {
    const uuidType: Color = {
      id: "type1",
      name: "Typed entity",
      iconSlug: "circle",
      displayColor: "#000000",
      elements: [
        { elementId: "id", name: "id", type: "uuid" },
        { elementId: "x", name: "x", type: "real" },
      ],
    };

    const compileRows = (rows: (number | boolean | string)[][]) =>
      compile(
        scenario({
          initialState: { type: "per_place", content: { place1: rows } },
        }),
        [],
        [place("place1", "Place 1", "type1")],
        [uuidType],
      );

    const firstTokenId = (result: ReturnType<typeof compileRows>): unknown => {
      if (!result.ok) {
        throw new Error("Expected scenario to compile");
      }
      return (
        result.result.initialState.place1 as Record<string, unknown>[]
      )[0]!.id;
    };

    it("normalizes uuid rows to canonical lowercase strings", () => {
      const result = compileRows([["0F9A3B5C-7D1E-4A2B-8C3D-4E5F6A7B8C9D", 1]]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toEqual([
          { id: "0f9a3b5c-7d1e-4a2b-8c3d-4e5f6a7b8c9d", x: 1 },
        ]);
        // JSON-serializable at rest.
        expect(() => JSON.stringify(result.result.initialState)).not.toThrow();
      }
    });

    it("converts arbitrary text to a stable UUIDv5 string", () => {
      const firstId = firstTokenId(compileRows([["order-1", 1]]));
      const secondId = firstTokenId(compileRows([["order-1", 2]]));
      const differentId = firstTokenId(compileRows([["order-2", 1]]));

      expect(firstId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(secondId).toBe(firstId);
      expect(differentId).not.toBe(firstId);
    });

    it("defaults missing uuid columns to the nil uuid string", () => {
      const result = compileRows([[]]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toEqual([
          { id: "00000000-0000-0000-0000-000000000000", x: 0 },
        ]);
      }
    });
  });

  describe("string elements", () => {
    const stringType: Color = {
      id: "type1",
      name: "Labelled entity",
      iconSlug: "circle",
      displayColor: "#000000",
      elements: [
        { elementId: "label", name: "label", type: "string" },
        { elementId: "x", name: "x", type: "real" },
      ],
    };

    const compileRows = (rows: (number | boolean | string)[][]) =>
      compile(
        scenario({
          initialState: { type: "per_place", content: { place1: rows } },
        }),
        [],
        [place("place1", "Place 1", "type1")],
        [stringType],
      );

    it("passes string values through literally (no trim, no uuid coercion)", () => {
      const result = compileRows([
        ["alpha", 1],
        ["  spaced text  ", 2],
        ["", 3],
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toEqual([
          { label: "alpha", x: 1 },
          { label: "  spaced text  ", x: 2 },
          { label: "", x: 3 },
        ]);
        // JSON-serializable at rest.
        expect(() => JSON.stringify(result.result.initialState)).not.toThrow();
      }
    });

    it('defaults missing string columns to "" and stringifies numbers', () => {
      const missing = compileRows([[]]);
      expect(missing.ok).toBe(true);
      if (missing.ok) {
        expect(missing.result.initialState.place1).toEqual([
          { label: "", x: 0 },
        ]);
      }

      const numeric = compileRows([[42, 1]]);
      expect(numeric.ok).toBe(true);
      if (numeric.ok) {
        expect(numeric.result.initialState.place1).toEqual([
          { label: "42", x: 1 },
        ]);
      }
    });
  });

  describe("evaluation order", () => {
    it("initial state sees overridden parameter values", () => {
      const result = compile(
        scenario({
          parameterOverrides: { p1: "99" },
          initialState: {
            type: "per_place",
            content: { place1: "parameters.x" },
          },
        }),
        [param("p1", "x", "1")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        // parameters.x should be the overridden 99, not the default 1
        expect(result.result.initialState.place1).toBe(99);
      }
    });
  });

  describe("error handling", () => {
    it("reports syntax errors in expressions", () => {
      const result = compile(scenario({ parameterOverrides: { p1: "1 +" } }), [
        param("p1", "x", "0"),
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.source).toBe("parameterOverride");
        expect(result.errors[0]!.itemId).toBe("p1");
      }
    });

    it("reports non-numeric results", () => {
      const result = compile(
        scenario({ parameterOverrides: { p1: '"hello"' } }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]!.message).toContain("must produce a number");
      }
    });

    it("reports NaN results", () => {
      const result = compile(
        scenario({
          initialState: { type: "per_place", content: { place1: "0 / 0" } },
        }),
        [],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]!.source).toBe("initialState");
      }
    });

    it("reports runtime errors (undefined variable)", () => {
      const result = compile(
        scenario({ parameterOverrides: { p1: "nonexistent" } }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
      }
    });

    it("collects multiple errors", () => {
      const result = compile(
        scenario({
          parameterOverrides: { p1: "bad +", p2: '"string"' },
          initialState: {
            type: "per_place",
            content: { place1: "also bad +" },
          },
        }),
        [param("p1", "x", "0"), param("p2", "y", "0")],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  // Scenario code compiles through the HIR and is interpreted: there is no
  // `new Function` on this path, so escape routes are compile errors rather
  // than sandbox behaviours.
  describe("restricted subset", () => {
    const rejects = (expression: string) => {
      const result = compile(
        scenario({ parameterOverrides: { p1: expression } }),
        [param("p1", "x", "0")],
      );
      expect(result.ok).toBe(false);
      return result.ok ? [] : result.errors;
    };

    it("rejects global identifiers (window, globalThis, process, Function)", () => {
      rejects("typeof window");
      rejects("globalThis");
      rejects("process.pid");
      rejects("typeof Function");
    });

    it("rejects constructor-chain walks as out-of-subset calls", () => {
      rejects("({}).constructor.constructor('return 1')()");
      rejects(
        "(function*(){}).constructor('return process.pid')().next().value",
      );
      rejects("(1n).constructor.constructor('return process.pid')()");
    });

    it("rejects reads of undeclared parameter properties", () => {
      // `parameters.constructor` is not a declared net parameter.
      const errors = rejects("parameters.constructor");
      expect(
        errors.some((error) => error.message.includes("Unknown parameter")),
      ).toBe(true);
    });

    it("rejects array methods outside the subset", () => {
      // `.filter` / `.slice` / `.flatMap` are not part of the compiled
      // subset — only `.map`, `.reduce` and `.concat` lower.
      const errors = rejects(
        "[1, 2, 3].map((n) => n * 2).filter((n) => n > 2).slice(0).concat([0]).length",
      );
      expect(
        errors.some((error) => error.message.includes("calls are supported")),
      ).toBe(true);
    });

    it("rejects helper property access", () => {
      rejects("range.constructor === undefined ? 1 : 2");
    });

    it("allows Math", () => {
      const result = compile(
        scenario({ parameterOverrides: { p1: "Math.PI" } }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Number(result.result.parameterValues.x)).toBeCloseTo(Math.PI);
      }
    });

    it("allows the subset's array methods", () => {
      const result = compile(
        scenario({
          parameterOverrides: {
            p1: "[1, 2, 3].map((n) => n * 2).concat([0]).length",
          },
        }),
        [param("p1", "x", "0")],
      );

      expect(result).toMatchObject({
        ok: true,
        result: { parameterValues: { x: "4" } },
      });
    });

    it("does not mutate built-in prototypes while evaluating", () => {
      compile(scenario({ parameterOverrides: { p1: "1 + 1" } }), [
        param("p1", "x", "0"),
      ]);
      expect({}.constructor).toBe(Object);
      expect(Object.constructor).toBe(Function);
    });
  });

  describe("initial state as code", () => {
    const netPlaces = [
      place("pl1", "Space", "c1"),
      place("pl2", "Queue", null),
    ];
    const netTypes = [color("c1")];

    it("reports unknown place names even when the checker cannot see them", () => {
      // A ternary over records with different keys collapses the inferred
      // return type to unknown, so the type checker cannot flag `Nowhere`;
      // evaluation reports it instead of silently skipping.
      const result = compile(
        scenario({
          initialState: {
            type: "code",
            content: "return 1 > 2 ? { Queue: 1 } : { Nowhere: 1 };",
          },
        }),
        [],
        netPlaces,
        netTypes,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]!.message).toContain(
          "`Nowhere`, which is not a place",
        );
      }
    });

    it("matches JavaScript truncation for Array.from lengths", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "code",
            content: "return { Queue: Array.from({ length: 2.7 }).length };",
          },
        }),
        [],
        netPlaces,
        netTypes,
      );
      // `Array.from({ length: 2.7 })` has 2 elements in JavaScript.
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.pl2).toBe(2);
      }
    });

    it("builds colored tokens from Array.from(...).map(...)", () => {
      // Regression: this exact shape used to fail with "Access to
      // .constructor is blocked inside user code." because `.map` reads the
      // array's constructor internally.
      const result = compile(
        scenario({
          scenarioParameters: [
            { identifier: "number_of_satellites", type: "integer", default: 3 },
          ],
          initialState: {
            type: "code",
            content: `return {
              Space: Array.from({ length: scenario.number_of_satellites }).map((_, i) => ({
                x: 10 * i,
                y: 10 * i,
              })),
            };`,
          },
        }),
        [],
        netPlaces,
        netTypes,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.pl1).toEqual([
          { x: 0, y: 0 },
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ]);
      }
    });

    it("builds colored tokens from range(...).map(...)", () => {
      const result = compile(
        scenario({
          scenarioParameters: [
            { identifier: "number_of_satellites", type: "integer", default: 2 },
          ],
          initialState: {
            type: "code",
            content: `return {
              Space: range(scenario.number_of_satellites).map((i) => ({ x: 10 * i, y: 0 })),
              Queue: range(2, 6).length,
            };`,
          },
        }),
        [],
        netPlaces,
        netTypes,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.pl1).toEqual([
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]);
        expect(result.result.initialState.pl2).toBe(4);
      }
    });

    it("reports code errors with the __code__ item id", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "code",
            content: "return { Queue: range(0, 5, 0).length };",
          },
        }),
        [],
        netPlaces,
        netTypes,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.source).toBe("initialState");
        expect(result.errors[0]?.itemId).toBe("__code__");
        expect(result.errors[0]?.message).toContain("step must not be zero");
      }
    });
  });

  describe("range helper", () => {
    it("is available in parameter override expressions", () => {
      const result = compile(
        scenario({
          parameterOverrides: {
            p1: "range(3).length + range(2, 6).length",
          },
        }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.parameterValues.x).toBe("7");
      }
    });

    it("is available in per-place initial state expressions", () => {
      const result = compile(
        scenario({
          initialState: {
            type: "per_place",
            content: { pl2: "range(0, 10, 2).length" },
          },
        }),
        [],
        [place("pl2", "Queue", null)],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.pl2).toBe(5);
      }
    });

    it("reports the length-cap error instead of freezing", () => {
      const result = compile(
        scenario({
          parameterOverrides: { p1: "range(1e12).length" },
        }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.errors.some((error) =>
            error.message.includes("exceeding the limit"),
          ),
        ).toBe(true);
      }
    });
  });
});

describe("prepareScenarioCompiler", () => {
  const sweptScenario = scenario({
    scenarioParameters: [{ identifier: "speed", type: "real", default: 1 }],
    parameterOverrides: { p1: "scenario.speed * 2" },
    initialState: { type: "per_place", content: { pl1: "scenario.speed + 1" } },
  });
  const netParameters = [param("p1", "rate", "0.5")];
  const places = [place("pl1", "Waiting", null)];

  it("compiles repeatedly, matching the one-shot compiler at each assignment", () => {
    const prepared = prepareScenarioCompiler(
      sweptScenario,
      lowerScenarioToHir(sweptScenario),
      netParameters,
      places,
    );
    for (const speed of [1, 3, 7.5]) {
      const repeated = prepared.compile({ speed });
      const oneShot = compile(sweptScenario, netParameters, places, [], {
        scenarioParameterValues: { speed },
      });
      expect(repeated).toEqual(oneShot);
    }
  });

  it("keeps calls independent: a later assignment sees no earlier overrides", () => {
    const prepared = prepareScenarioCompiler(
      sweptScenario,
      lowerScenarioToHir(sweptScenario),
      netParameters,
      places,
    );
    const first = prepared.compile({ speed: 5 });
    const second = prepared.compile({});
    if (!first.ok || !second.ok) {
      throw new Error("expected both compiles to succeed");
    }
    expect(first.result.parameterValues.rate).toBe("10");
    // The default assignment: overrides evaluate from the defaults template,
    // not from the mutated bindings of the previous call.
    expect(second.result.parameterValues.rate).toBe("2");
    expect(second.result.initialState.pl1).toBe(2);
  });

  it("reports a type error on every compile, found once at preparation", () => {
    const broken = scenario({
      parameterOverrides: { p1: "scenario.missing + 1" },
    });
    const prepared = prepareScenarioCompiler(
      broken,
      lowerScenarioToHir(broken),
      netParameters,
    );
    for (let call = 0; call < 2; call++) {
      const outcome = prepared.compile({});
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors[0]?.source).toBe("parameterOverride");
      }
    }
  });

  it("compiles parameter values without evaluating the initial state", () => {
    const brokenInitialState = scenario({
      scenarioParameters: [{ identifier: "speed", type: "real", default: 1 }],
      parameterOverrides: { p1: "scenario.speed * 2" },
      // An initial-state expression that fails at evaluation: `compile`
      // reports it, the values-only entry point never runs it.
      initialState: { type: "per_place", content: { pl1: "unknown_name" } },
    });
    const prepared = prepareScenarioCompiler(
      brokenInitialState,
      lowerScenarioToHir(brokenInitialState),
      [param("p1", "rate", "0.5")],
      [place("pl1", "Waiting", null)],
    );

    expect(prepared.compile({ speed: 3 }).ok).toBe(false);
    const valuesOnly = prepared.compileParameterValues({ speed: 3 });
    expect(valuesOnly.ok).toBe(true);
    if (valuesOnly.ok) {
      expect(valuesOnly.parameterValues.rate).toBe("6");
    }
  });

  it("fails compileParameterValues on override errors, like compile", () => {
    const broken = scenario({
      parameterOverrides: { p1: "scenario.missing + 1" },
    });
    const prepared = prepareScenarioCompiler(
      broken,
      lowerScenarioToHir(broken),
      [param("p1", "rate", "0.5")],
    );
    const outcome = prepared.compileParameterValues({});
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errors[0]?.source).toBe("parameterOverride");
    }
  });
});
