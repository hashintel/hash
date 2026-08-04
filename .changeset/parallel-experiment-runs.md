---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Run an experiment's runs in parallel across several Web Workers.

An experiment used to run every one of its runs in a single worker, using one core however many the machine had. Runs are independent, so they now split across one worker per logical core (minus one, so the editor stays responsive), capped at the run count — measured at ~4x on 8 shards on a 10-core machine.

Sharding cannot change what an experiment reports. Per-run seeds derive from the run's **global** index rather than its position within a shard, so run *i* gets the same seed whichever worker owns it, and each worker's per-frame statistics recombine through the metric accumulator monoids (`empty`/`merge`) — output is byte-identical at every shard count. A frame is only finalised once every still-running shard has reported it, with finished shards dropped from that watermark rather than blocking it.

Scalar metric frames now carry their pre-reduction accumulator state, because `frameValue` is already reduced and a mean of means is not a mean.

Hosts can cap or pin parallelism with `experimentShardCount` on `ExperimentsProvider`, or `shardCount` on `createMonteCarloExperiment`.
