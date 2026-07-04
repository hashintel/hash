import { describe, expect, it } from "vitest";

import { emitBufferKernelJs, emitBufferLambdaJs } from "./emit-buffer-js";
import {
  instantiateHirBufferKernel,
  instantiateHirBufferLambda,
} from "./instantiate";
import { lowerTypeScriptToHir } from "./lower-typescript";

import type { RuntimeDistribution } from "../simulation/authoring/user-code/distribution";
import type { HirFunction } from "./hir";
import type { HirKernelContext, HirLambdaContext } from "./surface-context";

function lower(code: string, surface: "lambda" | "kernel"): HirFunction {
  const result = lowerTypeScriptToHir(code, surface);
  if (!result.ok) {
    throw new Error(result.diagnostics[0]?.message);
  }
  return result.fn;
}

// Layout: two input arcs — Pool (weight 2, elements x/alive) then
// Fuel (weight 1, element level). Slots: [Pool0, Pool1, Fuel0].
const poolSlot = {
  name: "Pool",
  colorId: "c1",
  elements: [
    { name: "x", type: "real" as const },
    { name: "alive", type: "boolean" as const },
  ],
  tokenCount: 2,
  slotStart: 0,
};
const fuelSlot = {
  name: "Fuel",
  colorId: "c2",
  elements: [{ name: "level", type: "real" as const }],
  tokenCount: 1,
  slotStart: 2,
};

const lambdaContext: HirLambdaContext = {
  surface: "lambda",
  parameters: [{ name: "rate", type: "real" }],
  inputPlaces: [
    { ...poolSlot, slotStart: undefined as never },
    { ...fuelSlot, slotStart: undefined as never },
  ].map(({ slotStart: _slotStart, ...binding }) => binding),
  inputSlots: [poolSlot, fuelSlot],
  lambdaType: "stochastic",
};

const outSlot = {
  name: "Out",
  colorId: "c3",
  elements: [
    { name: "x", type: "real" as const },
    { name: "count", type: "integer" as const },
    { name: "flag", type: "boolean" as const },
  ],
  tokenCount: 1,
  slotStart: 0,
};

const kernelContext: HirKernelContext = {
  surface: "kernel",
  parameters: [{ name: "sigma", type: "real" }],
  inputPlaces: lambdaContext.inputPlaces,
  inputSlots: lambdaContext.inputSlots,
  outputPlaces: [(({ slotStart: _slotStart, ...binding }) => binding)(outSlot)],
  outputSlots: [outSlot],
  stochasticity: true,
};

// A frame: Pool tokens at bases 0 and 2, Fuel token at base 10.
// Pool[0] = { x: 1.5, alive: 1 }, Pool[1] = { x: -2, alive: 0 },
// Fuel[0] = { level: 7 }.
const tokenValues = new Float64Array(16);
tokenValues.set([1.5, 1], 0);
tokenValues.set([-2, 0], 2);
tokenValues.set([7], 10);
const slotBases = new Int32Array([0, 2, 10]);

describe("emitBufferLambdaJs", () => {
  function compileLambda(code: string, parameters = { rate: 3 }) {
    const program = emitBufferLambdaJs(lower(code, "lambda"), lambdaContext);
    expect(program).not.toBeNull();
    expect(program!.inputSlotCount).toBe(3);
    return instantiateHirBufferLambda(program!.source, parameters);
  }

  it("reads token attributes at static offsets", () => {
    const fn = compileLambda(
      `export default Lambda((input, parameters) => input.Pool[0].x + input.Pool[1].x + input.Fuel[0].level);`,
    );
    expect(fn(tokenValues, slotBases)).toBe(1.5 - 2 + 7);
  });

  it("decodes booleans and binds parameters", () => {
    const fn = compileLambda(
      `export default Lambda((input, parameters) => input.Pool[0].alive && input.Pool[0].x * parameters.rate > 4);`,
    );
    expect(fn(tokenValues, slotBases)).toBe(true);
  });

  it("supports destructured bindings and guard clauses", () => {
    const fn = compileLambda(
      `export default Lambda((input, parameters) => {
  const { x, alive } = input.Pool[0];
  if (!alive) return 0;
  const { rate } = parameters;
  return x * rate;
});`,
    );
    expect(fn(tokenValues, slotBases)).toBe(4.5);
  });

  it("resolves .length to the static arc weight", () => {
    const fn = compileLambda(
      `export default Lambda((input) => input.Pool.length * 10 + input.Fuel.length);`,
    );
    expect(fn(tokenValues, slotBases)).toBe(21);
  });

  it("supports array destructuring of the tuple", () => {
    const fn = compileLambda(
      `export default Lambda((input) => {
  const [a, b] = input.Pool;
  return a.x - b.x;
});`,
    );
    expect(fn(tokenValues, slotBases)).toBe(3.5);
  });

  it("bails to null on dynamic token indices", () => {
    const fn = lower(
      `export default Lambda((input, parameters) => input.Pool[parameters.rate].x);`,
      "lambda",
    );
    expect(emitBufferLambdaJs(fn, lambdaContext)).toBeNull();
  });
});

