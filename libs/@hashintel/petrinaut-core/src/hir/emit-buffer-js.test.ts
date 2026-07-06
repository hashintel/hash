import { describe, expect, it } from "vitest";

import { StringPool } from "../simulation/engine/string-pool";
import {
  createTokenRegionViews,
  encodeTokenToBytes,
  computeTokenSlotLayout,
} from "../simulation/engine/token-layout";
import {
  emitBufferDynamicsJs,
  emitBufferKernelJs,
  emitBufferLambdaJs,
} from "./emit-buffer-js";
import {
  instantiateHirBufferDynamics,
  instantiateHirBufferLambda,
} from "./instantiate";
import { lowerTypeScriptToHir } from "./lower-typescript";

import type { HirFunction } from "./hir";
import type { HirKernelContext, HirLambdaContext } from "./surface-context";

function lower(code: string, surface: "lambda" | "kernel" | "dynamics") {
  const result = lowerTypeScriptToHir(code, surface);
  if (!result.ok) {
    throw new Error(result.diagnostics[0]?.message);
  }
  return result.fn as HirFunction;
}

// Pool place: x(real) v(real) alive(boolean) status(string) id(uuid).
// Packed layout (v2): 8-aligned fields in declaration order — x@0, v@8,
// status@16 (u64 handle), id@24 (2×u64) — then alive(u8)@40; stride 48.
const poolElements = [
  { name: "x", type: "real" as const },
  { name: "v", type: "real" as const },
  { name: "status", type: "string" as const },
  { name: "id", type: "uuid" as const },
  { name: "alive", type: "boolean" as const },
];
const poolColorElements = poolElements.map((element, index) => ({
  elementId: `e${index}`,
  name: element.name,
  type: element.type,
}));
const poolLayout = computeTokenSlotLayout(poolColorElements);

const poolSlot = {
  name: "Pool",
  colorId: "c1",
  elements: poolElements,
  tokenCount: 2,
  slotStart: 0,
};

const lambdaContext: HirLambdaContext = {
  surface: "lambda",
  parameters: [
    { name: "rate", type: "real" },
    { name: "threshold", type: "real" },
  ],
  inputPlaces: [(({ slotStart: _s, ...binding }) => binding)(poolSlot)],
  inputSlots: [poolSlot],
  lambdaType: "stochastic",
};

// A frame region with two Pool tokens, back to back.
function makeRegion(pool: StringPool) {
  // hi = 0x0123456789abcdef, lo = 0xfedcba9876543210 (avoids no-bitwise)
  const uuid =
    0x0123456789abcdefn * 18446744073709551616n + 0xfedcba9876543210n;
  const tokenA = encodeTokenToBytes(
    poolLayout,
    { x: 1.5, v: -2, status: "shipped", id: uuid, alive: true },
    "test",
    pool,
  );
  const tokenB = encodeTokenToBytes(
    poolLayout,
    { x: 4, v: 8, status: "queued", id: 7n, alive: false },
    "test",
    pool,
  );
  const bytes = new Uint8Array(poolLayout.strideBytes * 2);
  bytes.set(tokenA, 0);
  bytes.set(tokenB, poolLayout.strideBytes);
  const views = createTokenRegionViews(bytes.buffer, 0, bytes.byteLength);
  const slotBases = new Int32Array([0, poolLayout.strideBytes]);
  return { views, slotBases, uuid };
}

function compileLambda(code: string, pool: StringPool, parameters = {}) {
  const program = emitBufferLambdaJs(lower(code, "lambda"), lambdaContext);
  expect(program).not.toBeNull();
  expect(program!.inputSlotCount).toBe(2);
  return instantiateHirBufferLambda(program!.source, parameters, pool);
}

