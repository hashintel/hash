# Monte Carlo Usage

Use the direct simulator for synchronous batch work and tests. Use the
experiment API for UI/runtime work that should run through a worker transport.

## Direct Simulator

```ts
import {
  createMonteCarloUserDefinedMetric,
  createMonteCarloSimulator,
} from "@hashintel/petrinaut-core";

const sourceTokens = createMonteCarloUserDefinedMetric({
  id: "source-tokens",
  label: "Source tokens",
  sampleRuns: "all",
  aggregateRuns: "mean",
  aggregateTime: "none",
  measure: ({ frame }) => frame.getPlaceTokenCount("source"),
});

const simulator = createMonteCarloSimulator({
  sdcpn,
  runCount: 100,
  initialMarking,
  parameterValues,
  seed: 1,
  dt: 1,
  maxTime: 100,
  metrics: [sourceTokens],
});

const result = simulator.runUntilComplete();

const summaries = simulator.getSummaries();
const firstRun = simulator.getRunSnapshot(0);
const latestMetric = sourceTokens.getLatestFrame();
```

For incremental progress, call `advanceAll()` yourself:

```ts
let result = simulator.advanceAll();

while (!result.allFinished) {
  result = simulator.advanceAll();
}
```

## Per-Run Overrides

`runs` can override the global seed, initial marking, or parameter values for a
specific run. Missing entries inherit the simulator-level config.

```ts
const simulator = createMonteCarloSimulator({
  sdcpn,
  runCount: 2,
  initialMarking: { source: 1 },
  parameterValues: { rate: "0.1" },
  seed: 10,
  dt: 1,
  maxTime: 20,
  runs: [
    { seed: 101, initialMarking: { source: 1 } },
    {
      seed: 202,
      initialMarking: { source: 2 },
      parameterValues: { rate: "0.2" },
    },
  ],
});
```

## Worker Experiment

```ts
import { createMonteCarloExperiment } from "@hashintel/petrinaut-core";
import { createMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";

const experiment = await createMonteCarloExperiment({
  sdcpn,
  initialMarking,
  parameterValues,
  seed: 1,
  dt: 1,
  maxTime: 100,
  runCount: 100,
  batchSize: 4,
  createWorker: createMonteCarloWorker,
  metricSpecs: [
    {
      id: "source-tokens",
      label: "Source tokens",
      kind: "placeTokenCountMean",
      placeId: "source",
      sampleRuns: "all",
      runOutput: { type: "scalar", aggregateRuns: "mean" },
      aggregateTime: "none",
    },
  ],
});

const unsubscribeProgress = experiment.progress.subscribe((progress) => {
  console.log(progress);
});

const unsubscribeMetrics = experiment.metrics.subscribe((metrics) => {
  console.log(metrics.latestByMetricId["source-tokens"]);
});

experiment.events.subscribe((event) => {
  if (event.type === "complete") {
    console.log(event.progress);
  }
});

experiment.start();

// Later:
unsubscribeProgress();
unsubscribeMetrics();
experiment.dispose();
```

`cancel()` asks the worker to stop and emits a cancelled event. `dispose()` tears
down the transport and should be called when the handle is no longer needed.

## Metrics

Metrics implement `MonteCarloFrameMetric` and receive one frame context at frame
zero, then after every batch where at least one run advanced.

Use `createMonteCarloUserDefinedMetric()` for callback-based metrics in direct
simulator/local experiment code. Use `metricSpecs` for serializable experiment
metrics that can run inside the Monte Carlo worker.

## Config Notes

- `runCount` must be a positive integer.
- `dt` must be positive.
- `maxTime` must be finite and non-negative.
- Global `seed` values deterministically derive per-run seeds unless a run
  supplies its own seed.
- `initialTokenValueCapacity` is optional. Frames grow per run when additions
  require more token value storage.
- Runs finish with `maxTime`, `deadlock`, or `error` status information in their
  summaries.
