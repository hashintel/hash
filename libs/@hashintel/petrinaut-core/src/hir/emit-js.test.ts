import { describe, expect, it } from "vitest";

import { tryCompileHirKernel, tryCompileHirLambda } from "./compile";

import type { RuntimeDistribution } from "../simulation/authoring/user-code/distribution";

describe("tryCompileHirLambda", () => {
  it("compiles lambdas with bindings, length and conditionals", () => {
    const code = `export default Lambda((input, parameters) => {
  const pressure = input.Pool.length * parameters.rate;
  return pressure > 10 ? Infinity : pressure;
});`;
    const hirFn = tryCompileHirLambda(code)!;
    expect(hirFn).not.toBeNull();

    const tokensByPlace = { Pool: [{ x: 1 }, { x: 2 }, { x: 3 }] };
    expect(hirFn(tokensByPlace, { rate: 0.5 })).toBe(1.5);
    expect(hirFn(tokensByPlace, { rate: 2 })).toBe(6);
    expect(hirFn(tokensByPlace, { rate: 5 })).toBe(Infinity);
  });

  it("supports predicates over token attributes", () => {
    const fn = tryCompileHirLambda(
      `export default Lambda((input, parameters) => input.Pool[0].active && input.Pool[0].x >= parameters.threshold);`,
    )!;
    expect(fn({ Pool: [{ active: true, x: 5 }] }, { threshold: 4 })).toBe(true);
    expect(fn({ Pool: [{ active: true, x: 3 }] }, { threshold: 4 })).toBe(
      false,
    );
  });

  it("returns null for out-of-subset code", () => {
    expect(
      tryCompileHirLambda(
        `export default Lambda((input) => { let x = 1; return x; });`,
      ),
    ).toBeNull();
  });

  it("renames user bindings that collide with emitter internals", () => {
    const fn = tryCompileHirLambda(
      `export default Lambda((input, parameters) => {
  const __params = parameters.rate * 2;
  return __params + 1;
});`,
    )!;
    expect(fn({}, { rate: 3 })).toBe(7);
  });
});

describe("tryCompileHirKernel", () => {
  it("produces runtime distribution objects compatible with the engine", () => {
    const fn = tryCompileHirKernel(
      `export default TransitionKernel((input, parameters) => {
  const noise = Distribution.Gaussian(0, parameters.sigma);
  return { Out: [{ x: noise.map((value) => value * 2), y: 1 }] };
});`,
    )!;
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
    const fn = tryCompileHirKernel(
      `export default TransitionKernel((input) => {
  const d = Distribution.Uniform(0, 1);
  return { Out: [{ x: d, y: d }] };
});`,
    )!;
    const output = fn({}, {}) as Record<string, Record<string, unknown>[]>;
    // Same object identity → the engine's sample cache yields one draw.
    expect(output.Out![0]!.x).toBe(output.Out![0]!.y);
  });

  it("passes input tokens through .map kernels", () => {
    const fn = tryCompileHirKernel(
      `export default TransitionKernel((input, parameters) => ({
  Out: input.In.map((token, index) => ({ x: token.x + index, y: token.y * parameters.k })),
}));`,
    )!;
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
