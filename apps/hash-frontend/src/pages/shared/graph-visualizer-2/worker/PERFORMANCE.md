# Graph‑visualizer‑2 worker — performance investigation

This report covers the worker half of the v2 graph visualizer
(`apps/hash-frontend/src/pages/shared/graph-visualizer-2/worker`). It documents
the methodology, the benchmarks that were added, the measured numbers, the
concrete inefficiencies found (with `file:line` references and severity), the
recommended fixes ordered by impact/effort, and the tests that should be added
to lock in the wins.

Headline findings:

- **A no‑op `commitStructure()` is not free.** In the flat/community tier every
  commit unconditionally re‑sorts all node indices, rescans topology with two
  throwaway `Set`s, re‑writes per‑node style for the whole graph, and rebuilds
  every render edge — even when nothing changed. Measured **8.4 ms per no‑op
  commit at 1,500 nodes** (`core/commit-rebuild.bench.ts`).
- **Streaming ingest pays that cost per batch.** The same 2,000‑node /
  5,000‑link graph costs **42.5 ms delivered as one batch+commit vs 1,043 ms
  delivered as 100‑entity batches — a 24.5× penalty**.
- **Community detection is dominated by `boundedLabelPropagation`**, which
  allocates a fresh `Map` per node per iteration (≤20 iterations): **111 ms for
  a 20k‑node component**, ~400× the cost of the connected‑components pass.
- **Buffers are handled well.** `FlatGraphBuffer` grows with 1.5× geometric
  slack (`flatCapacityFor`) and `Column` doubles; both stay amortized O(N). A
  naïve grow‑to‑exact‑count path would be **~21× slower at 50k records**, so this
  is worth a regression test, not a fix.

---

## 1. Methodology

### Fixtures

All benchmarks use deterministic synthetic graphs from a new shared helper,
`bench-fixtures.ts`, built on the worker's own `mulberry32` PRNG so a given
`(nodeCount, linkCount, seed)` always yields the same graph. It emits the exact
shapes the hot paths consume:

- `buildIngestEntities(shape)` → `IngestEntity[]` for the ingest/commit path.
- `buildForceGraph(shape)` → `ForceNode[]` / `ForceEdge[]` for the layout engines.
- `buildCommunityInputs(shape)` → a `LinkStore` + entity‑index `Column` for the
  community‑detection pipeline.

Link endpoints are hub‑biased (≈70 % of links point at one of the first
`hubCount` nodes) so the degree distribution resembles real query results rather
than a uniform random graph.

### Tooling

Benchmarks are Vitest `bench`/`describe` suites in colocated `*.bench.ts` files.

**`vitest bench` works in this app unchanged** — no config edits were needed. The
only wrinkle is that the `vitest` binary is hoisted to the monorepo root (the app
has no `node_modules/.bin/vitest`, and `yarn vitest` is not wired as a script), so
it must be invoked by path. The reliable, verified form from the app directory:

```bash
cd apps/hash-frontend
node ../../node_modules/vitest/vitest.mjs bench --run <relative-path-to.bench.ts>
```

(The absolute path `<repo-root>/node_modules/.bin/vitest bench --run …` also works
from anywhere; the `node …/vitest.mjs` form above is the portable one.)

### Measurement caveats

- Numbers below are from a single machine (Apple Silicon, darwin, Node under
  Vitest 4.1.8), one run each. **Absolute times vary run‑to‑run** — the entity
  interner micro‑bench moved ~2× between two runs on an otherwise idle machine —
  so treat absolute ms as order‑of‑magnitude. **The ratios (e.g. bulk vs
  streaming, once vs twice, presized vs grown) are stable** and are where the
  findings live.
- The heavy layout settle benches and the fresh‑worker commit benches use a
  fixed small iteration count (`iterations: 6`) rather than a time budget,
  because a single settle can take seconds. Their RME is reported per row.
- The `GraphWorker` runs its layout scheduler on `MessageChannel`s. A synchronous
  bench body never lets those macrotasks fire mid‑measurement, so scheduler ticks
  do not inflate individual samples; Vitest tears the process down at the end.

---

## 2. Benchmark results

### 2.1 Store ingestion — `stores/ingestion.bench.ts`

Per‑entity type‑set keying, entity interning, and link adjacency. Mean time for
one full pass over the whole graph.

