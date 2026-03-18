import { describe, expect, it } from "vitest";

import type { CompilationContext } from "./compile-to-ir";
import { compileToIR } from "./compile-to-ir";
import type { ExpressionIR } from "./expression-ir";

const defaultContext: CompilationContext = {
  parameterNames: new Set([
    "infection_rate",
    "recovery_rate",
    "gravitational_constant",
  ]),
  placeTokenFields: new Map([
    ["Space", ["x", "y", "direction", "velocity"]],
    ["Susceptible", []],
  ]),
  constructorFnName: "Lambda",
};

function dynamicsContext(): CompilationContext {
  return { ...defaultContext, constructorFnName: "Dynamics" };
}

function expectIR(code: string, expected: ExpressionIR, ctx = defaultContext) {
  const result = compileToIR(code, ctx);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.ir).toEqual(expected);
  }
}

describe("compileToIR", () => {
  describe("literals", () => {
    it("should compile numeric literal", () => {
      expectIR("export default Lambda(() => 42)", {
        type: "number",
        value: "42",
      });
    });

    it("should compile decimal literal", () => {
      expectIR("export default Lambda(() => 3.14)", {
        type: "number",
        value: "3.14",
      });
    });

    it("should compile boolean true", () => {
      expectIR("export default Lambda(() => true)", {
        type: "boolean",
        value: true,
      });
    });

    it("should compile boolean false", () => {
      expectIR("export default Lambda(() => false)", {
        type: "boolean",
        value: false,
      });
    });

    it("should compile Infinity", () => {
      expectIR("export default Lambda(() => Infinity)", {
        type: "infinity",
      });
    });
  });

  describe("parameters", () => {
    it("should compile parameter access to parameter node", () => {
      expectIR(
        "export default Lambda((tokens, parameters) => parameters.infection_rate)",
        { type: "parameter", name: "infection_rate" },
      );
    });
  });

  describe("token access", () => {
    it("should compile tokens.Place[0].field to tokenAccess", () => {
      expectIR("export default Lambda((tokens) => tokens.Space[0].x)", {
        type: "tokenAccess",
        place: "Space",
        index: { type: "number", value: "0" },
        field: "x",
      });
    });
  });

  describe("binary operations", () => {
    it("should compile addition", () => {
      expectIR("export default Lambda(() => 1 + 2)", {
        type: "binary",
        op: "+",
        left: { type: "number", value: "1" },
        right: { type: "number", value: "2" },
      });
    });

    it("should compile strict equality to ==", () => {
      expectIR(
        "export default Lambda((tokens, parameters) => parameters.infection_rate === 3)",
        {
          type: "binary",
          op: "==",
          left: { type: "parameter", name: "infection_rate" },
          right: { type: "number", value: "3" },
        },
      );
    });

    it("should compile !== to !=", () => {
      expectIR(
        "export default Lambda((tokens, parameters) => parameters.infection_rate !== 0)",
        {
          type: "binary",
          op: "!=",
          left: { type: "parameter", name: "infection_rate" },
          right: { type: "number", value: "0" },
        },
      );
    });

    it("should compile && to logical and", () => {
      expectIR(
        "export default Lambda((tokens, parameters) => parameters.infection_rate > 0 && parameters.recovery_rate > 0)",
        {
          type: "binary",
          op: "&&",
          left: {
            type: "binary",
            op: ">",
            left: { type: "parameter", name: "infection_rate" },
            right: { type: "number", value: "0" },
          },
          right: {
            type: "binary",
            op: ">",
            left: { type: "parameter", name: "recovery_rate" },
            right: { type: "number", value: "0" },
          },
        },
      );
    });
  });

  describe("unary operations", () => {
    it("should compile negation", () => {
      expectIR(
        "export default Lambda((tokens, parameters) => -parameters.infection_rate)",
        {
          type: "unary",
          op: "-",
          operand: { type: "parameter", name: "infection_rate" },
        },
      );
    });

    it("should compile logical not", () => {
      expectIR("export default Lambda(() => !true)", {
        type: "unary",
        op: "!",
        operand: { type: "boolean", value: true },
      });
    });

    it("should unwrap unary plus", () => {
      expectIR(
        "export default Lambda((tokens, parameters) => +parameters.infection_rate)",
        { type: "parameter", name: "infection_rate" },
      );
    });
  });

  describe("math functions", () => {
    it("should compile Math.cos to call node", () => {
      expectIR(
        "export default Lambda((tokens, parameters) => Math.cos(parameters.infection_rate))",
        {
          type: "call",
          fn: "cos",
          args: [{ type: "parameter", name: "infection_rate" }],
        },
      );
    });

    it("should compile Math.hypot to call node", () => {
      expectIR(
        "export default Lambda((tokens, parameters) => Math.hypot(parameters.infection_rate, parameters.recovery_rate))",
        {
          type: "call",
          fn: "hypot",
          args: [
            { type: "parameter", name: "infection_rate" },
            { type: "parameter", name: "recovery_rate" },
          ],
        },
      );
    });

    it("should compile Math.PI to symbol", () => {
      expectIR("export default Lambda(() => Math.PI)", {
        type: "symbol",
        name: "PI",
      });
    });

    it("should compile Math.E to symbol", () => {
      expectIR("export default Lambda(() => Math.E)", {
        type: "symbol",
        name: "E",
      });
    });
  });

  describe("distributions", () => {
    it("should compile Distribution.Gaussian", () => {
      expectIR("export default Lambda(() => Distribution.Gaussian(0, 1))", {
        type: "distribution",
        distribution: "Gaussian",
        args: [
          { type: "number", value: "0" },
          { type: "number", value: "1" },
        ],
      });
    });

    it("should compile Distribution.Uniform", () => {
      expectIR("export default Lambda(() => Distribution.Uniform(0, 1))", {
        type: "distribution",
        distribution: "Uniform",
        args: [
          { type: "number", value: "0" },
          { type: "number", value: "1" },
        ],
      });
    });
  });

  describe("conditional", () => {
    it("should compile ternary to piecewise", () => {
      expectIR(
        "export default Lambda((tokens, parameters) => parameters.infection_rate > 1 ? parameters.infection_rate : 0)",
        {
          type: "piecewise",
          condition: {
            type: "binary",
            op: ">",
            left: { type: "parameter", name: "infection_rate" },
            right: { type: "number", value: "1" },
          },
          whenTrue: { type: "parameter", name: "infection_rate" },
          whenFalse: { type: "number", value: "0" },
        },
      );
    });
  });

  describe("global functions", () => {
    it("should compile Boolean(expr) to != 0", () => {
      expectIR(
        "export default Lambda((tokens, parameters) => Boolean(parameters.infection_rate))",
        {
          type: "binary",
          op: "!=",
          left: { type: "parameter", name: "infection_rate" },
          right: { type: "number", value: "0" },
        },
      );
    });

    it("should compile Number(expr) as identity", () => {
      expectIR("export default Lambda(() => Number(true))", {
        type: "boolean",
        value: true,
      });
    });
  });

  describe("collections", () => {
    it("should compile array literal", () => {
      expectIR("export default Lambda(() => [1, 2, 3])", {
        type: "array",
        elements: [
          { type: "number", value: "1" },
          { type: "number", value: "2" },
          { type: "number", value: "3" },
        ],
      });
    });

    it("should compile object literal", () => {
      expectIR("export default Lambda(() => ({ x: 1, y: 2 }))", {
        type: "object",
        entries: [
          { key: "x", value: { type: "number", value: "1" } },
          { key: "y", value: { type: "number", value: "2" } },
        ],
      });
    });
  });

  describe("let bindings", () => {
    it("should compile block body with const to let node", () => {
      const result = compileToIR(
        `export default Dynamics((tokens, parameters) => {
          const mu = parameters.gravitational_constant;
          return mu;
        })`,
        dynamicsContext(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ir).toEqual({
          type: "let",
          bindings: [
            {
              name: "mu",
              value: { type: "parameter", name: "gravitational_constant" },
            },
          ],
          body: { type: "symbol", name: "mu" },
        });
      }
    });

    it("should compile multiple const bindings", () => {
      const result = compileToIR(
        `export default Dynamics((tokens, parameters) => {
          const a = parameters.infection_rate;
          const b = parameters.recovery_rate;
          return a;
        })`,
        dynamicsContext(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ir.type).toBe("let");
        if (result.ir.type === "let") {
          expect(result.ir.bindings).toHaveLength(2);
          expect(result.ir.bindings[0]!.name).toBe("a");
          expect(result.ir.bindings[1]!.name).toBe("b");
        }
      }
    });

    it("should not emit let node for block without bindings", () => {
      const result = compileToIR(
        `export default Dynamics((tokens, parameters) => {
          return parameters.infection_rate;
        })`,
        dynamicsContext(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ir).toEqual({
          type: "parameter",
          name: "infection_rate",
        });
      }
    });
  });

  describe(".map() list comprehension", () => {
    it("should compile .map with destructured params", () => {
      const result = compileToIR(
        `export default Lambda((tokens, parameters) => tokens.map(({ x }) => x * parameters.infection_rate))`,
        defaultContext,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ir).toEqual({
          type: "listComprehension",
          variable: "_iter",
          collection: { type: "symbol", name: "tokens" },
          body: {
            type: "binary",
            op: "*",
            left: { type: "symbol", name: "_iter_x" },
            right: { type: "parameter", name: "infection_rate" },
          },
        });
      }
    });

    it("should compile .map with simple identifier param", () => {
      const result = compileToIR(
        `export default Lambda((tokens) => tokens.map((token) => token))`,
        defaultContext,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ir).toEqual({
          type: "listComprehension",
          variable: "_iter",
          collection: { type: "symbol", name: "tokens" },
          body: { type: "symbol", name: "_iter" },
        });
      }
    });
  });

  describe("derived distributions", () => {
    it("should compile dist.map(arrow) to derivedDistribution", () => {
      const result = compileToIR(
        `export default Lambda(() => Distribution.Gaussian(0, 10).map((x) => x * 2))`,
        defaultContext,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ir).toEqual({
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
            type: "binary",
            op: "*",
            left: { type: "symbol", name: "_x" },
            right: { type: "number", value: "2" },
          },
        });
      }
    });

    it("should compile dist.map(Math.cos) with function reference", () => {
      const result = compileToIR(
        `export default Lambda(() => Distribution.Gaussian(0, 10).map(Math.cos))`,
        defaultContext,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ir).toEqual({
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
        });
      }
    });

    it("should detect distribution through const binding", () => {
      const result = compileToIR(
        `export default Lambda(() => {
          const angle = Distribution.Gaussian(0, 10);
          return angle.map(Math.cos);
        })`,
        defaultContext,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ir.type).toBe("let");
        if (result.ir.type === "let") {
          expect(result.ir.body).toEqual({
            type: "derivedDistribution",
            distribution: { type: "symbol", name: "angle" },
            variable: "_x",
            body: {
              type: "call",
              fn: "cos",
              args: [{ type: "symbol", name: "_x" }],
            },
          });
        }
      }
    });

    it("should chain derived distributions", () => {
      const result = compileToIR(
        `export default Lambda((tokens, parameters) => {
          const angle = Distribution.Gaussian(0, 10);
          const cosAngle = angle.map(Math.cos);
          return cosAngle.map((x) => x * parameters.infection_rate);
        })`,
        defaultContext,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ir.type).toBe("let");
        if (result.ir.type === "let") {
          expect(result.ir.body.type).toBe("derivedDistribution");
        }
      }
    });
  });

  describe("error handling", () => {
    it("should reject code without default export", () => {
      const result = compileToIR("const x = Lambda(() => 1);", defaultContext);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("No default export");
      }
    });

    it("should reject string literals", () => {
      const result = compileToIR(
        `export default Lambda(() => "hello")`,
        defaultContext,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("String literals");
      }
    });

    it("should reject unsupported Math function", () => {
      const result = compileToIR(
        "export default Lambda(() => Math.random())",
        defaultContext,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Unsupported Math function");
      }
    });

    it("should reject let declarations", () => {
      const result = compileToIR(
        `export default Lambda(() => { let x = 1; return x; })`,
        defaultContext,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("let");
      }
    });
  });
});
