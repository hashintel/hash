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
  emitBufferMetricJs,
} from "./emit-buffer-js";
import {
  instantiateHirBufferDynamics,
  instantiateHirBufferKernel,
  instantiateHirBufferLambda,
  instantiateHirMetric,
} from "./instantiate";
import { lowerTypeScriptToHir } from "./lower-typescript";

import type { RuntimeDistribution } from "../simulation/authoring/user-code/distribution";
import type { HirFunction } from "./hir";
import type {
  HirKernelContext,
  HirLambdaContext,
  HirMetricContext,
} from "./surface-context";

function lower(
  code: string,
  surface: "lambda" | "kernel" | "dynamics" | "metric",
) {
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

// A frame region with two Pool tokens, back to back. `placeBases` has one
// entry per input arc (the Pool arc's place region starts at byte 0);
// `indices` one selected token index per slot (strides are baked in).
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
  const placeBases = new Int32Array([0]);
  const indices = new Int32Array([0, 1]);
  return { views, placeBases, indices, uuid };
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
    const { views, placeBases, indices } = makeRegion(pool);
    const fn = compileLambda(
      `export default Lambda((input, parameters) => input.Pool[0].alive ? input.Pool[0].x + input.Pool[1].v : 0);`,
      pool,
    );
    expect(fn(views.f64, views.u64, views.u8, placeBases, indices)).toBe(
      1.5 + 8,
    );
  });

  it("resolves interned strings through the pool", () => {
    const pool = new StringPool();
    const { views, placeBases, indices } = makeRegion(pool);
    const fn = compileLambda(
      `export default Lambda((input, parameters) => input.Pool[0].status === "shipped" && input.Pool[1].status.startsWith("q"));`,
      pool,
    );
    expect(fn(views.f64, views.u64, views.u8, placeBases, indices)).toBe(true);
  });

  it("assembles uuid attributes as bigints from the two u64 lanes", () => {
    const pool = new StringPool();
    const { views, placeBases, indices, uuid } = makeRegion(pool);
    const fn = compileLambda(
      `export default Lambda((input, parameters) => input.Pool[0].id === input.Pool[1].id ? 1 : 0.5);`,
      pool,
    );
    expect(fn(views.f64, views.u64, views.u8, placeBases, indices)).toBe(0.5);
    void uuid;
  });

  it("binds parameters and supports guards/destructuring", () => {
    const pool = new StringPool();
    const { views, placeBases, indices } = makeRegion(pool);
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
    expect(fn(views.f64, views.u64, views.u8, placeBases, indices)).toBe(3);
  });
});

