import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { rolldown } from "rolldown";

import { fixtures } from "./benchmark-simulation/fixtures.mjs";

const { values } = parseArgs({
  options: {
    repeats: { type: "string", default: "3" },
    samples: { type: "string", default: "3" },
    frames: { type: "string", default: "100" },
    scale: { type: "string", default: "1" },
    cases: { type: "string" },
    output: { type: "string" },
  },
});
const repeats = Number(values.repeats);
const samples = Number(values.samples);
const frames = Number(values.frames);
const scale = Number(values.scale);
assert(
  [repeats, samples, frames].every(
    (value) => Number.isInteger(value) && value > 0,
  ),
);
assert(Number.isFinite(scale) && scale > 0);
assert(values.output, "Specify --output for results and partial progress");
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const scripts = fileURLToPath(
  new URL("./benchmark-simulation/", import.meta.url),
);
const outputDirectory = join(
  root,
  "node_modules/.cache/petrinaut-simulation-benchmark",
);
const wasmFile = fileURLToPath(
  new URL("../rust/pkg/petrinaut_core_bg.wasm", import.meta.url),
);
await mkdir(outputDirectory, { recursive: true });
const bundle = await rolldown({
  input: { cpu: join(scripts, "cpu.mjs"), wasm: join(scripts, "wasm.mjs") },
  platform: "node",
});
await bundle.write({
  dir: outputDirectory,
  format: "esm",
  entryFileNames: "[name].mjs",
  chunkFileNames: "[name]-[hash].mjs",
  minify: true,
});
await bundle.close();

const allFixtures = fixtures(scale, frames);
const requested =
  values.cases?.split(",") ?? allFixtures.map((fixture) => fixture.id);
assert(
  requested.every((id) => allFixtures.some((fixture) => fixture.id === id)),
  "Unknown benchmark case",
);
const cases = allFixtures.filter((fixture) => requested.includes(fixture.id));
for (const fixture of cases) {
  await writeFile(
    join(outputDirectory, `${fixture.id}.json`),
    JSON.stringify(fixture),
  );
}
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
const wasm = await readFile(wasmFile);
const metadata = {
  startedAt: new Date().toISOString(),
  revision,
  dirty,
  node: process.version,
  v8: process.versions.v8,
  platform: platform(),
  release: release(),
  arch: process.arch,
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  systemMemoryBytes: totalmem(),
  wasmBytes: wasm.byteLength,
  wasmSha256: createHash("sha256").update(wasm).digest("hex"),
  repeats,
  samples,
  frames,
  scale,
  cases: cases.map((fixture) => ({
    id: fixture.id,
    runs: fixture.config.runCount,
    places: fixture.config.sdcpn.places.length,
    transitions: fixture.config.sdcpn.transitions.length,
    metrics: fixture.config.metricSpecs?.length ?? 0,
    frontendMs: fixture.frontendMs,
    fixtureSha256: createHash("sha256")
      .update(JSON.stringify(fixture.config))
      .digest("hex"),
  })),
};
const partial = `${values.output}.partial.jsonl`;
await writeFile(partial, `${JSON.stringify(metadata)}\n`);
/** @type {(typeof import("./benchmark-simulation/trial.mjs").result & { repeat: number })[]} */
const results = [];
for (const mode of ["timing", "memory"]) {
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const fixture of repeat % 2 === 0 ? cases : [...cases].reverse()) {
      for (const engine of repeat % 2 === 0
        ? ["cpu", "wasm"]
        : ["wasm", "cpu"]) {
        process.stderr.write(
          `${mode}: ${fixture.id}, ${engine}, trial ${repeat + 1}/${repeats}\n`,
        );
        const output = execFileSync(
          process.execPath,
          [
            "--expose-gc",
            join(scripts, "trial.mjs"),
            `--engine=${engine}`,
            `--mode=${mode}`,
            `--fixture=${join(outputDirectory, `${fixture.id}.json`)}`,
            `--module=${join(outputDirectory, `${engine}.mjs`)}`,
            `--wasm=${wasmFile}`,
            `--samples=${samples}`,
          ],
          {
            encoding: "utf8",
            timeout: 300_000,
            maxBuffer: 8 * 1024 * 1024,
            stdio: ["ignore", "pipe", "inherit"],
          },
        );
        const parsed =
          /** @type {typeof import("./benchmark-simulation/trial.mjs").result} */ (
            JSON.parse(output)
          );
        const result = { repeat, ...parsed };
        const previous = results.find((entry) => entry.case === fixture.id);
        if (previous) {
          assert.deepEqual(
            result.proof,
            previous.proof,
            "CPU and Wasm must match counts, RNG, termination and metric frames",
          );
        }
        results.push(result);
        await appendFile(partial, `${JSON.stringify(result)}\n`);
      }
    }
  }
}