| Case                                                 | small (1k/2k) | medium (5k/10k) | large (20k/40k) |
| ---------------------------------------------------- | ------------- | --------------- | --------------- |
| type‑set: `getOrCreate` **once**/node                | 0.090 ms      | 0.488 ms        | 1.81 ms         |
| type‑set: `getOrCreate` **twice**/node (peek+insert) | 0.175 ms      | 0.967 ms        | 3.64 ms         |
| `EntityStore.tryInsert`/node                         | 0.62 ms       | 3.64 ms         | 14.7 ms         |
| build `LinkStore` + `linksForEntity` over all nodes  | 0.22 ms       | 1.66 ms         | 8.63 ms         |

The peek+insert row is a stable **~2.0× the once row** at every size (1.96×,
1.98×, 2.01×) — the `ingestBatch` code path really does key each node entity
twice (see F5).

### 2.2 Community detection — `hierarchy/community.bench.ts`

| Stage                                         | 2k/6k    | 8k/24k   | 20k/60k |
| --------------------------------------------- | -------- | -------- | ------- |
| `buildInducedCsr`                             | 0.17 ms  | 1.20 ms  | 3.62 ms |
| `connectedComponents`                         | 0.023 ms | 0.090 ms | 0.28 ms |
| `boundedLabelPropagation` (largest component) | 10.2 ms  | 44.0 ms  | 111 ms  |
| full pipeline (CSR + components + label prop) | 10.3 ms  | 43.9 ms  | 121 ms  |

`connectedComponents` is ~7–13× faster than the CSR build and ~400–490× faster
than label propagation. **Label propagation is the whole cost** (see F3).

### 2.3 Buffer write + growth — `buffers/growable-buffer.bench.ts`

Mean time to write / grow the whole buffer.

| Flat‑tier buffer                     | 1k        | 10k             | 50k               |
| ------------------------------------ | --------- | --------------- | ----------------- |
| presized: write all records + commit | 0.0024 ms | 0.029 ms        | 0.098 ms          |
| geometric growth (1.5×, production)  | 0.0023 ms | 0.079 ms (2.7×) | 0.54 ms (5.5×)    |
| fixed‑step growth (1024, naïve)      | 0.0026 ms | 0.091 ms (3.1×) | 2.06 ms (**21×**) |

| Other                                                               | 1k        | 10k      | 50k      |
| ------------------------------------------------------------------- | --------- | -------- | -------- |
| `EntityPositionBuffer.setPosition`×N + commit (per‑tick leaf write) | 0.0012 ms | 0.011 ms | 0.067 ms |
| `Column<Float32Array>.push`×N (geometric)                           | 0.0014 ms | 0.024 ms | 0.125 ms |

Production’s 1.5× geometric growth (`flatCapacityFor`) tracks the presized floor
within ~5.5×; the naïve grow‑to‑exact‑count path is ~21× worse at 50k because
every step re‑allocates and memcpies the whole (non‑resizable, GPU‑uploaded)
buffer. `Column` and the leaf position buffer scale linearly — no problem here.

### 2.4 Layout settle — `layout/force-simulation.bench.ts`

Total time to build **and settle** a layout (what the user waits on, streamed
across frames in production). Fixed 6 iterations per row.

| flat‑force (cola `Descent`) | 50      | 120    | 200    |
| --------------------------- | ------- | ------ | ------ |
| build + settle              | 29.3 ms | 189 ms | 377 ms |

| community‑force (Louvain + sparse‑stress seed + FA2) | 500    | 1,500    | 3,000    |
| ---------------------------------------------------- | ------ | -------- | -------- |
| build only (Louvain + seed alloc + matrices)         | 1.8 ms | 5.1 ms   | 10.5 ms  |
| build + settle                                       | 486 ms | 3,438 ms | 4,452 ms |

Two takeaways: cola’s O(N²) `Descent` reaches ~0.4 s at 200 nodes, which is
exactly why the flat‑force tier is capped at `flatLayoutMaxNodes: 200`. And the
FA2 **settle dominates build by ~270–680×** — construction is negligible; the
iteration loop is the cost.

### 2.5 End‑to‑end commit / rebuild — `core/commit-rebuild.bench.ts`

Driven through the real `GraphWorker` exactly as `entry.ts` does.

