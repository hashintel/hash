/**
 * Behavioral tests for the object-convention emitter (`emitUserFunctionJs`).
 * The simulator only runs buffer programs now, but the object emitter remains
 * a reference backend — these tests instantiate its emitted source directly
 * and evaluate it with sample inputs.
 */
import { describe, expect, it } from "vitest";

import { emitUserFunctionJs } from "./emit-js";
import { hirDistributionRuntime } from "./instantiate";
import { lowerTypeScriptToHir } from "./lower-typescript";

import type { RuntimeDistribution } from "../simulation/authoring/user-code/distribution";

type UserFunction = (tokens: unknown, parameters?: unknown) => unknown;

function compileUserFunction(
  code: string,
  surface: "lambda" | "kernel",
): UserFunction {
  const lowered = lowerTypeScriptToHir(code, surface);
  if (!lowered.ok) {
    throw new Error(lowered.diagnostics[0]?.message);
  }
  const source = emitUserFunctionJs(lowered.fn);
  // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  return new Function("__dist", `"use strict"; return (${source});`)(
    hirDistributionRuntime,
  ) as UserFunction;
}

describe("emitUserFunctionJs (lambda)", () => {
  it("compiles lambdas with bindings, length and conditionals", () => {
    const hirFn = compileUserFunction(
      `export default Lambda((input, parameters) => {
  const pressure = input.Pool.length * parameters.rate;
  return pressure > 10 ? Infinity : pressure;
});`,
      "lambda",
    );

    const tokensByPlace = { Pool: [{ x: 1 }, { x: 2 }, { x: 3 }] };
    expect(hirFn(tokensByPlace, { rate: 0.5 })).toBe(1.5);
    expect(hirFn(tokensByPlace, { rate: 2 })).toBe(6);
    expect(hirFn(tokensByPlace, { rate: 5 })).toBe(Infinity);
  });

  it("supports predicates over token attributes", () => {
    const fn = compileUserFunction(
      `export default Lambda((input, parameters) => input.Pool[0].active && input.Pool[0].x >= parameters.threshold);`,
      "lambda",
    );
    expect(fn({ Pool: [{ active: true, x: 5 }] }, { threshold: 4 })).toBe(true);
    expect(fn({ Pool: [{ active: true, x: 3 }] }, { threshold: 4 })).toBe(
      false,
    );
  });

  it("rejects out-of-subset code at lowering", () => {
    expect(
      lowerTypeScriptToHir(
        `export default Lambda((input) => { let x = 1; return x; });`,
        "lambda",
      ).ok,
    ).toBe(false);
  });

  it("renames user bindings that collide with emitter internals", () => {
    const fn = compileUserFunction(
      `export default Lambda((input, parameters) => {
  const __params = parameters.rate * 2;
  return __params + 1;
});`,
      "lambda",
    );
    expect(fn({}, { rate: 3 })).toBe(7);
  });
});

describe("emitUserFunctionJs (kernel)", () => {
  it("produces runtime distribution objects compatible with the engine", () => {
    const fn = compileUserFunction(
      `export default TransitionKernel((input, parameters) => {
  const noise = Distribution.Gaussian(0, parameters.sigma);
  return { Out: [{ x: noise.map((value) => value * 2), y: 1 }] };
});`,
      "kernel",
    );
    const output = fn({}, { sigma: 3 }) as Record<
      string,
      Record<string, unknown>[]
    >;
    const x = output.Out![0]!.x as RuntimeDistribution;
    expect(x.__brand).toBe("distribution");
    expect(x.type).toBe("mapped");
    if (x.type === "mapped") {
      expect(x.inner).toMatchObject({
        type: "gaussian",
        mean: 0,
        deviation: 3,
      });
      expect(x.fn(2)).toBe(4);
    }
    expect(output.Out![0]!.y).toBe(1);
  });

  it("shares one distribution object across aliased outputs", () => {
    const fn = compileUserFunction(
      `export default TransitionKernel((input) => {
  const d = Distribution.Uniform(0, 1);
  return { Out: [{ x: d, y: d }] };
});`,
      "kernel",
    );
    const output = fn({}, {}) as Record<string, Record<string, unknown>[]>;
    // Same object identity → the engine's sample cache yields one draw.
    expect(output.Out![0]!.x).toBe(output.Out![0]!.y);
  });

  it("passes input tokens through .map kernels", () => {
    const fn = compileUserFunction(
      `export default TransitionKernel((input, parameters) => ({
  Out: input.In.map((token, index) => ({ x: token.x + index, y: token.y * parameters.k })),
}));`,
      "kernel",
    );
    const output = fn(
      {
        In: [
          { x: 1, y: 2 },
          { x: 10, y: 20 },
        ],
      },
      { k: 3 },
    ) as Record<string, { x: number; y: number }[]>;
    expect(output.Out).toEqual([
      { x: 1, y: 6 },
      { x: 11, y: 60 },
    ]);
  });
});
