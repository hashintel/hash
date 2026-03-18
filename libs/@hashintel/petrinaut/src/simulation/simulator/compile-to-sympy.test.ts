import { describe, expect, it } from "vitest";

import {
  compileToSymPy,
  type SymPyCompilationContext,
} from "./compile-to-sympy";

const defaultContext: SymPyCompilationContext = {
  parameterNames: new Set([
    "infection_rate",
    "recovery_rate",
    "gravitational_constant",
    "earth_radius",
    "satellite_radius",
    "crash_threshold",
  ]),
  placeTokenFields: new Map([
    ["Space", ["x", "y", "direction", "velocity"]],
    ["Susceptible", []],
    ["Infected", []],
  ]),
  constructorFnName: "Lambda",
};

function dynamicsContext(): SymPyCompilationContext {
  return { ...defaultContext, constructorFnName: "Dynamics" };
}

function kernelContext(): SymPyCompilationContext {
  return { ...defaultContext, constructorFnName: "TransitionKernel" };
}

describe("compileToSymPy", () => {
  describe("basic expressions", () => {
    it("should compile a numeric literal", () => {
      const result = compileToSymPy(
        "export default Lambda(() => 1)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "1" });
    });

    it("should compile a decimal literal", () => {
      const result = compileToSymPy(
        "export default Lambda(() => 3.14)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "3.14" });
    });

    it("should compile boolean true", () => {
      const result = compileToSymPy(
        "export default Lambda(() => true)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "True" });
    });

    it("should compile boolean false", () => {
      const result = compileToSymPy(
        "export default Lambda(() => false)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "False" });
    });

    it("should compile Infinity", () => {
      const result = compileToSymPy(
        "export default Lambda(() => Infinity)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "sp.oo" });
    });
  });

  describe("parameter access", () => {
    it("should compile parameters.x to symbol x", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => parameters.infection_rate)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "infection_rate" });
    });

    it("should compile parameters in arithmetic", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => parameters.infection_rate * 2)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "infection_rate * 2",
      });
    });
  });

  describe("binary arithmetic", () => {
    it("should compile addition", () => {
      const result = compileToSymPy(
        "export default Lambda(() => 1 + 2)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "1 + 2" });
    });

    it("should compile subtraction", () => {
      const result = compileToSymPy(
        "export default Lambda(() => 5 - 3)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "5 - 3" });
    });

    it("should compile multiplication", () => {
      const result = compileToSymPy(
        "export default Lambda(() => 2 * 3)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "2 * 3" });
    });

    it("should compile division", () => {
      const result = compileToSymPy(
        "export default Lambda(() => 1 / 3)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "1 / 3" });
    });

    it("should compile power operator", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => parameters.satellite_radius ** 2)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "satellite_radius**2",
      });
    });

    it("should compile modulo", () => {
      const result = compileToSymPy(
        "export default Lambda(() => 10 % 3)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.Mod(10, 3)",
      });
    });
  });

  describe("comparison operators", () => {
    it("should compile less than", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => parameters.infection_rate < 5)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "infection_rate < 5",
      });
    });

    it("should compile greater than or equal", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => parameters.infection_rate >= 1)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "infection_rate >= 1",
      });
    });

    it("should compile strict equality to Eq", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => parameters.infection_rate === 3)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.Eq(infection_rate, 3)",
      });
    });

    it("should compile inequality to Ne", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => parameters.infection_rate !== 0)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.Ne(infection_rate, 0)",
      });
    });
  });

  describe("logical operators", () => {
    it("should compile && to sp.And", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => parameters.infection_rate > 0 && parameters.recovery_rate > 0)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.And(infection_rate > 0, recovery_rate > 0)",
      });
    });

    it("should compile || to sp.Or", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => parameters.infection_rate === 0 || parameters.recovery_rate === 0)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.Or(sp.Eq(infection_rate, 0), sp.Eq(recovery_rate, 0))",
      });
    });
  });

  describe("prefix unary operators", () => {
    it("should compile negation", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => -parameters.infection_rate)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "-(infection_rate)",
      });
    });

    it("should compile logical not", () => {
      const result = compileToSymPy(
        "export default Lambda(() => !true)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.Not(True)",
      });
    });
  });

  describe("Math functions", () => {
    it("should compile Math.cos", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => Math.cos(parameters.infection_rate))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.cos(infection_rate)",
      });
    });

    it("should compile Math.sin", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => Math.sin(parameters.infection_rate))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.sin(infection_rate)",
      });
    });

    it("should compile Math.sqrt", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => Math.sqrt(parameters.infection_rate))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.sqrt(infection_rate)",
      });
    });

    it("should compile Math.log", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => Math.log(parameters.infection_rate))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.log(infection_rate)",
      });
    });

    it("should compile Math.exp", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => Math.exp(parameters.infection_rate))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.exp(infection_rate)",
      });
    });

    it("should compile Math.abs", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => Math.abs(parameters.infection_rate))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.Abs(infection_rate)",
      });
    });

    it("should compile Math.pow to exponentiation", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => Math.pow(parameters.infection_rate, 2))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "(infection_rate)**(2)",
      });
    });

    it("should compile Math.hypot to sqrt of sum of squares", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => Math.hypot(parameters.infection_rate, parameters.recovery_rate))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.sqrt((infection_rate)**2 + (recovery_rate)**2)",
      });
    });

    it("should compile Math.PI", () => {
      const result = compileToSymPy(
        "export default Lambda(() => Math.PI)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "sp.pi" });
    });

    it("should compile Math.E", () => {
      const result = compileToSymPy(
        "export default Lambda(() => Math.E)",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "sp.E" });
    });
  });

  describe("token access", () => {
    it("should compile tokens.Place[0].field to symbol", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens) => tokens.Space[0].x)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "Space_0_x",
      });
    });

    it("should compile token field comparison", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => tokens.Space[0].velocity < parameters.crash_threshold)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "Space_0_velocity < crash_threshold",
      });
    });
  });

  describe("conditional (ternary) expression", () => {
    it("should compile to Piecewise", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => parameters.infection_rate > 1 ? parameters.infection_rate : 0)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode:
          "sp.Piecewise((infection_rate, infection_rate > 1), (0, True))",
      });
    });
  });

  describe("Distribution calls", () => {
    it("should compile Distribution.Gaussian", () => {
      const result = compileToSymPy(
        "export default Lambda(() => Distribution.Gaussian(0, 1))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.stats.Normal('X', 0, 1)",
      });
    });

    it("should compile Distribution.Uniform", () => {
      const result = compileToSymPy(
        "export default Lambda(() => Distribution.Uniform(0, 1))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.stats.Uniform('X', 0, 1)",
      });
    });

    it("should compile Distribution.Lognormal", () => {
      const result = compileToSymPy(
        "export default Lambda(() => Distribution.Lognormal(0, 1))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.stats.LogNormal('X', 0, 1)",
      });
    });
  });

  describe("derived distributions", () => {
    it("should compile distribution.map(Math.cos) end-to-end", () => {
      const result = compileToSymPy(
        `export default Lambda(() => {
          const angle = Distribution.Gaussian(0, 10);
          return angle.map(Math.cos);
        })`,
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode:
          "DerivedDistribution(sp.stats.Normal('X', 0, 10), lambda _x: sp.cos(_x))",
      });
    });

    it("should compile inline distribution.map(arrow)", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => Distribution.Uniform(0, 1).map((x) => x * parameters.infection_rate))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode:
          "DerivedDistribution(sp.stats.Uniform('X', 0, 1), lambda _x: _x * infection_rate)",
      });
    });
  });

  describe("global built-in functions", () => {
    it("should compile Boolean(expr) to sp.Ne(expr, 0)", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => Boolean(parameters.infection_rate))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.Ne(infection_rate, 0)",
      });
    });

    it("should compile Boolean with arithmetic expression", () => {
      const result = compileToSymPy(
        "export default Lambda(() => Boolean(1 + 2))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "sp.Ne(1 + 2, 0)",
      });
    });

    it("should compile Number(expr) as identity", () => {
      const result = compileToSymPy(
        "export default Lambda(() => Number(true))",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "True",
      });
    });

    it("should compile Boolean in block body with return", () => {
      const result = compileToSymPy(
        `export default Lambda((tokens, parameters) => {
          const sum = parameters.infection_rate + parameters.recovery_rate;
          return Boolean(sum);
        })`,
        defaultContext,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sympyCode).toContain("sp.Ne");
      }
    });
  });

  describe("block body with const and return", () => {
    it("should compile block body with const bindings", () => {
      const result = compileToSymPy(
        `export default Dynamics((tokens, parameters) => {
          const mu = parameters.gravitational_constant;
          return mu * 2;
        })`,
        dynamicsContext(),
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "gravitational_constant * 2",
      });
    });

    it("should compile block body with multiple const bindings", () => {
      const result = compileToSymPy(
        `export default Dynamics((tokens, parameters) => {
          const a = parameters.infection_rate;
          const b = parameters.recovery_rate;
          return a + b;
        })`,
        dynamicsContext(),
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "infection_rate + recovery_rate",
      });
    });
  });

  describe("real-world expressions", () => {
    it("should compile SIR infection rate lambda", () => {
      const result = compileToSymPy(
        "export default Lambda((tokens, parameters) => parameters.infection_rate)",
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "infection_rate",
      });
    });

    it("should compile satellite crash predicate lambda", () => {
      const result = compileToSymPy(
        `export default Lambda((tokens, parameters) => {
          const distance = Math.hypot(tokens.Space[0].x, tokens.Space[0].y);
          return distance < parameters.earth_radius + parameters.crash_threshold + parameters.satellite_radius;
        })`,
        defaultContext,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sympyCode).toContain("sp.sqrt");
        expect(result.sympyCode).toContain("<");
        expect(result.sympyCode).toContain("earth_radius");
      }
    });

    it("should compile orbital dynamics expression", () => {
      const result = compileToSymPy(
        `export default Dynamics((tokens, parameters) => {
          const mu = parameters.gravitational_constant;
          const r = Math.hypot(tokens.Space[0].x, tokens.Space[0].y);
          const ax = (-mu * tokens.Space[0].x) / (r * r * r);
          return ax;
        })`,
        dynamicsContext(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sympyCode).toContain("gravitational_constant");
        expect(result.sympyCode).toContain("Space_0_x");
      }
    });

    it("should compile transition kernel with object literal", () => {
      const result = compileToSymPy(
        `export default TransitionKernel((tokens) => {
          return {
            x: tokens.Space[0].x,
            y: tokens.Space[0].y,
            velocity: 0,
            direction: 0
          };
        })`,
        kernelContext(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sympyCode).toContain("'x': Space_0_x");
        expect(result.sympyCode).toContain("'y': Space_0_y");
        expect(result.sympyCode).toContain("'velocity': 0");
      }
    });

    it("should compile transition kernel with array of objects", () => {
      const result = compileToSymPy(
        `export default TransitionKernel((tokens) => {
          return {
            Debris: [
              {
                x: tokens.Space[0].x,
                y: tokens.Space[0].y,
                velocity: 0,
                direction: 0
              },
              {
                x: tokens.Space[1].x,
                y: tokens.Space[1].y,
                velocity: 0,
                direction: 0
              },
            ]
          };
        })`,
        kernelContext(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sympyCode).toContain("'Debris': [");
        expect(result.sympyCode).toContain("'x': Space_0_x");
        expect(result.sympyCode).toContain("'x': Space_1_x");
      }
    });

    it("should compile simple array literal", () => {
      const result = compileToSymPy(
        "export default Lambda(() => [1, 2, 3])",
        defaultContext,
      );
      expect(result).toEqual({ ok: true, sympyCode: "[1, 2, 3]" });
    });
  });

  describe(".map() list comprehension", () => {
    it("should compile tokens.map with destructured params", () => {
      const result = compileToSymPy(
        `export default Dynamics((tokens, parameters) => {
          const mu = parameters.gravitational_constant;
          return tokens.map(({ x, y, direction, velocity }) => {
            const r = Math.hypot(x, y);
            const ax = (-mu * x) / (r * r * r);
            const ay = (-mu * y) / (r * r * r);
            return {
              x: velocity * Math.cos(direction),
              y: velocity * Math.sin(direction),
              direction: (-ax * Math.sin(direction) + ay * Math.cos(direction)) / velocity,
              velocity: ax * Math.cos(direction) + ay * Math.sin(direction),
            };
          });
        })`,
        dynamicsContext(),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sympyCode).toContain("for _iter in tokens");
        expect(result.sympyCode).toContain("_iter_x");
        expect(result.sympyCode).toContain("_iter_velocity");
        expect(result.sympyCode).toContain("sp.cos(_iter_direction)");
      }
    });

    it("should compile simple .map with identifier param", () => {
      const result = compileToSymPy(
        `export default Lambda((tokens) => tokens.map((token) => token + 1))`,
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "[_iter + 1 for _iter in tokens]",
      });
    });

    it("should compile .map with expression body", () => {
      const result = compileToSymPy(
        `export default Lambda((tokens, parameters) => tokens.map(({ x }) => x * parameters.infection_rate))`,
        defaultContext,
      );
      expect(result).toEqual({
        ok: true,
        sympyCode: "[_iter_x * infection_rate for _iter in tokens]",
      });
    });
  });

  describe("error handling", () => {
    it("should reject code without default export", () => {
      const result = compileToSymPy(
        "const x = Lambda(() => 1);",
        defaultContext,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("No default export");
        expect(result.start).toBe(0);
        expect(result.length).toBe(0);
      }
    });

    it("should reject wrong constructor function name with position", () => {
      const code = "export default WrongName(() => 1)";
      const result = compileToSymPy(code, defaultContext);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Expected Lambda(...)");
        // "WrongName" starts at position 15
        expect(result.start).toBe(code.indexOf("WrongName"));
        expect(result.length).toBe("WrongName".length);
      }
    });

    it("should reject unsupported Math function with position", () => {
      const code = "export default Lambda(() => Math.random())";
      const result = compileToSymPy(code, defaultContext);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Unsupported Math function");
        // Points to the "Math.random" callee
        expect(result.start).toBe(code.indexOf("Math.random"));
        expect(result.length).toBe("Math.random".length);
      }
    });

    it("should reject if statements in block body with position", () => {
      const code = `export default Lambda((tokens, parameters) => {
          if (parameters.infection_rate > 1) {
            return parameters.infection_rate;
          }
          return 0;
        })`;
      const result = compileToSymPy(code, defaultContext);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Unsupported statement");
        expect(result.start).toBe(code.indexOf("if"));
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it("should reject let declarations with position", () => {
      const code = `export default Lambda(() => {
          let x = 1;
          return x;
        })`;
      const result = compileToSymPy(code, defaultContext);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("let");
        expect(result.start).toBe(code.indexOf("let x = 1;"));
        expect(result.length).toBe("let x = 1;".length);
      }
    });

    it("should reject var declarations", () => {
      const code = `export default Lambda(() => {
          var x = 1;
          return x;
        })`;
      const result = compileToSymPy(code, defaultContext);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("var");
        expect(result.error).toContain("use 'const'");
      }
    });

    it("should reject string literals with position", () => {
      const code = `export default Lambda(() => "hello")`;
      const result = compileToSymPy(code, defaultContext);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("String literals");
        expect(result.start).toBe(code.indexOf('"hello"'));
        expect(result.length).toBe('"hello"'.length);
      }
    });

    it("should reject unsupported function calls with position", () => {
      const code = `export default Lambda(() => console.log(1))`;
      const result = compileToSymPy(code, defaultContext);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Unsupported function call");
        expect(result.start).toBe(code.indexOf("console.log(1)"));
        expect(result.length).toBe("console.log(1)".length);
      }
    });

    it("should reject standalone expression statements", () => {
      const code = `export default Lambda((tokensByPlace, parameters) => {
          const a = Boolean(1 + 2);
          Boolean(1 + 2);
          return Boolean(1 + 2);
        })`;
      const result = compileToSymPy(code, defaultContext);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Standalone expression has no effect");
        // The standalone expression is the second line in the block
        const standalonePos = code.indexOf("\n          Boolean(1 + 2);") + 11;
        expect(result.start).toBe(standalonePos);
        expect(result.length).toBe("Boolean(1 + 2);".length);
      }
    });

    it("should reject unsupported binary operator with position", () => {
      const code = `export default Lambda(() => 1 << 2)`;
      const result = compileToSymPy(code, defaultContext);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Unsupported binary operator");
        expect(result.start).toBe(code.indexOf("<<"));
        expect(result.length).toBe("<<".length);
      }
    });
  });
});
