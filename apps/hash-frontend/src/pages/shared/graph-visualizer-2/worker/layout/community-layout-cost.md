# Community-force layout: per-pass cost attribution

Where wall-clock time goes across a **cold** community-force layout run (construction through
`status === "settled"`), attributed per pass with real measurements. Scope is
`worker/layout/community-layout.ts` (the medium-scale FA2 engine) and its seeder
`worker/layout/sparse-stress-seed.ts`.

> A separate broader investigation owns `worker/PERFORMANCE.md`; this file is the layout-specific
> deep-dive and does not touch it.

## How this was measured

Two committed artifacts, both driving deterministic (seeded) inputs from
`worker/bench-fixtures.ts` (`buildForceGraph`), so every run is reproducible:

1. **Full-run attribution harness** — `community-layout-cost.bench.ts`. Drives the **real**
   `CommunityLayout` from construction to `settled` with the production **1 ms tick budget**
   (`graph-worker.ts` calls `layout.tick(1)`), and an opt-in `CommunityLayoutProfiler` that
   accumulates wall-clock + call counts per pass. Prints the tables below.
2. **Isolated `bench()` cross-checks** — same file: Louvain graph build, Louvain solve, and the
   sparse-stress seed to completion, run through vitest's statistical runner to sanity-check the
   harness numbers.

**Instrumentation seam.** `community-layout.ts` gained an optional last constructor arg
`profiler?: CommunityLayoutProfiler` (threaded through `createCommunityLayout`). Every timing site
is guarded on `#profiler` being set (`#now()` returns `0` and `#record()` is a no-op when absent),
so **production is byte-for-byte unchanged** — no clock reads, no allocation, only a branch. All 28
`worker/layout` tests pass with the seam in place. Measured profiler overhead is ~1–4% of wall
(e.g. 7802 ms profiled vs 7490 ms unprofiled at 5k), so the per-pass split (denominator =
sum-of-passes) is trustworthy; the "unattributed" residual (tick-loop `performance.now`, seed
hand-off copy, profiler bookkeeping) is <4 ms at every size, i.e. the seam captures essentially the
whole run.

Reproduce (from `apps/hash-frontend`; the app has no vitest config, so defaults pick up
`*.bench.ts` — note `yarn vitest` is not a script here, invoke the binary directly):

```bash
node_modules/.bin/vitest bench --run \
  src/pages/shared/graph-visualizer-2/worker/layout/community-layout-cost.bench.ts
```

**Caveats.** Absolute ms are one machine (Apple Silicon, Node/vitest 4.1.8) — the cross-size
**shape and ratios** are the point, not the absolute numbers. The synthetic hub-skewed fixture is
not identical to real entity graphs (topology drives FA2 iteration count). Seed setup-vs-SGD is
bucketed by the seeder phase at each tick's start, so 1–2 boundary ticks bleed between buckets
(immaterial to the totals).

## Per-pass attribution (mean over runs; % of the cold run)

Passes: `louvainBuild`/`louvainSolve` = build the graphology graph vs run `louvain()`;
`resolveEdges` = the `"lo:hi"` string-keyed parallel-edge merge; `matrixRebuild` = FA2 Float32Array
fills; `seedSetup` = seeder CSR + weak-components + pivot BFS + coord init + pack; `seedSgd` = the
stress-SGD relaxation ticks; `fa2Iterate` = the library `iterate()` call; `fa2Stats` = `#fa2IterStats`
(O(N) move scan); `fa2Settle` = `#afterFa2Iteration` EMA/streak bookkeeping (O(1)); `fa2Scale` =
`#estimateTypicalEdgeLength` (O(E), every 8 iters); `writePositions` = per-tick re-centre + buffer
commit.

### ~300 nodes / 717 edges — Barnes-Hut OFF (exact O(N²) repulsion)

| pass           | calls |   total ms | ms/call |     % |
| -------------- | ----: | ---------: | ------: | ----: |
| fa2Iterate     |   917 |     201.91 |  0.2202 | 97.7% |
| seedSgd        |     7 |       1.46 |  0.2083 |  0.7% |
| seedSetup      |     4 |       1.06 |  0.2655 |  0.5% |
| louvainSolve   |     1 |       0.60 |  0.6037 |  0.3% |
| louvainBuild   |     1 |       0.41 |  0.4143 |  0.2% |
| fa2Stats       |   917 |       0.42 |  0.0005 |  0.2% |
| fa2Scale       |   115 |       0.23 |  0.0020 |  0.1% |
| writePositions |   188 |       0.24 |  0.0013 |  0.1% |
| resolveEdges   |     1 |       0.12 |  0.1202 |  0.1% |
| matrixRebuild  |     1 |       0.06 |  0.0550 |  0.0% |
| fa2Settle      |   917 |       0.08 |  0.0001 |  0.0% |
| **sum**        |       | **206.60** |         |  100% |

