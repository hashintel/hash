/**
 * Baseline throughput of the current Monte Carlo engine, and the cost that
 * metric aggregation adds on top of it.
 *
 * Reports nanoseconds per *run-frame* (one run advanced by one frame), which is
 * the unit that stays comparable as run counts and early-completion rates
 * change.
 */
import { performance } from "node:perf_hooks";

const {
  createMonteCarloSimulator,
  createMonteCarloUserDefinedMetric,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
} = await import("../dist/index.js");
const { compileHirArtifacts } = await import("../dist/hir.js");
const { sirModel } = await import("../dist/examples/index.js");

const RUNS = 4000;
const DT = 0.1;
const MAX_TIME = 60;

const sdcpn = sirModel.petriNetDefinition;
const artifacts = compileHirArtifacts(sdcpn).artifacts;

const initialMarking = {
  place__susceptible: 500,
  place__infected: 5,
  place__recovered: 0,
};

function build(metricSpecs) {
  const metrics = createMonteCarloUserDefinedMetricConfigsFromSpecs(
    metricSpecs,
    sdcpn,
    {},
  ).map((config) => createMonteCarloUserDefinedMetric(config));

  return createMonteCarloSimulator({
    sdcpn,
    initialMarking,
    parameterValues: {},
    seed: 42,
    dt: DT,
    maxTime: MAX_TIME,
    runCount: RUNS,
    hirArtifacts: artifacts,
    metrics,
  });
}

function measure(label, metricSpecs) {
  // Construction is timed separately: buildSimulation() runs once per run, so
  // it is a per-run cost rather than a per-frame one.
  const constructStart = performance.now();
  const simulator = build(metricSpecs);
  const constructMs = performance.now() - constructStart;

  const runStart = performance.now();
  simulator.runUntilComplete();
  const runMs = performance.now() - runStart;

  let runFrames = 0;
  for (const summary of simulator.getSummaries()) {
    runFrames += summary.frameNumber;
  }

  process.stdout.write(
    `${label.padEnd(30)} construct ${constructMs.toFixed(0).padStart(5)} ms ` +
      `(${((constructMs / RUNS) * 1000).toFixed(0).padStart(4)} µs/run)   ` +
      `simulate ${runMs.toFixed(0).padStart(6)} ms   ` +
      `${((runMs / runFrames) * 1e6).toFixed(0).padStart(5)} ns/run-frame\n`,
  );

  return runMs;
}

const distribution = (id, label, placeId) => ({
  kind: "placeTokenCountMean",
  id,
  label,
  placeId,
  runOutput: { type: "distribution", binning: "exact" },
});

process.stdout.write(
  `SIR model, ${RUNS} runs, dt ${DT}, maxTime ${MAX_TIME}\n\n`,
);

const bare = measure("engine only (no metrics)", []);
measure("+ 1 scalar metric", [
  {
    kind: "placeTokenCountMean",
    id: "m1",
    label: "Infected",
    placeId: "place__infected",
  },
]);
const hist = measure("+ 1 distribution metric", [
  distribution("m2", "Infected", "place__infected"),
]);
const three = measure("+ 3 metrics (2 distributions)", [
  distribution("a", "S", "place__susceptible"),
  distribution("b", "I", "place__infected"),
  {
    kind: "placeTokenCountMean",
    id: "c",
    label: "R",
    placeId: "place__recovered",
  },
]);

process.stdout.write(
  `\nmetric overhead vs engine only: ` +
    `1 distribution ${(((hist - bare) / bare) * 100).toFixed(0)}%, ` +
    `3 metrics ${(((three - bare) / bare) * 100).toFixed(0)}%\n`,
);
