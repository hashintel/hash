/**
 * End-to-end check of the production sharded experiment runtime.
 *
 * Runs the same experiment at several shard counts through
 * `createMonteCarloExperiment` with real worker threads, and verifies that the
 * merged metric timeline is identical every time. This is the guarantee the
 * whole design rests on: shard count changes how fast an experiment finishes,
 * never what it reports.
 *
 * Requires a build (`yarn build`) because the worker is loaded from `dist`.
 */
import { execFileSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";

const { createMonteCarloExperiment } = await import("../dist/index.js");
const { compileHirArtifacts } = await import("../dist/hir.js");
const { sirModel } = await import("../dist/examples/index.js");

// `dist` wraps the worker in an inline Blob for the browser, which Node cannot
// import, so bundle the worker source for Node before spawning any threads.
execFileSync(
  "npx",
  [
    "esbuild",
    "src/simulation/monte-carlo/worker/monte-carlo.worker.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--outfile=benchmarks/.node-worker-bundle.mjs",
    "--log-level=warning",
  ],
  { cwd: new URL("..", import.meta.url), stdio: "inherit" },
);

const TOTAL_RUNS = 2000;
const DT = 0.1;
const MAX_TIME = 60;

const sdcpn = sirModel.petriNetDefinition;
const artifacts = compileHirArtifacts(sdcpn).artifacts;

const workerUrl = new URL("./sharded-experiment-worker.mjs", import.meta.url);

/**
 * Adapts a Node `Worker` to the `WorkerLike` shape the transport expects.
 *
 * In the browser this is just `new Worker(...)`; Node's event API differs
 * enough to need a thin shim.
 */
function createWorker() {
  const worker = new Worker(workerUrl);

  return {
    postMessage: (message) => worker.postMessage(message),
    addEventListener: (_type, listener) => {
      worker.on("message", (data) => listener({ data }));
    },
    terminate: () => void worker.terminate(),
  };
}

function runExperiment(shardCount) {
  return new Promise((resolve, reject) => {
    const start = performance.now();

    createMonteCarloExperiment({
      createWorker,
      shardCount,
      sdcpn,
      initialMarking: {
        place__susceptible: 500,
        place__infected: 5,
        place__recovered: 0,
      },
      parameterValues: {},
      seed: 42,
      dt: DT,
      maxTime: MAX_TIME,
      hirArtifacts: artifacts,
      runCount: TOTAL_RUNS,
      metricSpecs: [
        {
          kind: "placeTokenCountMean",
          id: "infected",
          label: "Infected",
          placeId: "place__infected",
          runOutput: { type: "distribution", binning: "exact" },
        },
        {
          kind: "placeTokenCountMean",
          id: "recovered-mean",
          label: "Recovered (mean)",
          placeId: "place__recovered",
        },
      ],
    }).then((experiment) => {
      experiment.events.subscribe((event) => {
        if (event.type === "complete") {
          const ms = performance.now() - start;
          const { frames } = experiment.metrics.get();
          experiment.dispose();
          resolve({ shardCount, ms, frames });
        } else if (event.type === "error") {
          experiment.dispose();
          reject(new Error(event.message));
        }
      });
      experiment.start();
    }, reject);
  });
}

/** Canonical form of the merged timeline, for exact comparison. */
function fingerprint(frames) {
  return frames
    .map((frame) =>
      frame.outputType === "distribution"
        ? `${frame.metricId}@${frame.frameNumber}:${frame.bins
            .map(([value, frequency]) => `${value}x${frequency}`)
            .join(",")}`
        : `${frame.metricId}@${frame.frameNumber}:${frame.frameValue}/${frame.runSampleCount}`,
    )
    .join("|");
}

process.stdout.write(
  `availableParallelism = ${availableParallelism()}\n` +
    `${TOTAL_RUNS} runs, dt ${DT}, maxTime ${MAX_TIME}, 1 distribution + 1 scalar metric\n\n`,
);

let baseline = null;

for (const shardCount of [1, 2, 4, 8]) {
  // eslint-disable-next-line no-await-in-loop -- sequential so each run gets all cores
  const result = await runExperiment(shardCount);
  baseline ??= result;

  const identical = fingerprint(result.frames) === fingerprint(baseline.frames);
  process.stdout.write(
    `${String(shardCount).padStart(2)} shard(s)  ${result.ms.toFixed(0).padStart(6)} ms` +
      `   speedup ${(baseline.ms / result.ms).toFixed(2).padStart(5)}x` +
      `   ${String(result.frames.length).padStart(5)} merged frames` +
      `   identical to 1 shard: ${identical ? "YES" : "NO"}\n`,
  );

  if (!identical) {
    process.exitCode = 1;
  }
}