describe("emitBufferKernelJs (token format v2)", () => {
  // Out place: a(real) b(real) label(string) id(uuid) flag(boolean) — same
  // packing rules as Pool: a@0, b@8, label@16, id@24 (2×u64), flag@40;
  // stride 48.
  const outElements = [
    { name: "a", type: "real" as const },
    { name: "b", type: "real" as const },
    { name: "label", type: "string" as const },
    { name: "id", type: "uuid" as const },
    { name: "flag", type: "boolean" as const },
  ];
  const outLayout = computeTokenSlotLayout(
    outElements.map((element, index) => ({
      elementId: `o${index}`,
      name: element.name,
      type: element.type,
    })),
  );
  const fieldOffset = (name: string) =>
    outLayout.fields.find((field) => field.element.name === name)!.byteOffset;

  const kernelContext: HirKernelContext = {
    surface: "kernel",
    parameters: [],
    inputPlaces: lambdaContext.inputPlaces,
    inputSlots: lambdaContext.inputSlots,
    outputPlaces: [
      { name: "Out", colorId: "c2", elements: outElements, tokenCount: 2 },
    ],
    outputSlots: [
      {
        name: "Out",
        colorId: "c2",
        elements: outElements,
        tokenCount: 2,
        slotStart: 0,
      },
    ],
    stochasticity: true,
  };

  type SinkCall = { kind: string; index: number; payload: unknown };

  function runKernel(code: string, pool: StringPool) {
    const program = emitBufferKernelJs(lower(code, "kernel"), kernelContext);
    expect(program).not.toBeNull();
    expect(program!.inputSlotCount).toBe(2);
    const fn = instantiateHirBufferKernel(program!.source, {}, pool);
    const { views, placeBases, indices } = makeRegion(pool);
    const staging = new Uint8Array(program!.outputByteCount);
    const stagingViews = createTokenRegionViews(
      staging.buffer,
      0,
      staging.byteLength,
    );
    const sinkCalls: SinkCall[] = [];
    fn(
      views.f64,
      views.u64,
      views.u8,
      placeBases,
      indices,
      stagingViews.f64,
      stagingViews.u64,
      stagingViews.u8,
      (kind, index, payload) => sinkCalls.push({ kind, index, payload }),
    );
    return { program: program!, stagingViews, sinkCalls };
  }

  it("writes static values at packed offsets and defers RNG values through the sink", () => {
    const pool = new StringPool();
    const { program, stagingViews, sinkCalls } = runKernel(
      `export default TransitionKernel((input) => {
  const noise = Distribution.Gaussian(0, 1);
  return {
    Out: [
      { a: input.Pool[0].x + 1, b: noise, label: "shipped", flag: true },
      { a: 2, b: 3, label: input.Pool[1].status, id: Uuid.from("order-1"), flag: false },
    ],
  };
});`,
      pool,
    );

    const stride = outLayout.strideBytes;
    expect(program.outputByteCount).toBe(2 * stride);

    // Token 0 static writes at the packed offsets.
    expect(stagingViews.f64[fieldOffset("a") / 8]).toBe(1.5 + 1);
    expect(pool.get(Number(stagingViews.u64[fieldOffset("label") / 8]))).toBe(
      "shipped",
    );
    expect(stagingViews.u8[fieldOffset("flag")]).toBe(1);

    // Token 1 static writes, one stride further.
    expect(stagingViews.f64[(stride + fieldOffset("a")) / 8]).toBe(2);
    expect(stagingViews.f64[(stride + fieldOffset("b")) / 8]).toBe(3);
    expect(
      pool.get(Number(stagingViews.u64[(stride + fieldOffset("label")) / 8])),
    ).toBe("queued");
    expect(stagingViews.u8[stride + fieldOffset("flag")]).toBe(0);

    // Deferred slots arrive in (token, element-declaration) order: token 0's
    // distribution (b) then omitted uuid (id, auto-generate), then token 1's
    // Uuid.from. Indices are 64-bit lanes into the staging buffer.
    expect(sinkCalls.map(({ kind, index }) => ({ kind, index }))).toEqual([
      { kind: "dist", index: fieldOffset("b") / 8 },
      { kind: "generate", index: fieldOffset("id") / 8 },
      { kind: "from", index: (stride + fieldOffset("id")) / 8 },
    ]);
    expect(sinkCalls[0]!.payload as RuntimeDistribution).toMatchObject({
      __brand: "distribution",
      type: "gaussian",
      mean: 0,
      deviation: 1,
    });
    expect(sinkCalls[2]!.payload).toBe("order-1");
  });

  it("forwards whole input tokens, deferring uuid copies through the sink", () => {
    const forwardContext: HirKernelContext = {
      ...kernelContext,
      outputPlaces: [
        { name: "Pool", colorId: "c1", elements: poolElements, tokenCount: 2 },
      ],
      outputSlots: [poolSlot],
    };
    const program = emitBufferKernelJs(
      lower(
        `export default TransitionKernel((input) => ({ Pool: [input.Pool[0], input.Pool[1]] }));`,
        "kernel",
      ),
      forwardContext,
    );
    expect(program).not.toBeNull();
    expect(program!.outputByteCount).toBe(2 * poolLayout.strideBytes);

    const pool = new StringPool();
    const fn = instantiateHirBufferKernel(program!.source, {}, pool);
    const { views, placeBases, indices, uuid } = makeRegion(pool);
    const staging = new Uint8Array(program!.outputByteCount);
    const stagingViews = createTokenRegionViews(
      staging.buffer,
      0,
      staging.byteLength,
    );
    const sinkCalls: SinkCall[] = [];
    fn(
      views.f64,
      views.u64,
      views.u8,
      placeBases,
      indices,
      stagingViews.f64,
      stagingViews.u64,
      stagingViews.u8,
      (kind, index, payload) => sinkCalls.push({ kind, index, payload }),
    );

    const stride = poolLayout.strideBytes;
    // Real/boolean/string attributes are copied inline.
    expect(stagingViews.f64[0]).toBe(1.5); // token 0 x
    expect(stagingViews.f64[1]).toBe(-2); // token 0 v
    expect(stagingViews.f64[stride / 8]).toBe(4); // token 1 x
    expect(pool.get(Number(stagingViews.u64[2]))).toBe("shipped");
    expect(pool.get(Number(stagingViews.u64[stride / 8 + 2]))).toBe("queued");
    expect(stagingViews.u8[40]).toBe(1);
    expect(stagingViews.u8[stride + 40]).toBe(0);
    // uuid copies are bigints, deferred through the sink as "from".
    expect(sinkCalls.map(({ kind }) => kind)).toEqual(["from", "from"]);
    expect(sinkCalls[0]!.payload).toBe(uuid);
    expect(sinkCalls[1]!.payload).toBe(7n);
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
// ---------------------------------------------------------------------------
// Metric programs (Monte-Carlo-style frame buffers)
// ---------------------------------------------------------------------------

const metricContext: HirMetricContext = {
  surface: "metric",
  parameters: [],
  places: [
    {
      name: "Pool",
      elements: [
        { name: "x", type: "real" },
        { name: "status", type: "string" },
      ],
    },
    { name: "Buffer", elements: [{ name: "x", type: "real" }] },
    // Uncolored place: exposes `count` and an empty-record tokens array.
    { name: "Bin", elements: [] },
  ],
};

const metricPoolLayout = computeTokenSlotLayout([
  { elementId: "e0", name: "x", type: "real" },
  { elementId: "e1", name: "status", type: "string" },
]);
const metricBufferLayout = computeTokenSlotLayout([
  { elementId: "e0", name: "x", type: "real" },
]);

/**
 * Hand-packs one Monte-Carlo-style frame: dense `placeCounts`/`placeOffsets`
 * in frame order (Bin, Pool, Buffer — deliberately different from the metric
 * context order so `__places` mapping is exercised), plus shared views over
 * the token region.
 */
function makeMetricFrame(pool: StringPool) {
  const poolTokens = [
    { x: 1.5, status: "shipped" },
    { x: 2.5, status: "queued" },
    { x: 3, status: "shipped" },
  ];
  const bufferTokens = [{ x: 10 }, { x: 20 }];

  const poolBytes = poolTokens.length * metricPoolLayout.strideBytes;
  const bufferBytes = bufferTokens.length * metricBufferLayout.strideBytes;
  const bytes = new Uint8Array(poolBytes + bufferBytes);
  for (const [index, token] of poolTokens.entries()) {
    bytes.set(
      encodeTokenToBytes(metricPoolLayout, token, "test", pool),
      index * metricPoolLayout.strideBytes,
    );
  }
  for (const [index, token] of bufferTokens.entries()) {
    bytes.set(
      encodeTokenToBytes(metricBufferLayout, token, "test", pool),
      poolBytes + index * metricBufferLayout.strideBytes,
    );
  }
  const views = createTokenRegionViews(bytes.buffer, 0, bytes.byteLength);

  // Frame order: Bin=0, Pool=1, Buffer=2.
  const placeIndexByName: Record<string, number> = {
    Bin: 0,
    Pool: 1,
    Buffer: 2,
  };
  const placeCounts = new Uint32Array([
    5,
    poolTokens.length,
    bufferTokens.length,
  ]);
  const placeOffsets = new Uint32Array([0, 0, poolBytes]);
  return { views, placeCounts, placeOffsets, placeIndexByName };
}

function compileMetric(
  code: string,
  pool: StringPool,
  placeIndexByName: Record<string, number>,
) {
  const program = emitBufferMetricJs(lower(code, "metric"), metricContext);
  expect(program).not.toBeNull();
  const placeIndices = new Int32Array(
    program!.placeNames.map((name) => placeIndexByName[name]!),
  );
  return instantiateHirMetric(program!.source, placeIndices, pool);
}

describe("emitBufferMetricJs (Monte-Carlo frame buffers)", () => {
  it("reads place counts (including uncolored places)", () => {
    const pool = new StringPool();
    const frame = makeMetricFrame(pool);
    const fn = compileMetric(
      `return state.places.Bin.count + 10 * state.places.Pool.count;`,
      pool,
      frame.placeIndexByName,
    );
    expect(
      fn(
        frame.views.f64,
        frame.views.u64,
        frame.views.u8,
        frame.placeCounts,
        frame.placeOffsets,
      ),
    ).toBe(5 + 30);
  });

  it("compiles reduce over place tokens to a loop", () => {
    const pool = new StringPool();
    const frame = makeMetricFrame(pool);
    const fn = compileMetric(
      `return state.places.Pool.tokens.reduce((sum, t) => sum + t.x, 0);`,
      pool,
      frame.placeIndexByName,
    );
    expect(
      fn(
        frame.views.f64,
        frame.views.u64,
        frame.views.u8,
        frame.placeCounts,
        frame.placeOffsets,
      ),
    ).toBe(1.5 + 2.5 + 3);
  });

  it("compiles reduce over a concat as sequential loops with a running index", () => {
    const pool = new StringPool();
    const frame = makeMetricFrame(pool);
    const fn = compileMetric(
      `const fleet = state.places.Pool.tokens.concat(state.places.Buffer.tokens);
if (fleet.length === 0) return -1;
const indexSum = fleet.reduce((acc, t, i) => acc + i, 0);
return fleet.reduce((sum, t) => sum + t.x, 0) / fleet.length + indexSum;`,
      pool,
      frame.placeIndexByName,
    );
    // x sum = 7 + 30 = 37 over 5 tokens; index sum = 0+1+2+3+4 = 10.
    expect(
      fn(
        frame.views.f64,
        frame.views.u64,
        frame.views.u8,
        frame.placeCounts,
        frame.placeOffsets,
      ),
    ).toBe(37 / 5 + 10);
  });

  it("supports early-return guards around reduces", () => {
    const pool = new StringPool();
    const frame = makeMetricFrame(pool);
    const fn = compileMetric(
      `const tokens = state.places.Buffer.tokens;
if (tokens.length === 0) return 0;
return tokens.reduce((sum, t) => sum + t.x, 0) / tokens.length;`,
      pool,
      frame.placeIndexByName,
    );
    expect(
      fn(
        frame.views.f64,
        frame.views.u64,
        frame.views.u8,
        frame.placeCounts,
        frame.placeOffsets,
      ),
    ).toBe(15);

    // Empty frame → the guard branch wins (loops run zero iterations).
    const emptyCounts = new Uint32Array([0, 0, 0]);
    expect(
      fn(
        frame.views.f64,
        frame.views.u64,
        frame.views.u8,
        emptyCounts,
        frame.placeOffsets,
      ),
    ).toBe(0);
  });

  it("compares string attributes through the pool inside reduce loops", () => {
    const pool = new StringPool();
    const frame = makeMetricFrame(pool);
    const fn = compileMetric(
      `return state.places.Pool.tokens.reduce(
  (count, t) => t.status === "shipped" ? count + 1 : count,
  0,
);`,
      pool,
      frame.placeIndexByName,
    );
    expect(
      fn(
        frame.views.f64,
        frame.views.u64,
        frame.views.u8,
        frame.placeCounts,
        frame.placeOffsets,
      ),
    ).toBe(2);
  });

  it("indexes place tokens with dynamic indices", () => {
    const pool = new StringPool();
    const frame = makeMetricFrame(pool);
    const fn = compileMetric(
      `return state.places.Pool.tokens[state.places.Bin.count - 4].x;`,
      pool,
      frame.placeIndexByName,
    );
    // Bin.count = 5 → index 1 → x = 2.5.
    expect(
      fn(
        frame.views.f64,
        frame.views.u64,
        frame.views.u8,
        frame.placeCounts,
        frame.placeOffsets,
      ),
    ).toBe(2.5);
  });

  it("rejects invalid metric token indices before reading adjacent bytes", () => {
    const pool = new StringPool();
    const frame = makeMetricFrame(pool);
    const outOfBounds = compileMetric(
      `return state.places.Pool.tokens[state.places.Pool.count].x;`,
      pool,
      frame.placeIndexByName,
    );
    const fractional = compileMetric(
      `return state.places.Pool.tokens[0.5].x;`,
      pool,
      frame.placeIndexByName,
    );

    const args = [
      frame.views.f64,
      frame.views.u64,
      frame.views.u8,
      frame.placeCounts,
      frame.placeOffsets,
    ] as const;
    expect(() => outOfBounds(...args)).toThrow(/out of bounds/i);
    expect(() => fractional(...args)).toThrow(/out of bounds/i);
  });

  it("runs dynamic-index guards only in the selected conditional branch", () => {
    const pool = new StringPool();
    const frame = makeMetricFrame(pool);
    const fn = compileMetric(
      `const tokens = state.places.Pool.tokens;
if (tokens.length === 0) return 0;
return tokens[0].x;`,
      pool,
      frame.placeIndexByName,
    );

    expect(
      fn(
        frame.views.f64,
        frame.views.u64,
        frame.views.u8,
        frame.placeCounts,
        frame.placeOffsets,
      ),
    ).toBe(1.5);

    const emptyCounts = new Uint32Array([0, 0, 0]);
    expect(
      fn(
        frame.views.f64,
        frame.views.u64,
        frame.views.u8,
        emptyCounts,
        frame.placeOffsets,
      ),
    ).toBe(0);
  });

  it("short-circuits dynamic-index guards in logical expressions", () => {
    const pool = new StringPool();
    const frame = makeMetricFrame(pool);
    const or = compileMetric(
      `const tokens = state.places.Pool.tokens;
return tokens.length === 0 || tokens[0].x > 0;`,
      pool,
      frame.placeIndexByName,
    );
    const and = compileMetric(
      `const tokens = state.places.Pool.tokens;
return tokens.length > 0 && tokens[0].x > 0;`,
      pool,
      frame.placeIndexByName,
    );
    const args = [
      frame.views.f64,
      frame.views.u64,
      frame.views.u8,
      new Uint32Array([0, 0, 0]),
      frame.placeOffsets,
    ] as const;

    expect(or(...args)).toBe(true);
    expect(and(...args)).toBe(false);
  });

  it("registers referenced places in first-reference order", () => {
    const program = emitBufferMetricJs(
      lower(
        `return state.places.Buffer.count + state.places.Pool.count + state.places.Buffer.count;`,
        "metric",
      ),
      metricContext,
    );
    expect(program?.placeNames).toEqual(["Buffer", "Pool"]);
  });

  it("bails to null on reduce over non-place arrays", () => {
    expect(
      emitBufferMetricJs(
        lower(
          `return [1, 2, 3].reduce((sum, value) => sum + value, 0);`,
          "metric",
        ),
        metricContext,
      ),
    ).toBeNull();
  });
});
