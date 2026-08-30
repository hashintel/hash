/**
 * Prototype: shard one experiment's runs across N worker threads and verify
 *   (a) wall-clock scaling, and
 *   (b) that merged per-frame histograms are IDENTICAL regardless of shard
 *       count — i.e. sharding is result-preserving.
 *
 * Uses the shipped MonteCarloSimulator unchanged. The only new machinery is
 * global-index seed derivation plus a monoid merge of per-frame metric state.
 */
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";

const WORKER = new URL("./shard-worker.mjs", import.meta.url);

const TOTAL_RUNS = 4000;
const DT = 0.1;
const MAX_TIME = 60;
const BASE_SEED = 42;

function runShard(runOffset, runCount) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER, {
      workerData: {
        runOffset,
        runCount,
        baseSeed: BASE_SEED,
        dt: DT,
        maxTime: MAX_TIME,
      },
    });
    worker.once("message", (message) => {
      resolve(message);
      void worker.terminate();
    });
    worker.once("error", reject);
  });
}

/** The histogram monoid: merge bin lists by summing frequencies. */
function mergeShards(results) {
  const byFrame = [];
  for (const result of results) {
    for (const { frameNumber, bins } of result.partialFrames) {
      byFrame[frameNumber] ??= new Map();
      const target = byFrame[frameNumber];
      for (const [value, frequency] of bins) {
        target.set(value, (target.get(value) ?? 0) + frequency);
      }
    }
  }
  return byFrame;
}

/** Canonical string for comparing merged results across shard counts. */
function fingerprint(frames) {
  return frames
    .map((bins, index) =>
      bins === undefined
        ? `${index}:-`
        : `${index}:${[...bins.entries()]
            .sort(([a], [b]) => a - b)
            .map(([value, frequency]) => `${value}x${frequency}`)
            .join(",")}`,
    )
    .join("|");
}

async function measure(shardCount) {
  const base = Math.floor(TOTAL_RUNS / shardCount);
  const remainder = TOTAL_RUNS % shardCount;

  const shards = [];
  let offset = 0;
  for (let shard = 0; shard < shardCount; shard++) {
    const count = base + (shard < remainder ? 1 : 0);
    shards.push({ offset, count });
    offset += count;
  }

  const start = performance.now();
  const results = await Promise.all(
    shards.map((shard) => runShard(shard.offset, shard.count)),
  );
  const ms = performance.now() - start;

  return {
    shardCount,
    ms,
    runFrames: results.reduce((sum, result) => sum + result.runFrames, 0),
    fingerprint: fingerprint(mergeShards(results)),
  };
}

const cores = availableParallelism();
process.stdout.write(
  `availableParallelism = ${cores}\n` +
    `${TOTAL_RUNS} runs, dt ${DT}, maxTime ${MAX_TIME}, 1 distribution metric\n` +
    `wall-clock includes worker spawn + per-shard HIR compile + per-run buildSimulation\n\n`,
);

let baselineMs = null;
let baselineFingerprint = null;

for (const shardCount of [1, 2, 4, 8, 12]) {
  // eslint-disable-next-line no-await-in-loop -- sequential so each config gets all cores
  const result = await measure(shardCount);
  baselineMs ??= result.ms;
  baselineFingerprint ??= result.fingerprint;

  process.stdout.write(
    `${String(result.shardCount).padStart(2)} shard(s)  ${result.ms
      .toFixed(0)
      .padStart(6)} ms` +
      `   speedup ${(baselineMs / result.ms).toFixed(2).padStart(5)}x` +
      `   ${result.runFrames} run-frames` +
      `   identical to 1 shard: ${
        result.fingerprint === baselineFingerprint ? "YES" : "NO"
      }\n`,
  );
}
