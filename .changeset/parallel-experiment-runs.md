---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Run an experiment's runs in parallel across several Web Workers.

An experiment used to run every one of its runs in a single worker, using one core however many the machine had. Runs are independent, so they now split across one worker per logical core (minus one, so the editor stays responsive), capped at the run count. Measured at ~4x on 8 shards on a 10-core machine.

Sharding cannot change what an experiment reports. Per-run seeds derive from the run's **global** index rather than its position within a shard, so run _i_ gets the same seed whichever worker owns it, and each worker's per-frame statistics recombine through the metric accumulator monoids (`empty`/`merge`). Output is byte-identical at every shard count while every shard still has an active run. A frame is only finalised once every still-running shard has reported it, with finished shards dropped from that watermark rather than blocking it — so once a whole shard's runs have ended early (for example by deadlock), that shard's completed runs stop contributing samples to later frames, where a single simulator would keep sampling their frozen state.

Scalar metric frames now carry their pre-reduction accumulator state, because `frameValue` is already reduced and a mean of means is not a mean.

Hosts can cap or pin parallelism with `experimentShardCount` on `ExperimentsProvider`, or `shardCount` on `createMonteCarloExperiment`.
