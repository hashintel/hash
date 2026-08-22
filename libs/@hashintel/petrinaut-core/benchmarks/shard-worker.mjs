/**
 * Shard worker: owns a contiguous slice of an experiment's runs and advances
 * them with the *unmodified* MonteCarloSimulator, then ships back partial
 * per-frame metric state for the main thread to merge.
 */
import { parentPort, workerData } from "node:worker_threads";

import { sirModel } from "../dist/examples/index.js";
import { compileHirArtifacts } from "../dist/hir.js";
import {
  createMonteCarloSimulator,
  createMonteCarloUserDefinedMetric,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
} from "../dist/index.js";

const { runOffset, runCount, baseSeed, dt, maxTime } = workerData;

const sdcpn = sirModel.petriNetDefinition;
const artifacts = compileHirArtifacts(sdcpn).artifacts;

const metrics = createMonteCarloUserDefinedMetricConfigsFromSpecs(
  [
    {
      kind: "placeTokenCountMean",
      id: "infected",
      label: "Infected",
      placeId: "place__infected",
      runOutput: { type: "distribution", binning: "exact" },
    },
  ],
  sdcpn,
  {},
).map((config) => createMonteCarloUserDefinedMetric(config));

/**
 * Seeds are derived from the GLOBAL run index, not the shard-local one, so
 * sharding changes only *who* runs a seed — never *which* seeds run. This is
 * what makes shard count invisible in the results.
 *
 * Mirrors `deriveRunSeed` in monte-carlo/run-state.ts.
 */
function deriveRunSeed(seed, globalRunIndex) {
  return (
    Math.abs(Math.trunc(seed + (globalRunIndex + 1) * 2_654_435_761)) %
    2_147_483_648
  );
}

const simulator = createMonteCarloSimulator({
  sdcpn,
  initialMarking: {
    place__susceptible: 500,
    place__infected: 5,
    place__recovered: 0,
  },
  parameterValues: {},
  seed: baseSeed,
  dt,
  maxTime,
  runCount,
  hirArtifacts: artifacts,
  metrics,
  runs: Array.from({ length: runCount }, (_, localIndex) => ({
    seed: deriveRunSeed(baseSeed, runOffset + localIndex),
  })),
});

simulator.runUntilComplete();

let runFrames = 0;
for (const summary of simulator.getSummaries()) {
  runFrames += summary.frameNumber;
}

parentPort.postMessage({
  runFrames,
  partialFrames: metrics[0].frames.map((frame) => ({
    frameNumber: frame.frameNumber,
    bins: frame.bins ?? [],
  })),
});
