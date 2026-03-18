import { describe, expect, it } from "vitest";

import type { ExpressionIR } from "../expression-ir";
import { irToSymPy } from "./ir-to-sympy";

describe("irToSymPy", () => {
  describe("literals", () => {
    it("should emit number", () => {
      expect(irToSymPy({ type: "number", value: "42" })).toBe("42");
    });

    it("should emit boolean true as True", () => {
      expect(irToSymPy({ type: "boolean", value: true })).toBe("True");
    });

    it("should emit boolean false as False", () => {
      expect(irToSymPy({ type: "boolean", value: false })).toBe("False");
    });

    it("should emit infinity as sp.oo", () => {
      expect(irToSymPy({ type: "infinity" })).toBe("sp.oo");
    });
  });

  describe("symbols and parameters", () => {
    it("should emit symbol name", () => {
      expect(irToSymPy({ type: "symbol", name: "x" })).toBe("x");
    });

    it("should emit parameter name", () => {
      expect(irToSymPy({ type: "parameter", name: "infection_rate" })).toBe(
        "infection_rate",
      );
    });

    it("should emit Math constants", () => {
      expect(irToSymPy({ type: "symbol", name: "PI" })).toBe("sp.pi");
      expect(irToSymPy({ type: "symbol", name: "E" })).toBe("sp.E");
    });
  });

  describe("token access", () => {
    it("should emit Place_index_field format", () => {
      expect(
        irToSymPy({
          type: "tokenAccess",
          place: "Space",
          index: { type: "number", value: "0" },
          field: "x",
        }),
      ).toBe("Space_0_x");
    });
  });

  describe("binary operations", () => {
    const left: ExpressionIR = { type: "number", value: "1" };
    const right: ExpressionIR = { type: "number", value: "2" };

    it("should emit arithmetic operators", () => {
      expect(irToSymPy({ type: "binary", op: "+", left, right })).toBe("1 + 2");
      expect(irToSymPy({ type: "binary", op: "*", left, right })).toBe("1 * 2");
      expect(irToSymPy({ type: "binary", op: "**", left, right })).toBe("1**2");
    });

    it("should emit modulo as sp.Mod", () => {
      expect(irToSymPy({ type: "binary", op: "%", left, right })).toBe(
        "sp.Mod(1, 2)",
      );
    });

    it("should emit equality as sp.Eq", () => {
      expect(irToSymPy({ type: "binary", op: "==", left, right })).toBe(
        "sp.Eq(1, 2)",
      );
    });

    it("should emit inequality as sp.Ne", () => {
      expect(irToSymPy({ type: "binary", op: "!=", left, right })).toBe(
        "sp.Ne(1, 2)",
      );
    });

    it("should emit logical operators", () => {
      expect(irToSymPy({ type: "binary", op: "&&", left, right })).toBe(
        "sp.And(1, 2)",
      );
      expect(irToSymPy({ type: "binary", op: "||", left, right })).toBe(
        "sp.Or(1, 2)",
      );
    });
  });

  describe("unary operations", () => {
    it("should emit negation", () => {
      expect(
        irToSymPy({
          type: "unary",
          op: "-",
          operand: { type: "symbol", name: "x" },
        }),
      ).toBe("-(x)");
    });

    it("should emit logical not", () => {
      expect(
        irToSymPy({
          type: "unary",
          op: "!",
          operand: { type: "boolean", value: true },
        }),
      ).toBe("sp.Not(True)");
    });
  });

  describe("function calls", () => {
    it("should emit math functions with sp. prefix", () => {
      expect(
        irToSymPy({
          type: "call",
          fn: "cos",
          args: [{ type: "symbol", name: "x" }],
        }),
      ).toBe("sp.cos(x)");
    });

    it("should emit hypot as sqrt of sum of squares", () => {
      expect(
        irToSymPy({
          type: "call",
          fn: "hypot",
          args: [
            { type: "symbol", name: "a" },
            { type: "symbol", name: "b" },
          ],
        }),
      ).toBe("sp.sqrt((a)**2 + (b)**2)");
    });

    it("should emit pow as exponentiation", () => {
      expect(
        irToSymPy({
          type: "call",
          fn: "pow",
          args: [
            { type: "symbol", name: "a" },
            { type: "number", value: "2" },
          ],
        }),
      ).toBe("(a)**(2)");
    });
  });

  describe("distributions", () => {
    it("should emit Gaussian as sp.stats.Normal", () => {
      expect(
        irToSymPy({
          type: "distribution",
          distribution: "Gaussian",
          args: [
            { type: "number", value: "0" },
            { type: "number", value: "1" },
          ],
        }),
      ).toBe("sp.stats.Normal('X', 0, 1)");
    });

    it("should emit Lognormal as sp.stats.LogNormal", () => {
      expect(
        irToSymPy({
          type: "distribution",
          distribution: "Lognormal",
          args: [
            { type: "number", value: "0" },
            { type: "number", value: "1" },
          ],
        }),
      ).toBe("sp.stats.LogNormal('X', 0, 1)");
    });
  });

  describe("derived distributions", () => {
    it("should emit DerivedDistribution with lambda", () => {
      expect(
        irToSymPy({
          type: "derivedDistribution",
          distribution: {
            type: "distribution",
            distribution: "Gaussian",
            args: [
              { type: "number", value: "0" },
              { type: "number", value: "10" },
            ],
          },
          variable: "_x",
          body: {
            type: "call",
            fn: "cos",
            args: [{ type: "symbol", name: "_x" }],
          },
        }),
      ).toBe(
        "DerivedDistribution(sp.stats.Normal('X', 0, 10), lambda _x: sp.cos(_x))",
      );
    });
  });

  describe("piecewise", () => {
    it("should emit sp.Piecewise", () => {
      expect(
        irToSymPy({
          type: "piecewise",
          condition: {
            type: "binary",
            op: ">",
            left: { type: "symbol", name: "x" },
            right: { type: "number", value: "0" },
          },
          whenTrue: { type: "symbol", name: "x" },
          whenFalse: { type: "number", value: "0" },
        }),
      ).toBe("sp.Piecewise((x, x > 0), (0, True))");
    });
  });

  describe("collections", () => {
    it("should emit array as Python list", () => {
      expect(
        irToSymPy({
          type: "array",
          elements: [
            { type: "number", value: "1" },
            { type: "number", value: "2" },
          ],
        }),
      ).toBe("[1, 2]");
    });

    it("should emit object as Python dict", () => {
      expect(
        irToSymPy({
          type: "object",
          entries: [
            { key: "x", value: { type: "number", value: "1" } },
            { key: "y", value: { type: "number", value: "2" } },
          ],
        }),
      ).toBe("{'x': 1, 'y': 2}");
    });
  });

  describe("list comprehension", () => {
    it("should emit Python list comprehension", () => {
      expect(
        irToSymPy({
          type: "listComprehension",
          variable: "_iter",
          collection: { type: "symbol", name: "tokens" },
          body: {
            type: "binary",
            op: "+",
            left: { type: "symbol", name: "_iter" },
            right: { type: "number", value: "1" },
          },
        }),
      ).toBe("[_iter + 1 for _iter in tokens]");
    });
  });

  describe("let bindings", () => {
    it("should inline single binding", () => {
      expect(
        irToSymPy({
          type: "let",
          bindings: [
            {
              name: "mu",
              value: { type: "parameter", name: "gravitational_constant" },
            },
          ],
          body: {
            type: "binary",
            op: "*",
            left: { type: "symbol", name: "mu" },
            right: { type: "number", value: "2" },
          },
        }),
      ).toBe("gravitational_constant * 2");
    });

    it("should inline chained bindings", () => {
      expect(
        irToSymPy({
          type: "let",
          bindings: [
            { name: "a", value: { type: "parameter", name: "infection_rate" } },
            {
              name: "b",
              value: { type: "parameter", name: "recovery_rate" },
            },
          ],
          body: {
            type: "binary",
            op: "+",
            left: { type: "symbol", name: "a" },
            right: { type: "symbol", name: "b" },
          },
        }),
      ).toBe("infection_rate + recovery_rate");
    });
  });

  describe("property and element access fallbacks", () => {
    it("should emit property access with underscore", () => {
      expect(
        irToSymPy({
          type: "propertyAccess",
          object: { type: "symbol", name: "obj" },
          property: "field",
        }),
      ).toBe("obj_field");
    });

    it("should emit element access with underscore", () => {
      expect(
        irToSymPy({
          type: "elementAccess",
          object: { type: "symbol", name: "arr" },
          index: { type: "number", value: "0" },
        }),
      ).toBe("arr_0");
    });
  });
});
