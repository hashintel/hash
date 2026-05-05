import { describe, expect, it } from "vitest";

import type { Parameter, Scenario } from "../core/types/sdcpn";
import { compileScenario } from "./compile-scenario";

// -- Helpers ------------------------------------------------------------------

const param = (
  id: string,
  variableName: string,
  defaultValue: string,
): Parameter => ({
  id,
  name: variableName,
  variableName,
  type: "real",
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

// -- Tests --------------------------------------------------------------------

describe("compileScenario", () => {
  describe("basic evaluation", () => {
    it("returns net parameter defaults when no overrides", () => {
      const result = compileScenario(scenario(), [param("p1", "x", "10")]);

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
      const result = compileScenario(
        scenario({ parameterOverrides: { p1: "42" } }),
        [param("p1", "x", "10")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.parameterValues.x).toBe("42");
      }
    });

    it("evaluates an initial state expression", () => {
      const result = compileScenario(
        scenario({
          initialState: { type: "per_place", content: { place1: "100" } },
        }),
        [],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1?.count).toBe(100);
      }
    });

    it("treats empty expressions as defaults", () => {
      const result = compileScenario(
        scenario({
          parameterOverrides: { p1: "", p2: "  " },
          initialState: { type: "per_place", content: { place1: "" } },
        }),
        [param("p1", "x", "5"), param("p2", "y", "7")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.parameterValues).toEqual({ x: "5", y: "7" });
        expect(result.result.initialState.place1?.count).toBe(0);
      }
    });
  });

  describe("scenario parameters", () => {
    it("makes scenario parameters accessible via scenario object", () => {
      const result = compileScenario(
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
      const result = compileScenario(
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
        expect(result.result.initialState.place1?.count).toBe(50);
      }
    });
  });

  describe("expression features", () => {
    it("supports Math functions", () => {
      const result = compileScenario(
        scenario({ parameterOverrides: { p1: "Math.sqrt(144)" } }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.parameterValues.x).toBe("12");
      }
    });

    it("supports complex expressions with both parameters and scenario", () => {
      const result = compileScenario(
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
      const result = compileScenario(
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
        expect(result.result.initialState.place1?.count).toBe(1000);
      }
    });

    it("rounds initial state to integers", () => {
      const result = compileScenario(
        scenario({
          initialState: { type: "per_place", content: { place1: "3.7" } },
        }),
        [],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1?.count).toBe(4);
      }
    });

    it("clamps negative initial state to 0", () => {
      const result = compileScenario(
        scenario({
          initialState: { type: "per_place", content: { place1: "-5" } },
        }),
        [],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1?.count).toBe(0);
      }
    });
  });

  describe("colored places (number[][] data)", () => {
    it("passes through number[][] as flattened values", () => {
      const result = compileScenario(
        scenario({
          initialState: {
            type: "per_place",
            content: {
              place1: [
                [1, 2, 3],
                [4, 5, 6],
              ],
            },
          },
        }),
        [],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.place1).toEqual({
          values: [1, 2, 3, 4, 5, 6],
          count: 2,
        });
      }
    });

    it("handles empty token array", () => {
      const result = compileScenario(
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
        expect(result.result.initialState.place1).toEqual({
          values: [],
          count: 0,
        });
      }
    });

    it("handles mixed colored and uncolored places", () => {
      const result = compileScenario(
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
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.initialState.uncolored).toEqual({
          values: [],
          count: 42,
        });
        expect(result.result.initialState.colored).toEqual({
          values: [10, 20, 30, 40],
          count: 2,
        });
      }
    });
  });

  describe("evaluation order", () => {
    it("initial state sees overridden parameter values", () => {
      const result = compileScenario(
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
        expect(result.result.initialState.place1?.count).toBe(99);
      }
    });
  });

  describe("error handling", () => {
    it("reports syntax errors in expressions", () => {
      const result = compileScenario(
        scenario({ parameterOverrides: { p1: "1 +" } }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.source).toBe("parameterOverride");
        expect(result.errors[0]!.itemId).toBe("p1");
      }
    });

    it("reports non-numeric results", () => {
      const result = compileScenario(
        scenario({ parameterOverrides: { p1: '"hello"' } }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]!.message).toContain("expected a number");
      }
    });

    it("reports NaN results", () => {
      const result = compileScenario(
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
      const result = compileScenario(
        scenario({ parameterOverrides: { p1: "nonexistent" } }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
      }
    });

    it("collects multiple errors", () => {
      const result = compileScenario(
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

  describe("sandboxing", () => {
    it("blocks access to window", () => {
      const result = compileScenario(
        scenario({ parameterOverrides: { p1: "typeof window" } }),
        [param("p1", "x", "0")],
      );

      // "typeof window" returns "undefined" (a string), not a number
      expect(result.ok).toBe(false);
    });

    it("blocks access to globalThis", () => {
      const result = compileScenario(
        scenario({ parameterOverrides: { p1: "typeof globalThis" } }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(false);
    });

    it("blocks prototype chain escape", () => {
      const result = compileScenario(
        scenario({
          parameterOverrides: {
            p1: "parameters.constructor",
          },
        }),
        [param("p1", "x", "0")],
      );

      // parameters.constructor is undefined (prototype-less object)
      // so the result is not a number
      expect(result.ok).toBe(false);
    });

    it("blocks Function constructor escape", () => {
      const result = compileScenario(
        scenario({
          parameterOverrides: { p1: "typeof Function" },
        }),
        [param("p1", "x", "0")],
      );

      // Function is shadowed to undefined, typeof undefined is "undefined" (a string)
      expect(result.ok).toBe(false);
    });

    it("blocks literal .constructor.constructor escape", () => {
      // ({}).constructor is Object, Object.constructor is Function (real).
      // Invoking it with a body would escape to globalThis. runSandboxed
      // temporarily blocks `.constructor` on built-in prototypes so even this
      // literal-based walk fails.
      const result = compileScenario(
        scenario({
          parameterOverrides: {
            p1: "({}).constructor.constructor('return 1')()",
          },
        }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => /constructor/i.test(e.message))).toBe(
          true,
        );
      }
    });

    it("restores .constructor after evaluation", () => {
      // Sanity: the sandbox must revert its prototype patches even when the
      // evaluation throws, so surrounding code keeps working.
      compileScenario(
        scenario({
          parameterOverrides: { p1: "({}).constructor.constructor" },
        }),
        [param("p1", "x", "0")],
      );
      expect({}.constructor).toBe(Object);
      expect(Object.constructor).toBe(Function);
    });

    it("allows Math (safe global)", () => {
      const result = compileScenario(
        scenario({ parameterOverrides: { p1: "Math.PI" } }),
        [param("p1", "x", "0")],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Number(result.result.parameterValues.x)).toBeCloseTo(Math.PI);
      }
    });
  });
});
