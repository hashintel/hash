---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Experiments split their runs across Web Workers, one per logical core minus one, with identical results at any worker count. `experimentShardCount` on `ExperimentsProvider` and `shardCount` on `createMonteCarloExperiment` cap the parallelism.