describe("emitBufferLambdaJs (token format v2)", () => {
  it("reads real/boolean attributes at packed byte offsets", () => {
    const pool = new StringPool();
    const { views, slotBases } = makeRegion(pool);
    const fn = compileLambda(
      `export default Lambda((input, parameters) => input.Pool[0].alive ? input.Pool[0].x + input.Pool[1].v : 0);`,
      pool,
    );
    expect(fn(views.f64, views.u64, views.u8, slotBases)).toBe(1.5 + 8);
  });

  it("resolves interned strings through the pool", () => {
    const pool = new StringPool();
    const { views, slotBases } = makeRegion(pool);
    const fn = compileLambda(
      `export default Lambda((input, parameters) => input.Pool[0].status === "shipped" && input.Pool[1].status.startsWith("q"));`,
      pool,
    );
    expect(fn(views.f64, views.u64, views.u8, slotBases)).toBe(true);
  });

  it("assembles uuid attributes as bigints from the two u64 lanes", () => {
    const pool = new StringPool();
    const { views, slotBases, uuid } = makeRegion(pool);
    const fn = compileLambda(
      `export default Lambda((input, parameters) => input.Pool[0].id === input.Pool[1].id ? 1 : 0.5);`,
      pool,
    );
    expect(fn(views.f64, views.u64, views.u8, slotBases)).toBe(0.5);
    void uuid;
  });

  it("binds parameters and supports guards/destructuring", () => {
    const pool = new StringPool();
    const { views, slotBases } = makeRegion(pool);
    const fn = compileLambda(
      `export default Lambda((input, parameters) => {
  const { rate, threshold } = parameters;
  const { x, alive } = input.Pool[0];
  if (!alive) return 0;
  if (x < threshold) return 0;
  return rate * x;
});`,
      pool,
      { rate: 2, threshold: 1 },
    );
    expect(fn(views.f64, views.u64, views.u8, slotBases)).toBe(3);
  });
});

describe("emitBufferKernelJs (token format v2)", () => {
  it("is not emitted yet — kernels run the object program", () => {
    const context: HirKernelContext = {
      surface: "kernel",
      parameters: [],
      inputPlaces: lambdaContext.inputPlaces,
      inputSlots: lambdaContext.inputSlots,
      outputPlaces: lambdaContext.inputPlaces,
      outputSlots: lambdaContext.inputSlots,
      stochasticity: true,
    };
    const fn = lower(
      `export default TransitionKernel((input) => ({ Pool: [input.Pool[0], input.Pool[1]] }));`,
      "kernel",
    );
    expect(emitBufferKernelJs(fn, context)).toBeNull();
  });
});

describe("emitBufferDynamicsJs (token format v2)", () => {
  it("computes derivatives from packed bytes without record decoding", () => {
    const pool = new StringPool();
    const { views } = makeRegion(pool);
    const source = emitBufferDynamicsJs(
      lower(
        `export default Dynamics((tokens, parameters) => {
  const g = parameters.g;
  return tokens.map(({ x, v, alive }) => ({
    x: alive ? v : 0,
    v: -g * x,
  }));
});`,
        "dynamics",
      ),
      poolElements,
    );
    expect(source).not.toBeNull();
    const fn = instantiateHirBufferDynamics(source!, { g: 2 }, pool);
    const result = fn(views.u8, 2);
    // Token A: alive → x' = v = -2, v' = -2 * 1.5 = -3
    // Token B: dead  → x' = 0,      v' = -2 * 4 = -8
    expect([...result]).toEqual([-2, -3, 0, -8]);
  });

  it("reads string attributes in dynamics (read-only)", () => {
    const pool = new StringPool();
    const { views } = makeRegion(pool);
    const source = emitBufferDynamicsJs(
      lower(
        `export default Dynamics((tokens) => tokens.map(({ v, status }) => ({
  x: status === "shipped" ? v : 0,
})));`,
        "dynamics",
      ),
      poolElements,
    );
    expect(source).not.toBeNull();
    const fn = instantiateHirBufferDynamics(source!, {}, pool);
    expect([...fn(views.u8, 2)]).toEqual([-2, 0, 0, 0]);
  });

  it("bails to null when the body is not a token map", () => {
    expect(
      emitBufferDynamicsJs(
        lower(`export default Dynamics((tokens) => [{ x: 1 }]);`, "dynamics"),
        poolElements,
      ),
    ).toBeNull();
  });
});