Production wall (unprofiled, min of 3): **203 ms**.

### ~1500 nodes / 3833 edges — Barnes-Hut OFF (exact O(N²) repulsion)

| pass           | calls |    total ms | ms/call |     % |
| -------------- | ----: | ----------: | ------: | ----: |
| fa2Iterate     |   504 |     2777.52 |  5.5110 | 99.5% |
| seedSgd        |    17 |        2.93 |  0.1726 |  0.1% |
| writePositions |   508 |        2.92 |  0.0057 |  0.1% |
| louvainSolve   |     1 |        2.14 |  2.1380 |  0.1% |
| louvainBuild   |     1 |        2.11 |  2.1095 |  0.1% |
| seedSetup      |    17 |        0.96 |  0.0567 |  0.0% |
| fa2Stats       |   504 |        0.89 |  0.0018 |  0.0% |
| fa2Scale       |    64 |        0.83 |  0.0130 |  0.0% |
| resolveEdges   |     1 |        0.46 |  0.4589 |  0.0% |
| fa2Settle      |   504 |        0.07 |  0.0001 |  0.0% |
| matrixRebuild  |     1 |        0.03 |  0.0275 |  0.0% |
| **sum**        |       | **2790.86** |         |  100% |

Production wall (unprofiled, min of 3): **2816 ms**.

### ~5000 nodes / 12927 edges — Barnes-Hut ON (O(N log N) repulsion)

| pass           | calls |    total ms | ms/call |     % |
| -------------- | ----: | ----------: | ------: | ----: |
| fa2Iterate     |   498 |     7768.68 | 15.5998 | 99.6% |
| writePositions |   501 |        8.91 |  0.0178 |  0.1% |
| louvainSolve   |     1 |        7.85 |  7.8479 |  0.1% |
| louvainBuild   |     1 |        6.37 |  6.3725 |  0.1% |
| fa2Stats       |   498 |        2.66 |  0.0053 |  0.0% |
| seedSetup      |    50 |        2.22 |  0.0445 |  0.0% |
| fa2Scale       |    63 |        2.00 |  0.0318 |  0.0% |
| resolveEdges   |     1 |        1.42 |  1.4230 |  0.0% |
| seedSgd        |     9 |        0.84 |  0.0928 |  0.0% |
| matrixRebuild  |     1 |        0.06 |  0.0606 |  0.0% |
| fa2Settle      |   498 |        0.04 |  0.0001 |  0.0% |
| **sum**        |       | **7801.06** |         |  100% |

Production wall (unprofiled, min of 2): **7490 ms**.

## Iteration counts and avg ms per FA2 iteration

| size (nodes) | Barnes-Hut | seed ticks | FA2 iters | ms/iter `iterate` | ms/iter overhead | overhead share |
| -----------: | :--------: | ---------: | --------: | ----------------: | ---------------: | -------------: |
|          300 |    OFF     |         11 |       917 |            0.2202 |           0.0008 |          0.36% |
|         1500 |    OFF     |         34 |       504 |            5.5110 |           0.0036 |          0.07% |
|         5000 |     ON     |         59 |       498 |           15.5998 |           0.0094 |          0.06% |

"overhead" = `fa2Stats + fa2Settle + fa2Scale` per iteration (the worker-side per-iteration work
around the library call).

## Barnes-Hut threshold bracket (the headline)

`inferSettings` (graphology) sets `barnesHutOptimize: order > 2000`. Two near-equal sizes straddling
that switch isolate the per-iterate cliff from the effect of N itself:

| size (nodes) | Barnes-Hut | FA2 iters | ms/iter `iterate` | cold run (sum) |
| -----------: | :--------: | --------: | ----------------: | -------------: |
|         1900 |    OFF     |       513 |            8.9061 |        4586 ms |
|         2100 |     ON     |       552 |            5.2981 |        2942 ms |

**+200 nodes (+11%) across the threshold makes each FA2 iteration 1.68× cheaper and the whole cold
run 1.6× faster** — purely because exact O(N²) repulsion flips to Barnes-Hut. Extrapolating the
exact-regime rate (0.2202 ms/iter at 300 → `× (N/300)²`) predicts ~61 ms/iter for exact repulsion at
5000; Barnes-Hut delivers 15.6 ms/iter, ~3.9× faster.

## Which pass dominates, and how the split shifts with size

