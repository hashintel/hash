import { describe, expect, it } from "vitest";

import { compileUserCode } from "./compile-user-code";

describe("compileUserCode", () => {
  describe("basic functionality", () => {
    it("should compile a simple function with default export", () => {
      const code = `
        export default Dynamics((a, b, c) => {
          return a + b + c;
        });
      `;
      const fn = compileUserCode<[number, number, number]>(code, "Dynamics");
      const result = fn(1, 2, 3);
      expect(result).toBe(6);
    });

    it("should compile an arrow function with implicit return", () => {
      const code = `
        export default Dynamics((x, y) => x * y);
      `;
      const fn = compileUserCode<[number, number]>(code, "Dynamics");
      const result = fn(5, 7);
      expect(result).toBe(35);
    });

    it("should handle multiple parameters", () => {
      const code = `
        export default Dynamics((a, b, c, d) => {
          return a + b * c - d;
        });
      `;
      const fn = compileUserCode<[number, number, number, number]>(
        code,
        "Dynamics",
      );
      const result = fn(10, 2, 5, 3);
      expect(result).toBe(17);
    });
  });

  describe("TypeScript type annotations", () => {
    it("should strip TypeScript type annotations from parameters", () => {
      const code = `
        export default Dynamics((x: number, y: number) => {
          return x + y;
        });
      `;
      const fn = compileUserCode<[number, number]>(code, "Dynamics");
      const result = fn(10, 20);
      expect(result).toBe(30);
    });

    it("should strip return type annotations", () => {
      const code = `
        export default Dynamics((x: number, y: number): number => {
          return x * y;
        });
      `;
      const fn = compileUserCode<[number, number]>(code, "Dynamics");
      const result = fn(5, 6);
      expect(result).toBe(30);
    });

    it("should strip type annotations from variable declarations", () => {
      const code = `
        export default Dynamics((a: number, b: number): number => {
          const sum: number = a + b;
          const product: number = sum * 2;
          return product;
        });
      `;
      const fn = compileUserCode<[number, number]>(code, "Dynamics");
      const result = fn(3, 7);
      expect(result).toBe(20);
    });

    it("should handle complex TypeScript types", () => {
      const code = `
        export default Dynamics((arr: number[]): number => {
          return arr.reduce((sum: number, n: number) => sum + n, 0);
        });
      `;
      const fn = compileUserCode<[number[]]>(code, "Dynamics");
      const result = fn([1, 2, 3, 4, 5]);
      expect(result).toBe(15);
    });

    it("should handle optional parameters", () => {
      const code = `
        export default Dynamics((a: number, b?: number): number => {
          return b !== undefined ? a + b : a;
        });
      `;
      const fn = compileUserCode<[number, number?]>(code, "Dynamics");
      expect(fn(5, 10)).toBe(15);
      expect(fn(5)).toBe(5);
    });
  });

  describe("complex logic", () => {
    it("should handle array operations", () => {
      const code = `
        export default Dynamics((matrix) => {
          return matrix.map(row => row.map(x => x * 2));
        });
      `;
      const fn = compileUserCode<[number[][]]>(code, "Dynamics");
      const result = fn([
        [1, 2],
        [3, 4],
      ]);
      expect(result).toEqual([
        [2, 4],
        [6, 8],
      ]);
    });

    it("should handle closures", () => {
      const code = `
        export default Dynamics((multiplier) => {
          return (value) => value * multiplier;
        });
      `;
      const fn = compileUserCode<[number]>(code, "Dynamics");
      const innerFn = fn(5);
      expect(typeof innerFn).toBe("function");
      expect((innerFn as (v: number) => number)(10)).toBe(50);
    });

    it("should handle async functions", () => {
      const code = `
        export default Dynamics(async (x, y) => {
          return x + y;
        });
      `;
      const fn = compileUserCode<[number, number]>(code, "Dynamics");
      const result = fn(5, 10);
      expect(result).toBeInstanceOf(Promise);
    });

    it("should handle destructuring", () => {
      const code = `
        export default Dynamics(({ a, b }) => {
          return a + b;
        });
      `;
      const fn = compileUserCode<[{ a: number; b: number }]>(code, "Dynamics");
      const result = fn({ a: 5, b: 10 });
      expect(result).toBe(15);
    });
  });

  describe("constructor function name validation", () => {
    it("should accept correct constructor function name", () => {
      const code = `
        export default Dynamics((x) => x * 2);
      `;
      expect(() => compileUserCode(code, "Dynamics")).not.toThrow();
    });

    it("should work with different constructor function names", () => {
      const code = `
        export default Flow((x, y) => x + y);
      `;
      const fn = compileUserCode<[number, number]>(code, "Flow");
      const result = fn(5, 10);
      expect(result).toBe(15);
    });

    it("should throw error when constructor function name doesn't match", () => {
      const code = `
        export default WrongName((x) => x * 2);
      `;
      expect(() => compileUserCode(code, "Dynamics")).toThrow(
        "Default export must use the constructor function 'Dynamics'",
      );
    });

    it("should throw error when default export is missing", () => {
      const code = `
        const fn = Dynamics((x) => x * 2);
      `;
      expect(() => compileUserCode(code, "Dynamics")).toThrow(
        "Module must have a default export",
      );
    });

    it("should throw error when export is not default", () => {
      const code = `
        export const fn = Dynamics((x) => x * 2);
      `;
      expect(() => compileUserCode(code, "Dynamics")).toThrow(
        "Module must have a default export",
      );
    });
  });

  describe("edge cases", () => {
    it("should handle whitespace variations", () => {
      const code = `
        export    default    Dynamics(  (x)   =>   x * 2  )  ;
      `;
      const fn = compileUserCode<[number]>(code, "Dynamics");
      const result = fn(5);
      expect(result).toBe(10);
    });

    it("should handle multiline functions", () => {
      const code = `
        export default Dynamics((x, y) => {
          const step1 = x * 2;
          const step2 = y + 5;
          const step3 = step1 + step2;
          return step3;
        });
      `;
      const fn = compileUserCode<[number, number]>(code, "Dynamics");
      const result = fn(3, 7);
      expect(result).toBe(18);
    });

    it("should handle functions that return objects", () => {
      const code = `
        export default Dynamics((x, y) => {
          return { sum: x + y, product: x * y };
        });
      `;
      const fn = compileUserCode<[number, number]>(code, "Dynamics");
      const result = fn(3, 4);
      expect(result).toEqual({ sum: 7, product: 12 });
    });

    it("should handle functions that return arrays", () => {
      const code = `
        export default Dynamics((x, y) => {
          return [x, y, x + y];
        });
      `;
      const fn = compileUserCode<[number, number]>(code, "Dynamics");
      const result = fn(5, 10);
      expect(result).toEqual([5, 10, 15]);
    });

    it("should handle empty parameter list", () => {
      const code = `
        export default Dynamics(() => {
          return 42;
        });
      `;
      const fn = compileUserCode<[]>(code, "Dynamics");
      const result = fn();
      expect(result).toBe(42);
    });

    it("should preserve function behavior", () => {
      const code = `
        export default Dynamics(function(multiplier) {
          return multiplier * 2;
        });
      `;
      const fn = compileUserCode<[number]>(code, "Dynamics");
      const result = fn(5);
      expect(result).toBe(10);
    });
  });

  describe("error handling", () => {
    it("should throw descriptive error for invalid code", () => {
      const code = `
        export default Dynamics((x) => {
          invalid syntax here
        });
      `;
      expect(() => compileUserCode(code, "Dynamics")).toThrow();
    });

    it("should throw error if constructor function doesn't return a function", () => {
      const code = `
        export default Dynamics(42);
      `;
      expect(() => compileUserCode(code, "Dynamics")).toThrow();
    });

    it("should throw error for empty code", () => {
      const code = "";
      expect(() => compileUserCode(code, "Dynamics")).toThrow(
        "Module must have a default export",
      );
    });
  });

  describe("real-world differential equations", () => {
    it("should handle exponential growth equation", () => {
      const code = `
        export default Dynamics((population: number, rate: number): number => {
          return population * rate;
        });
      `;
      const fn = compileUserCode<[number, number]>(code, "Dynamics");
      const result = fn(100, 1.05);
      expect(result).toBe(105);
    });

    it("should handle Lotka-Volterra predator-prey model", () => {
      const code = `
        export default Dynamics((prey: number, predator: number, alpha: number, beta: number): number[] => {
          const dPrey = alpha * prey - beta * prey * predator;
          const dPredator = -beta * predator + alpha * prey * predator;
          return [dPrey, dPredator];
        });
      `;
      const fn = compileUserCode<[number, number, number, number]>(
        code,
        "Dynamics",
      );
      const result = fn(100, 10, 0.1, 0.02);
      expect(Array.isArray(result)).toBe(true);
      expect((result as number[]).length).toBe(2);
    });

    it("should handle state vector operations", () => {
      const code = `
        export default Dynamics((state: number[][]): number[][] => {
          return state.map(vector => 
            vector.map(component => component * 0.5)
          );
        });
      `;
      const fn = compileUserCode<[number[][]]>(code, "Dynamics");
      const result = fn([
        [10, 20],
        [30, 40],
      ]);
      expect(result).toEqual([
        [5, 10],
        [15, 20],
      ]);
    });
  });
});
