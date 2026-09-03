---
layer: core.simulation.monte-carlo.metrics
role: Aggregates per-run samples into per-frame metric states that merge across shards
---

# Monte Carlo metrics

Metrics turn raw run state into the aggregates an experiment reports: numeric
summaries and histograms per frame, computed inside each worker so frame
buffers never leave it.

Every accumulator is a `MonteCarloMetricMonoid`: `empty` produces the identity
state, `add` folds one sample into a state, and `merge` combines two states.
`merge` is associative, and commutative for every accumulator except `last`,
which takes its right operand. Worker sharding depends on associativity and on
`createMonteCarloMetricShardMerger` (`merge.ts`) folding shards in index order,
so shard completion order does not change the merged result.

Two shapes cross the thread boundary:

- **Distribution metrics** aggregate per run over time inside the shard, so a
  shard-local state is already correct and merges directly.
- **Scalar frames carry `runAggregate`**, the pre-reduction accumulator state,
  because a reduced `frameValue` cannot be merged — a mean of means is not a
  mean. Time aggregation is recomputed on the main thread from merged frame
  values.

`specs.ts` builds metric configurations from the specs an experiment declares,
and `user-defined.ts` assembles the accumulators for user-defined metrics over
their compiled evaluators.

Known cost: the histogram accumulator's `add` copies its state per sample
(`new Map(state)`), and the copy grows with run count. The measured impact and
the intended fix are recorded in
[Simulation performance](../../../../../../@local/petrinaut-arch-docs/content/simulation/performance.mdx).
