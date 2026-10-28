import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    engine: { type: "string" },
    mode: { type: "string" },
    fixture: { type: "string" },
    module: { type: "string" },
    wasm: { type: "string" },
    samples: { type: "string", default: "3" },
  },
});
assert(values.fixture && values.module && values.wasm);
assert(values.mode === "timing" || values.mode === "memory");
assert(values.engine === "cpu" || values.engine === "wasm");
assert(global.gc, "Run benchmark trials with --expose-gc");
const fixture =
  /** @type {ReturnType<typeof import("./fixtures.mjs").fixtures>[number]} */ (
    JSON.parse(await readFile(values.fixture, "utf8"))
  );
/** @type {import("../../src/simulation/monte-carlo/worker/messages").MonteCarloInitMessage} */
const config = fixture.config;
const samples = Number(values.samples);
assert(Number.isInteger(samples) && samples > 0);

const collect = async () => {
  await setImmediate();
  global.gc?.();
  await setImmediate();
  global.gc?.();
};
/** @type {{ create: typeof import("./wasm.mjs").create, initialize: (bytes: Uint8Array<ArrayBuffer>) => unknown, memoryBytes: () => number } | undefined} */
let runtime;
const snapshot = () => ({
  ...process.memoryUsage(),
  peakRss: process.resourceUsage().maxRSS * 1024,
  wasmBytes: runtime?.memoryBytes() ?? 0,
});
await collect();
const baseline = snapshot();
let start = performance.now();
runtime = /** @type {NonNullable<typeof runtime>} */ (
  await import(pathToFileURL(values.module).href)
);
const importMs = performance.now() - start;
assert(runtime);
start = performance.now();
await runtime.initialize(
  values.engine === "wasm"
    ? new Uint8Array(await readFile(values.wasm))
    : new Uint8Array(),
);
const runtimeInitMs = performance.now() - start;
if (values.mode === "memory") {
  await collect();
}
const loaded = snapshot();

/** @param {Awaited<ReturnType<typeof import("./wasm.mjs").create>>} run */
const digest = (run) => {
  const hash = createHash("sha256");
  let runFrames = 0;
  let tokenTotal = 0;
  for (let index = 0; index < config.runCount; index++) {
    const state = run.simulator.getRunSnapshot(index);
    assert.equal(state.status, "complete");
    assert.equal(state.error, null);
    runFrames += state.frameNumber;
    tokenTotal += Object.values(state.placeTokenCounts).reduce(
      (total, count) => total + count,
      0,
    );
    hash.update(JSON.stringify(state));
  }
  assert.equal(
    tokenTotal,
    config.runCount * (fixture.id.startsWith("ring") ? 1280 : 1000),
    "Token count must be conserved",
  );
  for (const metric of run.userMetrics) {
    assert.equal(
      metric.frames.length,
      fixture.frames + 1,
      "Metric must observe every frame",
    );
    hash.update(JSON.stringify(metric.frames));
  }
  return { hash: hash.digest("hex"), runFrames, tokenTotal };
};

/** @type {Awaited<ReturnType<typeof import("./wasm.mjs").create>> | undefined} */
let run;
const execute = () => {
  assert(run);
  let advanced = 0;
  for (let frame = 0; frame <= fixture.frames; frame++) {
    const result = run.simulator.advanceAll();
    advanced += result.advancedRuns;
    assert.equal(result.erroredRuns, 0);
    if (result.allFinished) {
      assert.equal(result.completedRuns, config.runCount);
      return advanced;
    }
  }
  throw new Error("Experiment exceeded its frame limit");
};

const timings = [];
let proof;
let memory;
const iterations = values.mode === "memory" ? 1 : samples + 2;
for (let iteration = 0; iteration < iterations; iteration++) {
  await collect();
  start = performance.now();
  run = await runtime.create(config);
  const createMs = performance.now() - start;
  if (values.mode === "memory") {
    await collect();
  }
  const initialized = values.mode === "memory" ? snapshot() : undefined;
  start = performance.now();
  const runFrames = execute();
  const executeMs = performance.now() - start;
  const peakRss = process.resourceUsage().maxRSS * 1024;
  if (values.mode === "memory") {
    await collect();
  }
  const complete = values.mode === "memory" ? snapshot() : undefined;
  const checked = digest(run);
  assert.equal(runFrames, checked.runFrames);
  if (proof) {
    assert.deepEqual(
      checked,
      proof,
      "Repeated experiments must produce identical results",
    );
  }
  proof = checked;
  start = performance.now();
  run.simulator.dispose?.();
  run = undefined;
  const disposeMs = performance.now() - start;
  timings.push({
    createMs,
    executeMs,
    disposeMs,
    totalMs: createMs + executeMs,
    runFrames,
  });
  if (values.mode === "memory") {
    await collect();
    memory = {
      baseline,
      loaded,
      initialized,
      complete,
      disposed: snapshot(),
      peakRss,
    };
  }
}
export const result = {
  engine: values.engine,
  mode: values.mode,
  case: fixture.id,
  runCount: config.runCount,
  frames: fixture.frames,
  metrics: config.metricSpecs?.length ?? 0,
  importMs,
  runtimeInitMs,
  cold: timings[0],
  warm: values.mode === "timing" ? timings.slice(2) : [],
  proof,
  memory,
};
process.stdout.write(`${JSON.stringify(result)}\n`);
