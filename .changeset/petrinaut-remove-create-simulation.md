---
"@hashintel/petrinaut": patch
---

pr: 10555

No longer re-exports `createSimulation` and its types from `@hashintel/petrinaut-core`. To run a net outside the editor, import a simulator from `@hashintel/petrinaut-core`: `createJsFixedStepSimulator` or `createJsAdaptiveSimulator` for one run, `createMonteCarloExperiment` for many.
