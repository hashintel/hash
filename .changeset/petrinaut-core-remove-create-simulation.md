---
"@hashintel/petrinaut-core": patch
---

pr: 10555

Removes `createSimulation`, its `./workers/simulation` entry, its types and `getPlayModeBackpressure`: run a net with `createJsFixedStepSimulator`, `createJsAdaptiveSimulator` or `createMonteCarloExperiment`.