| No‑op re‑commit (`commitStructure()` with nothing changed) | mean        |
| ---------------------------------------------------------- | ----------- |
| flat‑force (150 nodes)                                     | 0.13 ms     |
| community‑force (1,500 nodes)                              | **8.45 ms** |
| hierarchical‑lod (8,000 nodes)                             | 3.17 ms     |

| Ingest 2,000 nodes / 5,000 links            | mean                 |
| ------------------------------------------- | -------------------- |
| bulk: 1 batch + 1 commit                    | 42.5 ms              |
| streaming: 100‑entity batches + commit each | **1,043 ms (24.5×)** |

The community‑force no‑op (8.5 ms) is _more_ expensive than the hierarchical
no‑op (3.2 ms) despite fewer nodes: the flat tiers touch every node and every
link on each commit, while the hierarchical tier only recomputes the cut and the
visible clusters. This is the clearest evidence of the missing incremental commit
path. (The bulk row has high run‑to‑run variance, ±30 % RME, from GC on the big
single allocation; the streaming row is stable at ±2 %, so the ~24× ratio is a
floor, not an artifact.)

### 2.6 Edge aggregation keying — `geometry/edge-aggregation.bench.ts`

| `makePairKey` over N pairs | 500      | 2,000    | 8,000    |
| -------------------------- | -------- | -------- | -------- |
| classify every pair        | 0.012 ms | 0.049 ms | 0.194 ms |

At ~24 ns/pair and realistic cluster‑pair counts, **`makePairKey` is not a
bottleneck** — this bench exists to rule it out, and it does.

---

## 3. Inefficiencies found

Ordered by impact. Severity: **HIGH** = shows up in interaction latency at
realistic sizes; **MEDIUM** = meaningful at large N or high frame rates;
**LOW** = measurable but small.

### F1 — No no‑op / incremental fast path in the flat & community commit — **HIGH**

`core/graph-worker.ts:1071` `#commitFlat` runs the following **unconditionally on
every commit**, regardless of whether anything changed:

- `#allNodeEntityIdxs()` (`:1175`) collects every node index across all type‑set
  groups and `result.sort(...)` — **O(N log N) every commit** (`:1182`).
- Topology detection (`:1093`–`:1107`) builds `new Set<number>(entityIdxs)` and
  `new Set(existing.nodeIds)`, then two `.some(...)` scans with per‑element
  `String(idx)` / `Number(id)` conversions — **O(N) allocations + scans every
  commit**.