describe("emitBufferKernelJs", () => {
  function compileKernel(code: string, parameters = { sigma: 2 }) {
    const program = emitBufferKernelJs(lower(code, "kernel"), kernelContext);
    expect(program).not.toBeNull();
    expect(program!.inputSlotCount).toBe(3);
    expect(program!.outputFloatCount).toBe(3);
    return instantiateHirBufferKernel(program!.source, parameters);
  }

  function runKernel(fn: ReturnType<typeof compileKernel>) {
    const out = new Float64Array(3);
    const sinks: [number, RuntimeDistribution][] = [];
    fn(tokenValues, slotBases, out, (index, dist) => sinks.push([index, dist]));
    return { out, sinks };
  }

  it("writes attributes place-major with integer rounding and boolean 0/1", () => {
    const fn = compileKernel(
      `export default TransitionKernel((input, parameters) => ({
  Out: [{ x: input.Pool[0].x * 2, count: 2.7, flag: input.Pool[1].x < 0 }],
}));`,
    );
    const { out, sinks } = runKernel(fn);
    expect([...out]).toEqual([3, 3, 1]);
    expect(sinks).toEqual([]);
  });

  it("defers distributions through distSink with shared identity", () => {
    const fn = compileKernel(
      `export default TransitionKernel((input, parameters) => {
  const noise = Distribution.Gaussian(0, parameters.sigma);
  const scaled = noise.map((v) => v * 10);
  return { Out: [{ x: scaled, count: 1, flag: false }] };
});`,
    );
    const { out, sinks } = runKernel(fn);
    expect(out[1]).toBe(1);
    expect(sinks).toHaveLength(1);
    const [index, dist] = sinks[0]!;
    expect(index).toBe(0);
    expect(dist.type).toBe("mapped");
    if (dist.type === "mapped") {
      expect(dist.inner).toMatchObject({
        type: "gaussian",
        mean: 0,
        deviation: 2,
      });
      expect(dist.fn(3)).toBe(30);
    }
  });

  it("unrolls .map over input tuples", () => {
    const context: HirKernelContext = {
      ...kernelContext,
      outputSlots: [{ ...outSlot, tokenCount: 2 }],
      outputPlaces: [
        (({ slotStart: _s, ...binding }) => ({ ...binding, tokenCount: 2 }))(
          outSlot,
        ),
      ],
    };
    const program = emitBufferKernelJs(
      lower(
        `export default TransitionKernel((input, parameters) => ({
  Out: input.Pool.map((token, i) => ({ x: token.x + i, count: i, flag: token.alive })),
}));`,
        "kernel",
      ),
      context,
    );
    expect(program).not.toBeNull();
    const fn = instantiateHirBufferKernel(program!.source, {});
    const out = new Float64Array(6);
    fn(tokenValues, slotBases, out, () => {});
    expect([...out]).toEqual([1.5, 0, 1, -1, 1, 0]);
  });

  it("forwards whole input tuples to outputs", () => {
    const context: HirKernelContext = {
      ...kernelContext,
      outputSlots: [
        {
          name: "Sink",
          colorId: "c2",
          elements: [{ name: "level", type: "real" as const }],
          tokenCount: 1,
          slotStart: 0,
        },
      ],
      outputPlaces: [
        {
          name: "Sink",
          colorId: "c2",
          elements: [{ name: "level", type: "real" as const }],
          tokenCount: 1,
        },
      ],
    };
    const program = emitBufferKernelJs(
      lower(
        `export default TransitionKernel((input) => ({ Sink: input.Fuel }));`,
        "kernel",
      ),
      context,
    );
    expect(program).not.toBeNull();
    const fn = instantiateHirBufferKernel(program!.source, {});
    const out = new Float64Array(1);
    fn(tokenValues, slotBases, out, () => {});
    expect([...out]).toEqual([7]);
  });

  it("bails when the output token count is not statically resolvable", () => {
    // Returning a conditional record — structurally dynamic.
    const fn = lower(
      `export default TransitionKernel((input, parameters) => parameters.sigma > 1 ? { Out: [{ x: 1, count: 0, flag: false }] } : { Out: [{ x: 2, count: 0, flag: false }] });`,
      "kernel",
    );
    expect(emitBufferKernelJs(fn, kernelContext)).toBeNull();
  });
});
