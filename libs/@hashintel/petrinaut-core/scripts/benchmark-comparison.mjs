import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** @typedef {Awaited<ReturnType<typeof import("./benchmark-rust.mjs").runBenchmark>>} BenchmarkRun */
const { values } = parseArgs({
  options: {
    nodes: { type: "string", default: "50,500,1000" },
    repeats: { type: "string", default: "3" },
    output: { type: "string" },
  },
});
const sizes = values.nodes.split(",").map(Number);
const repeats = Number(values.repeats);
assert(
  Number.isInteger(repeats) && repeats > 0,
  "Repeats must be a positive integer",
);
assert(
  sizes.length > 0 &&
    sizes.every(
      (nodes) => Number.isInteger(nodes) && nodes > 0 && nodes % 5 === 0,
    ),
  "Node counts must be positive multiples of five",
);
const worker = fileURLToPath(new URL("./benchmark-rust.mjs", import.meta.url));
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const revision = execFileSync(
  "git",
  ["-c", "core.fsmonitor=false", "rev-parse", "HEAD"],
  { cwd: root, encoding: "utf8" },
).trim();
const dirty =
  execFileSync("git", ["-c", "core.fsmonitor=false", "status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim().length > 0;
const wasm = await readFile(
  new URL("../rust/pkg/petrinaut_core_bg.wasm", import.meta.url),
);
/** @param {number[]} samples @param {number} fraction */
const quantile = (samples, fraction) => {
  const sorted = [...samples].sort((left, right) => left - right);
  const value = sorted.at(Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  assert(value !== undefined, "Cannot summarize empty samples");
  return value;
};
/** @param {number[][]} trials */
const summarize = (trials) => {
  const samples = trials.flat();
  const medians = trials.map((trial) => quantile(trial, 0.5));
  return {
    median: quantile(samples, 0.5),
    p95: quantile(samples, 0.95),
    minTrialMedian: Math.min(...medians),
    maxTrialMedian: Math.max(...medians),
    samples: samples.length,
  };
};
const startedAt = new Date().toISOString();
const partialOutput = values.output
  ? `${values.output}.partial.jsonl`
  : undefined;
if (partialOutput) {
  await writeFile(
    partialOutput,
    `${JSON.stringify({ startedAt, revision, dirty, node: process.version, sizes, repeats })}\n`,
  );
}
/** @type {BenchmarkRun[]} */
const runs = [];
for (const mode of ["timing", "memory"]) {
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const nodes of sizes) {
      for (const engine of repeat % 2 === 0
        ? ["typescript", "rust"]
        : ["rust", "typescript"]) {
        process.stderr.write(
          `${mode}: ${engine}, ${nodes} nodes, trial ${repeat + 1}/${repeats}\n`,
        );
        const output = execFileSync(
          process.execPath,
          [
            "--expose-gc",
            worker,
            `--engine=${engine}`,
            `--nodes=${nodes}`,
            `--mode=${mode}`,
          ],
          {
            encoding: "utf8",
            timeout: 300_000,
            maxBuffer: 4 * 1024 * 1024,
            stdio: ["ignore", "pipe", "inherit"],
          },
        );
        const run = /** @type {BenchmarkRun} */ (JSON.parse(output));
        runs.push(run);
        if (partialOutput) {
          await appendFile(partialOutput, `${JSON.stringify(run)}\n`);
        }
      }
    }
  }
}
const summaries = [];
for (const nodes of sizes) {
  const timings = runs.filter(
    (run) => run.nodes === nodes && run.mode === "timing",
  );
  assert.equal(timings.length, repeats * 2);
  for (const run of timings) {
    assert.deepEqual(
      run.digests,
      timings[0]?.digests,
      `Document states differ at ${nodes} nodes`,
    );
  }
  for (const engine of ["typescript", "rust"]) {
    const trials = timings.filter((run) => run.engine === engine);
    const timing = Object.fromEntries(
      [
        "initializeMs",
        "loadMs",
        "moveMs",
        "undoMs",
        "redoMs",
        "batchMs",
        "deleteMs",
      ].map((name) => [
        name,
        summarize(
          trials.map((trial) => {
            const sample = /** @type {Record<string, unknown>} */ (trial)[name];
            assert(typeof sample === "number" || Array.isArray(sample));
            return typeof sample === "number"
              ? [sample]
              : /** @type {number[]} */ (sample);
          }),
        ),
      ]),
    );
    const memoryTrials = runs.filter(
      (run) =>
        run.nodes === nodes && run.engine === engine && run.mode === "memory",
    );
    const memory = memoryTrials.map((trial) => {
      assert(trial.cycles);
      const first = trial.cycles.at(0);
      const last = trial.cycles.at(-1);
      assert(first && last);
      return {
        beforeEngine: trial.beforeEngine,
        ready: trial.ready,
        ...first,
        disposedAfterThreeCycles: last.disposed,
        retainedHeapGrowthBytes:
          last.disposed.heapUsedBytes - first.disposed.heapUsedBytes,
        retainedRssGrowthBytes:
          last.disposed.rssBytes - first.disposed.rssBytes,
      };
    });
    summaries.push({
      engine,
      nodes,
      documentBytes: trials[0]?.documentBytes,
      batchSize: trials[0]?.batchSize,
      timing,
      memory,
    });
  }
}
const result = {
  metadata: {
    startedAt,
    finishedAt: new Date().toISOString(),
    revision,
    dirty,
    node: process.version,
    platform: platform(),
    osRelease: release(),
    arch: process.arch,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    systemMemoryBytes: totalmem(),
    wasmBytes: wasm.byteLength,
    wasmSha256: createHash("sha256").update(wasm).digest("hex"),
    repeats,
    sizes,
    historyLimit: 50,
    memoryCycles: 3,
    timingSamplesPerTrial: {
      move: 30,
      undo: 30,
      redo: 30,
      batch: 10,
      delete: 10,
    },
    warmup:
      "10 move/undo pairs, one batch/undo pair, one delete/undo pair; history then cleared",
    subscribers:
      "One definition listener and one patch listener; both count notifications",
    memoryMethod:
      "Separate processes; two forced JS GCs at each checkpoint. RSS includes runtime, fixture and Wasm. Peak RSS is process lifetime maxRSS. external includes arrayBuffers; do not add them.",
  },
  summaries,
  runs,
};
const json = `${JSON.stringify(result, null, 2)}\n`;
if (values.output) {
  await writeFile(values.output, json);
  if (partialOutput) {
    await rm(partialOutput);
  }
  process.stderr.write(`Wrote ${values.output}\n`);
} else {
  process.stdout.write(json);
}