- **FA2 `iterate` dominates at every size: 97.7% → 99.5% → 99.6%.** There is no crossover — FA2 is
  always the cost, and cold-run wall ≈ `FA2 iters × per-iterate cost`. Everything else combined is
  <2.5% (300 nodes) and <0.5% (≥1.5k).
- What shifts with size is the **per-iterate cost**, not which pass wins:
  - **≤2000 nodes (exact repulsion):** per-iterate grows **quadratically** — 0.22 ms (300) → 5.51 ms
    (1500) → 8.91 ms (1900). The 300→1500 jump is 25× for 5× the nodes (clean O(N²)).
  - **>2000 nodes (Barnes-Hut):** per-iterate grows ~N log N — 5.30 ms (2100) → 15.60 ms (5000),
    clearly sub-quadratic.
- **FA2 iteration count does NOT grow with N** (917 → ~500). Small graphs run _more_ iterations
  (adjustSizes overlap churn stays above the relative-move threshold longer at small scale) but each
  is cheap. So total cold time is driven by per-iterate cost, not iteration growth.
- Louvain / seed / matrix / writePositions absolute costs do grow with N/E, but stay <1% of the run
  throughout.

## Surprising / wasteful findings

1. **Worker-side FA2 overhead is a non-issue — the "overhead scans rival `iterate`" hypothesis is
   false.** `fa2Stats` (O(N) move scan) + `fa2Settle` + `fa2Scale` (O(E) every 8 iters) total
   **<0.01 ms/iter** at every size — 3–4 orders of magnitude below `iterate` (0.22–15.6 ms/iter),
   i.e. <0.1% of the run. The settle/stats/scale scans are not worth optimizing.
2. **The Barnes-Hut cliff at order > 2000 is the single biggest lever.** A 1500-node graph (2.8 s
   cold) is nearly as slow as a 5000-node graph (7.5 s) despite 3.3× fewer nodes, because it pays
   exact O(N²) repulsion. The whole 200–2000-node band — the common medium tier — runs on the
   expensive path.
3. **`iterate` is ~99% of the run, so only two things matter for cold latency: per-iterate cost and
   iteration count.** Optimizing Louvain, the seed, matrix build, `resolveEdges`, or writePositions
   cannot move cold-run wall meaningfully (all <1%).
4. **Graph construction rivals the Louvain solve.** Building the graphology `UndirectedGraph`
   (`addNode`/`mergeEdge`) costs ≈ the `louvain()` call itself (300: 0.41 vs 0.60 ms; 1500: 2.11 vs
   2.14 ms; isolated bench even shows build > solve at 1500). Both are trivial for a cold run, but
   see the absorb note.
5. **Small graphs over-iterate.** 300 nodes runs 917 FA2 iterations vs ~500 for 1.5k–5k. `FA2_MIN_ITERS`
   (120) plus adjustSizes jitter relative to the small typical-edge-length scale keeps the relative
   move above threshold longer.

### Absorb / streaming-path note (not a cold-run cost)

`absorb()` calls `#rebuildMatrices` every time (which re-runs `resolveEdges`, rebuilding the whole
`Map<"lo:hi", IndexEdge>` string-keyed edge map and both Float32Array matrices from scratch), and
past the growth threshold also `#runLouvain` (which rebuilds the entire graphology graph — re-`addNode`
all nodes, re-`mergeEdge` all edges). All O(N+E) allocation per streaming batch. Cheap next to one FA2
settle, but it is pure re-allocation churn repeated per batch, and the string-keyed `${lo}:${hi}` map
is the allocation hotspot there (0.12–1.42 ms per rebuild, ~20× the raw matrix fill, growing with E).

## Optimization ideas (notes only — no behavior changed here)

- **Enable Barnes-Hut below 2000 nodes** (override `barnesHutOptimize` in `buildFa2Settings`, and/or
  expose `barnesHutTheta`). Highest leverage: attacks ~99% of the cost for the most common tier. The
  quality trade-off (Barnes-Hut is approximate) should be checked against the existing layout tests.
- **Cut FA2 iterations.** A tighter seed (fewer FA2 iters to settle) or a size-aware
  `FA2_MIN_ITERS`/settle streak for small graphs that over-iterate (917 iters at 300 nodes) is linear
  savings, since `iterate` is ~99%.
- **Don't bother** micro-optimizing `fa2Stats`/`fa2Settle`/`fa2Scale`/`writePositions`/Louvain/seed
  for cold latency — the ceiling is <1% combined.
- For the **absorb** path specifically, an incremental edge/matrix update (append instead of full
  rebuild) and a non-string edge key would remove per-batch allocation churn.
