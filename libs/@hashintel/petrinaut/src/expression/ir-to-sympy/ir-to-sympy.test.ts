import { describe, expect, it } from "vitest";

import type { ExpressionIR } from "../expression-ir";
import { irToSymPy } from "./ir-to-sympy";

describe("irToSymPy", () => {
  describe("literals", () => {
    it("should emit number", () => {
      expect(irToSymPy({ type: "number", value: "42" })).toBe("return 42");
    });

    it("should emit boolean true as True", () => {
      expect(irToSymPy({ type: "boolean", value: true })).toBe("return True");
    });

    it("should emit boolean false as False", () => {
      expect(irToSymPy({ type: "boolean", value: false })).toBe("return False");
    });

    it("should emit infinity with import", () => {
      expect(irToSymPy({ type: "infinity" })).toBe(
        "from sympy import oo\n\nreturn oo",
      );
    });
  });

  describe("symbols and parameters", () => {
    it("should emit symbol name", () => {
      expect(irToSymPy({ type: "symbol", name: "x" })).toBe("return x");
    });

    it("should emit parameter name", () => {
      expect(irToSymPy({ type: "parameter", name: "infection_rate" })).toBe(
        "return infection_rate",
      );
    });

    it("should emit Math constants with import", () => {
      expect(irToSymPy({ type: "symbol", name: "PI" })).toBe(
        "from sympy import pi\n\nreturn pi",
      );
      expect(irToSymPy({ type: "symbol", name: "E" })).toBe(
        "from sympy import E\n\nreturn E",
      );
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
      ).toBe("return Space_0_x");
    });
  });

  describe("binary operations", () => {
    const left: ExpressionIR = { type: "number", value: "1" };
    const right: ExpressionIR = { type: "number", value: "2" };

    it("should emit arithmetic operators", () => {
      expect(irToSymPy({ type: "binary", op: "+", left, right })).toBe(
        "return 1 + 2",
      );
      expect(irToSymPy({ type: "binary", op: "*", left, right })).toBe(
        "return 1 * 2",
      );
      expect(irToSymPy({ type: "binary", op: "**", left, right })).toBe(
        "return 1**2",
      );
    });

    it("should emit modulo as Mod with import", () => {
      expect(irToSymPy({ type: "binary", op: "%", left, right })).toBe(
        "from sympy import Mod\n\nreturn Mod(1, 2)",
      );
    });

    it("should emit equality as Eq with import", () => {
      expect(irToSymPy({ type: "binary", op: "==", left, right })).toBe(
        "from sympy import Eq\n\nreturn Eq(1, 2)",
      );
    });

    it("should emit inequality as Ne with import", () => {
      expect(irToSymPy({ type: "binary", op: "!=", left, right })).toBe(
        "from sympy import Ne\n\nreturn Ne(1, 2)",
      );
    });

    it("should emit logical operators with imports", () => {
      expect(irToSymPy({ type: "binary", op: "&&", left, right })).toBe(
        "from sympy import And\n\nreturn And(1, 2)",
      );
      expect(irToSymPy({ type: "binary", op: "||", left, right })).toBe(
        "from sympy import Or\n\nreturn Or(1, 2)",
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
      ).toBe("return -(x)");
    });

    it("should emit logical not with import", () => {
      expect(
        irToSymPy({
          type: "unary",
          op: "!",
          operand: { type: "boolean", value: true },
        }),
      ).toBe("from sympy import Not\n\nreturn Not(True)");
    });
  });

  describe("function calls", () => {
    it("should emit math functions with import", () => {
      expect(
        irToSymPy({
          type: "call",
          fn: "cos",
          args: [{ type: "symbol", name: "x" }],
        }),
      ).toBe("from sympy import cos\n\nreturn cos(x)");
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
      ).toBe("from sympy import sqrt\n\nreturn sqrt((a)**2 + (b)**2)");
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
      ).toBe("return (a)**(2)");
    });
  });

  describe("distributions", () => {
    it("should emit inline Gaussian as Normal", () => {
      expect(
        irToSymPy({
          type: "distribution",
          distribution: "Gaussian",
          args: [
            { type: "number", value: "0" },
            { type: "number", value: "1" },
          ],
        }),
      ).toBe("from sympy.stats import Normal\n\nreturn Normal(0, 1)");
    });

    it("should emit inline Lognormal as LogNormal", () => {
      expect(
        irToSymPy({
          type: "distribution",
          distribution: "Lognormal",
          args: [
            { type: "number", value: "0" },
            { type: "number", value: "1" },
          ],
        }),
      ).toBe("from sympy.stats import LogNormal\n\nreturn LogNormal(0, 1)");
    });

    it("should emit named distribution from let-binding with symbol name", () => {
      expect(
        irToSymPy({
          type: "let",
          bindings: [
            {
              name: "angle",
              value: {
                type: "distribution",
                distribution: "Uniform",
                args: [
                  { type: "number", value: "0" },
                  { type: "number", value: "1" },
                ],
              },
            },
          ],
          body: { type: "symbol", name: "angle" },
        }),
      ).toBe(
        [
          "from sympy.stats import Uniform",
          "",
          "angle = Uniform('angle', 0, 1)",
          "",
          "return angle",
        ].join("\n"),
      );
    });
  });

  describe("derived distributions", () => {
    it("should substitute inline distribution into body", () => {
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
        [
          "from sympy import cos",
          "from sympy.stats import Normal",
          "",
          "return cos(Normal(0, 10))",
        ].join("\n"),
      );
    });
  });

  describe("piecewise", () => {
    it("should emit Piecewise with import", () => {
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
      ).toBe(
        "from sympy import Piecewise\n\nreturn Piecewise((x, x > 0), (0, True))",
      );
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
      ).toBe("return [1, 2]");
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
      ).toBe("return {'x': 1, 'y': 2}");
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
      ).toBe("return [_iter + 1 for _iter in tokens]");
    });
  });

  describe("let bindings", () => {
    it("should emit single binding as assignment", () => {
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
      ).toBe("mu = gravitational_constant\n\nreturn mu * 2");
    });

    it("should emit chained bindings as assignments", () => {
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
      ).toBe("a = infection_rate\nb = recovery_rate\n\nreturn a + b");
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
      ).toBe("return obj_field");
    });

    it("should emit element access with underscore", () => {
      expect(
        irToSymPy({
          type: "elementAccess",
          object: { type: "symbol", name: "arr" },
          index: { type: "number", value: "0" },
        }),
      ).toBe("return arr_0");
    });
  });
});
