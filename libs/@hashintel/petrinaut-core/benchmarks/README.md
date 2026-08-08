# Simulation benchmarks

Measurement harnesses backing
[`../docs/simulation-performance.md`](../docs/simulation-performance.md). These
are investigation tools, not tests — nothing here asserts, and none of it runs
in CI.

They run against the **built** package, so build first:

```bash
yarn build
```

Then, from this directory:

```bash
node monte-carlo-throughput.mjs
```

## What each one measures

| Script                       | Question it answers                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `monte-carlo-throughput.mjs` | Baseline ns/run-frame of the current engine, per-run construction cost, and what metric aggregation adds               |
| `flat-stepper-ceiling.mjs`   | What the same net costs as hand-written flat typed-array code — i.e. the headroom available without leaving JavaScript |
| `coloured-enumeration.mjs`   | How per-frame cost scales with token count when a coloured input arc has weight 2 (the `∏ C(n, w)` blow-up)            |
| `shard-main.mjs`             | Whether sharding runs across worker threads scales, **and whether it changes results** (simulator level)               |
| `sharded-experiment.mjs`     | The same question against the production `createMonteCarloExperiment` runtime with real worker threads                 |

`flat-stepper-ceiling.mjs` needs no build — it imports nothing from the package.

## Reading the numbers

Results are reported per **run-frame** (one run advanced by one frame) rather
than per experiment, because runs finish at different times: a completed run
stops consuming budget, so wall clock alone conflates "faster engine" with
"runs deadlocked earlier". `runFrames` is summed from run summaries.

Absolute figures are machine-specific. The ratios are the point.

## The sharding checks

Two scripts cover sharding at different levels.

`sharded-experiment.mjs` is the one that matters: it drives the shipped
`createMonteCarloExperiment` over real worker threads at several shard counts.
It bundles the worker for Node first, because the `dist` build wraps the worker
in an inline Blob that only a browser can load. It exits non-zero if any shard
count produces different results.

`shard-main.mjs` predates the production implementation and spawns
`shard-worker.mjs` directly against the **unmodified** `MonteCarloSimulator`. It
is kept because it isolates the simulator from the experiment runtime, so a
regression can be attributed to one or the other.

Both check two things:

1. **Scaling** — wall clock against shard count.
2. **Result preservation** — every frame's merged histogram is fingerprinted and
   compared across shard counts. This must print `identical to 1 shard: YES` on
   every row. If it ever prints `NO`, the sharding design is wrong, not the
   benchmark.

Two details carry that guarantee, and both must survive into any production
implementation:

- Seeds derive from the **global** run index, so run _i_ gets the same seed
  regardless of which shard owns it.
- Metric state is merged with the accumulator monoid's `merge`, which is
  associative and commutative, so shard completion order does not matter.
