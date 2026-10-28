import { beforeAll, expect, test } from "vitest";

import {
  simulation_buffer,
  simulation_create,
  simulation_free,
} from "../../rust/pkg/petrinaut_core.js";
import { readRustWasm } from "../../scripts/read-rust-wasm.mjs";
import { lowerTypeScriptToHir } from "../hir/lower-typescript";
import { initializeRust } from "../rust/initialize";
import { emitWasmModule } from "./emit-module";
import { getWasmHost } from "./host";

import type { HirFunction, HirSurfaceKind } from "../hir/hir";

const lower = (code: string, surface: HirSurfaceKind): HirFunction => {
  const result = lowerTypeScriptToHir(code, surface);
  if (!result.ok) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return result.fn;
};

beforeAll(async () => {
  await initializeRust(await readRustWasm());
});

test("generated Wasm calls Rust directly and reads the same numeric buffer", async () => {
  const runtime = await initializeRust();
  const bytes = emitWasmModule({
    parameters: [{ variableName: "rate", type: "real" }],
    places: [{ name: "Queue" }, { name: "Done" }],
    lambdas: [
      {
        hir: lower(
          "const r = parameters.rate; return r > 0 ? r * 2 : 0;",
          "lambda",
        ),
        predicate: false,
      },
    ],
    metrics: [
      lower("return state.places.Done.count + parameters.rate;", "metric"),
    ],
  });
  const host = getWasmHost()!;
  const module = await host.compile(bytes);
  const instance = await host.instantiate(module, { runtime });
  const id = simulation_create(
    JSON.stringify({
      parameters: [1000],
      counts: [4, 0],
      capacities: [null, null],
      transitions: [
        {
          inputs: [{ place: 0, weight: 1, kind: "standard" }],
          outputs: [{ place: 1, weight: 1 }],
        },
      ],
      dt: 1,
      maxFrames: 2,
      seed: 42,
    }),
  );
  try {
    const buffer = simulation_buffer(id);
    const advance = instance.exports.advance as (
      handle: number,
      pointer: number,
    ) => number;
    const metric = instance.exports.metric0 as (pointer: number) => number;
    expect(advance(id, buffer)).toBe(1);
    expect(advance(id, buffer)).toBe(1);
    expect(advance(id, buffer)).toBe(0);
    expect(metric(buffer)).toBe(1002);
    expect(
      Array.from(new Float64Array(runtime.memory.buffer, buffer, 6)),
    ).toEqual([1000, 2, 2, 1, 2, 0]);
  } finally {
    simulation_free(id);
  }
});

test("unsupported random calls fail compilation rather than executing JavaScript", () => {
  expect(() =>
    emitWasmModule({
      parameters: [],
      places: [],
      lambdas: [],
      metrics: [lower("return Math.random();", "metric")],
    }),
  ).toThrow("mathCall (random)");
});