- `#writeFlatStyle(...)` (`:1126` → `:1377`) loops all layout nodes and writes
  radius/colour/entityIdx for each — **O(N) every commit**. The comment at
  `:1123`–`:1125` states the intent ("so colours track a type change even when
  the layout was not rebuilt"), but the cost is paid even on a true no‑op.
- `#buildFlatRenderEdges(...)` (`:1127` → `:1402`) rebuilds the entire render‑edge
  list, calling `this.#links.linksForEntity(...)` per node (`:1411`) — **O(N+E)
  plus per‑node array allocation every commit** (compounds with F4).

**Evidence:** no‑op re‑commit = **8.45 ms at 1,500 nodes** (§2.5). None of this
work is needed when the graph is unchanged, and only the style write is needed
for a type/highlight‑only change.

### F2 — Streaming ingest re‑does whole‑graph work per batch (superlinear) — **HIGH**

`entry.ts` calls `worker.ingestBatch(...)` then `worker.commitStructure({deltas})`
per incoming batch. Each commit pays F1’s full O(N log N)+O(N)+O(N+E), and in
community‑force each batch also drives FA2 `absorb` (`layout/community-layout.ts:359`),
which rebuilds the **entire** node+edge matrix in `#rebuildMatrices` (`:251`),
re‑derives FA2 settings, conditionally re‑runs Louvain, and resets the settle
detector. `resolveEdges` (`:664`) rebuilds a `Map` keyed by a `` `${lo}:${hi}` ``
string for every edge on every rebuild.

**Evidence:** the same final graph costs **42.5 ms bulk vs 1,043 ms streamed
(24.5×)** (§2.5). For K batches over N nodes this is ≈ O(K·N) instead of O(N).

### F3 — `boundedLabelPropagation` allocates per node per iteration — **MEDIUM**

`hierarchy/community.ts:63` allocates `const scores = new Map<number, number>()`
**inside the per‑node loop**, run for up to 20 iterations (`:57`), and
`deterministicShuffle` (`:22`) copies the component array (`[...indices]`, `:23`)
once per iteration (`:59`). Secondary: `csr-graph.ts` `buildInducedCsr` builds an
intermediate `number[][]` adjacency of N growable arrays (`:31`), does 2·E numeric
`push`es (`:52`–`:53`), then a `reduce` scan (`:56`) before flattening into the
typed `neighbors`/`weights` arrays (weights are uniform `1`, `:60`) — an extra
O(N)+2·E of throwaway JS‑array allocation on top of the final CSR.

**Evidence:** label propagation is **111 ms for a 20k component** and dominates
the pipeline — the CSR build is only 3.6 ms at that size (§2.2). For a giant
component the Map churn is hundreds of thousands of allocations.

### F4 — `linksForEntity` allocates a fresh array + objects on every call — **MEDIUM**

`stores/link-store.ts:134` `linksForEntity` returns a brand‑new `LinkEndpoint[]`
with a fresh object literal per incident link on **every call**. It is called
per‑entity from many paths — `graph-worker.ts:538`, `:1332`, `:1411`
(`#buildFlatRenderEdges`, per node every commit — F1), `:2148`, `:2731`, `:2766`;
`community.ts:186`, `:279`; `cluster-feature-source.ts:69`;
`edge-aggregation.ts:713`. Two callers only want the **degree** yet still build
the whole endpoint array to read `.length`: `community.ts:168` and
`graph-worker.ts:1362`.

**Evidence:** part of the per‑commit O(N+E) cost (§2.5) and the community keying
cost (§2.1); the degree‑only callers allocate an array of objects to obtain a
single number.

### F5 — Double type‑set keying per node during ingest — **MEDIUM**

For every non‑link entity, `ingestBatch` calls `#peekGroup(entity)` (`graph-worker.ts:662`
→ `:698`) _and then_ `insertNodeEntity(entity)` (`:670` → `:596`). Both construct
a `new ReadonlySortedSet(...)` (`readonly-sorted-set.ts:40` does
`[...new Set(values)].sort(...)`) and both call `TypeSetStore.getOrCreate`, which
builds the key with `directTypeIdxs.items.join(",")` (`type-set-store.ts:112`).
The peek exists only to snapshot the group’s `count` before insert for delta
computation, but it fully constructs (and, via `getOrCreate`, creates) the group.

**Evidence:** peek+insert is a stable **~2.0×** the single‑keying cost (§2.1).

### F6 — Per‑frame allocation in `#emitPositions` — **MEDIUM** (code review; not isolated‑benchmarked)

`core/graph-worker.ts:1837` `#emitPositions` runs on **every** position tick while
a layout settles and re‑derives structure that only changes on a cut change:

- `#computePorts()` (`:1842`) recomputes ports each tick.
- The obstacle list `this.#rendered.map(...)` (`:1852`) allocates a fresh array of
  objects each tick (hierarchical).
- All bezier segments are rebuilt from scratch each tick (`:1856` / `:1868`).
- `new Float32Array(this.#rendered.length * 2)` (`:1872`) is allocated each tick.
- `#buildEntityFanOut(...)` (`:1883`) runs each tick when a cut is present.

Some of this is inherent to the transfer model (the positions frame’s buffers are
_transferred_ to the main thread, so they cannot be reused). But ports, fan‑out
_topology_, and the obstacle set only change when the **cut** changes, not when
positions move — the code recomputes them every tick anyway. This was not
isolated into its own bench (it is tightly coupled to a live cut + cluster tree);
it is exercised once per commit inside `core/commit-rebuild.bench.ts` and flagged
here from code review. A targeted bench should follow the fix.

### F7 — cola flat layout is O(N²) — **INFO** (validates the 200‑node cap)

`layout/flat-layout.ts` builds a full N×N distance matrix
(`Calculator(...).DistanceMatrix()` `:163`–`:169` + `Descent.createSquareMatrix`
`:170`) and steps `Descent.rungeKutta()` (`:260`) — O(N²) per step. Measured
0.41 s at 200 nodes (§2.4).
This is expected and correctly gated by `flatLayoutMaxNodes: 200`; **no action**
beyond keeping the cap.

### F8 — `makeGrowableBuffer(resizable:false)` ignores `maxByteLength` — **LOW**

`buffers/growable-buffer.ts` `makeGrowableBuffer` returns a _plain, fixed_
`SharedArrayBuffer` (no `maxByteLength`) when `resizable === false` (`:45`–`:49`),
so `FlatGraphBuffer` can never grow in place — every growth in `ensureCapacity`
(`:153`) re‑allocates and memcpies (the class doc says as much, `:103`–`:105`).
The "double the ceiling" comment (`:158`) only helps _resizable_ buffers. This is
currently fine because `flatCapacityFor` (`graph-worker.ts:157`) adds 1.5× slack
so growth is amortized O(N) (§2.3), but the comment is misleading and the
amortization silently depends on the caller always over‑allocating.

---

## 4. Recommended fixes (ordered by impact / effort)

1. **Add a no‑op / incremental fast path to `#commitFlat` (F1, F2).** _High impact,
   medium effort._ The worker already computes `deltas` in `ingestBatch`; thread a
   "structure actually changed" signal through so a commit with empty deltas and
   no mode change skips `#writeFlatStyle` + `#buildFlatRenderEdges` (or only
   re‑emits positions). Cache the sorted `#allNodeEntityIdxs()` result and
   invalidate it on ingest instead of re‑sorting every commit. Replace the
   dual‑`Set` topology scan (`:1093`–`:1107`) with a monotonically‑increasing
   structure version + node‑count compare. Separate a cheap "restyle only" path
   (type/highlight change) from the full topology rebuild.

2. **Coalesce commits during a streaming burst (F2).** _High impact, low effort._
   The worker already debounces the trailing Louvain (`#scheduleFlatLouvainLinger`,
   `FLAT_LOUVAIN_LINGER_MS`). Apply the same idea to structure commits: during an
   ingest burst, coalesce multiple `INGEST_BATCH`es into a single
   `commitStructure` on a microtask/rAF boundary. Combined with fix 1 this
   collapses the 24.5× streaming penalty toward the bulk cost.

3. **Make `boundedLabelPropagation` allocation‑free in the inner loop (F3).**
   _Medium impact, medium effort._ Reuse one scores buffer (e.g. a `Float64Array`
   indexed by label plus a "touched labels" list to reset in O(touched)), and
   shuffle in place (Fisher–Yates on a persistent array) instead of `[...indices]`
   per iteration. Secondary, lower value: `buildInducedCsr` can do a counting pass
   to fill `offsets`, then a single pass writing straight into the `neighbors`
   typed array, dropping the N intermediate `number[]` arrays and the `reduce`
   scan.

4. **Give `LinkStore` a non‑allocating degree + iteration API (F4).** _Medium
   impact, low effort._ Add `degree(entityIdx): number` (return the adjacency
   list length) and either `forEachLink(entityIdx, cb)` or a read‑only accessor
   for the adjacency `LinkIdx[]`. Point the degree‑only callers
   (`topDegreeEntity`, seeding) and the hot per‑commit `#buildFlatRenderEdges`
   scan at these to avoid per‑node array + object allocation.

5. **Key each ingested node’s type‑set once (F5).** _Low–medium impact, low
   effort._ Compute the `ReadonlySortedSet` + `TypeSetKey` a single time per
   entity and reuse it for both the pre‑insert snapshot and the insert (e.g. have
   `insertNodeEntity` return the group + whether it was newly created, or pass the
   pre‑built group into it). Removes one `ReadonlySortedSet` construction and one
   `join(",")` per node.

6. **Cache cut‑derived structure across position ticks (F6).** _Medium impact,
   medium effort._ Recompute ports, fan‑out topology, and the obstacle list only
   when the cut/structure version changes; on a pure position tick, refresh the
   coordinates into reused scratch and only allocate the transferred frame
   buffers. Add a bench once decoupled.

7. **Fix the misleading non‑resizable growth comment / consider real geometric
   headroom in `ensureCapacity` (F8).** _Low impact, low effort._ Either document
   that non‑resizable buffers ignore `maxByteLength` and rely on the caller’s
   over‑allocation, or have `ensureCapacity` itself apply geometric slack so
   amortization doesn’t depend on every caller remembering to.

---

## 5. Tests to add

Regression + invariant tests that lock in the wins above. Suggested locations in
parentheses.

- **No‑op commit does no structural work** (`core/graph-worker.test.ts`). After a
  settled commit, call `commitStructure()` with no deltas and assert it does not
  rebuild the flat layout or re‑emit a structure frame with a new count. Concrete
  hooks: spy on `onStructureFrame`/`onLayoutMessage` and assert no
  `LAYOUT_CREATED`/`LAYOUT_DESTROYED`; assert the structure version is unchanged.
  This is the direct guard for F1 and the 8 ms no‑op.

- **Streaming equals bulk in structural output** (`core/graph-worker.test.ts`).
  Ingesting a graph as one batch vs many batches must produce the same final
  node/link counts, type‑set groups, and cluster tree. Once fix 1/2 land, extend
  it to assert the number of flat‑layout rebuilds is bounded (e.g. does not grow
  linearly with the batch count).

- **Buffer growth stays geometric / no per‑append realloc**
  (`buffers/position-buffer.test.ts`, `buffers/growable-buffer.test.ts`). Append
  many records into a small `FlatGraphBuffer` via `flatCapacityFor` and assert the
  number of `republish` callbacks is O(log N), not O(N) — this guards the ~21×
  cliff (§2.3, F8). Assert `capacity >= count` headroom holds after each grow.

- **`linksForEntity` allocation callers use degree** (`stores/link-store.test.ts`
  - call‑site tests). Add `degree()` and assert it equals
    `linksForEntity().length` for representative graphs, so the non‑allocating path
    can’t silently diverge (F4).

- **Type‑set is keyed once per ingested node** (`core/graph-worker.test.ts` or a
  `TypeSetStore` spy). Assert `getOrCreate` (or `ReadonlySortedSet` construction)
  is called once per new node entity, not twice, after fix 5 (F5).

- **Community detection determinism + allocation‑free inner loop**
  (`hierarchy/community.test.ts`). Keep the existing determinism assertions; after
  fix 3, add a test that `boundedLabelPropagation` produces identical labels to
  the current implementation on fixed inputs (a refactor‑safety snapshot).

- **Invariant: flat commit emits exactly the loaded node set**
  (`core/graph-worker.test.ts`). Assert `#allNodeEntityIdxs()`’s output (via the
  emitted flat frame count) equals the number of ingested non‑link entities, so a
  future caching optimization of that method can’t drop or duplicate nodes.

---

## 6. Benchmark files added & how to run

All under `apps/hash-frontend/src/pages/shared/graph-visualizer-2/worker/`:

| File                                 | Covers                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `bench-fixtures.ts`                  | Shared deterministic graph builders (not a bench itself).                           |
| `stores/ingestion.bench.ts`          | Type‑set keying, entity interning, link adjacency.                                  |
| `hierarchy/community.bench.ts`       | `buildInducedCsr`, `connectedComponents`, `boundedLabelPropagation`, full pipeline. |
| `buffers/growable-buffer.bench.ts`   | Flat/leaf buffer writes, presized vs geometric vs naïve growth, `Column` push.      |
| `layout/force-simulation.bench.ts`   | flat‑force (cola) and community‑force (FA2) build + settle.                         |
| `core/commit-rebuild.bench.ts`       | No‑op re‑commit + bulk vs streaming ingest through the real `GraphWorker`.          |
| `geometry/edge-aggregation.bench.ts` | `makePairKey` (rules it out as a hot path).                                         |

Run one file:

```bash
cd apps/hash-frontend
node ../../node_modules/vitest/vitest.mjs bench --run \
  src/pages/shared/graph-visualizer-2/worker/core/commit-rebuild.bench.ts
```

Run them all:

```bash
cd apps/hash-frontend
node ../../node_modules/vitest/vitest.mjs bench --run \
  src/pages/shared/graph-visualizer-2/worker
```

Note: `layout/force-simulation.bench.ts` and `core/commit-rebuild.bench.ts` build
and settle real layouts / workers and take ~1–1.5 min each; the store, community,
buffer, and geometry benches finish in seconds.

### Status of the new files

- **ESLint:** clean (`eslint --report-unused-disable-directives`, exit 0) for all
  seven files.
- **TypeScript:** clean — `tsc --noEmit` reports **no** errors in the added files.
  (The app has ~34 pre‑existing `tsc` errors in unrelated files — `supply-chain/*`,
  `slide-stack`, `math/hash.ts`, missing `recharts`/`@tanstack/react-table` — none
  touched here.)
- No production code was changed; the only additions are the benchmark files and
  `bench-fixtures.ts`. Pre‑existing local edits in `entry.ts`, `protocol.ts`,
  `random.ts`, `random.test.ts` were left untouched.
