---
"@hashintel/petrinaut-core": patch
---

pr: 10555

Removes `createSimulation`, the `./workers/simulation` entry, `getPlayModeBackpressure` with its type `PlayModeBackpressure`, and the types only `createSimulation` used. To compute one run, build a simulator with `createJsFixedStepSimulator` or `createJsAdaptiveSimulator`, with `createEventSimulationWorker` of `./workers/event-simulation` as its `createRunWorker`, pass it to `assessSimulator` and call `startRun` of the offer. These single-run exports are experimental. To compute many runs, use `createMonteCarloExperiment`.