/** @param {number[]} numbers */
const summary = (numbers) => {
  const sorted = [...numbers].sort((left, right) => left - right);
  assert(sorted.length > 0);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted.at(-1),
    samples: sorted.length,
  };
};
const summaries = cases.flatMap((fixture) =>
  ["cpu", "wasm"].map((engine) => {
    const timing = results.filter(
      (entry) =>
        entry.case === fixture.id &&
        entry.engine === engine &&
        entry.mode === "timing",
    );
    const memory = results.filter(
      (entry) =>
        entry.case === fixture.id &&
        entry.engine === engine &&
        entry.mode === "memory",
    );
    const warm = timing.flatMap((entry) => entry.warm);
    return {
      case: fixture.id,
      engine,
      coldStartupMs: summary(
        timing.map(
          (entry) => entry.importMs + entry.runtimeInitMs + entry.cold.createMs,
        ),
      ),
      coldTotalMs: summary(
        timing.map(
          (entry) => entry.importMs + entry.runtimeInitMs + entry.cold.totalMs,
        ),
      ),
      warmCreateMs: summary(warm.map((entry) => entry.createMs)),
      warmExecuteMs: summary(warm.map((entry) => entry.executeMs)),
      warmTotalMs: summary(warm.map((entry) => entry.totalMs)),
      runFramesPerSecond: summary(
        warm.map((entry) => entry.runFrames / (entry.executeMs / 1000)),
      ),
      peakRssBytes: summary(memory.map((entry) => entry.memory.peakRss)),
      memory: Object.fromEntries(
        ["baseline", "loaded", "initialized", "complete", "disposed"].map(
          (phase) => [
            phase,
            Object.fromEntries(
              ["rss", "heapUsed", "external", "arrayBuffers", "wasmBytes"].map(
                (field) => [
                  field,
                  summary(memory.map((entry) => entry.memory[phase][field])),
                ],
              ),
            ),
          ],
        ),
      ),
    };
  }),
);
await writeFile(
  values.output,
  `${JSON.stringify(
    {
      ...metadata,
      completedAt: new Date().toISOString(),
      method: {
        runtime:
          "Minified Rolldown bundles of the same CPU and Wasm simulator sources used by experiment workers; release Rust Wasm.",
        scope:
          "One Node process and one simulation thread per trial. Includes scalar metric collection. Excludes frontend compilation, worker messaging, UI rendering and multi-worker scaling.",
        timing:
          "First experiment is cold. A second experiment warms the runtime; following samples include create + execution. Forced GC is outside timed sections. Engines and case order alternate across fresh-process repeats.",
        memory:
          "Separate fresh processes, one experiment each. Checkpoints follow forced GC. Peak RSS is the process high-water mark through execution, before result hashing. RSS includes Node, code, model and Wasm. external includes arrayBuffers; Wasm linear-memory size is capacity, not an additional RSS total.",
        correctness:
          "All trials compare SHA-256 of every final run snapshot and every metric frame, and assert token conservation and zero errors.",
      },
      summaries,
      results,
    },
    null,
    2,
  )}\n`,
);
await rm(partial);
process.stderr.write(`Wrote ${values.output}\n`);
