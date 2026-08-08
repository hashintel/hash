# Simulation performance: threads, WASM, and GPU

Status: §3 (worker sharding) and §5 (place capacity) are implemented. §2 and
§4 measurements still stand and are unaddressed. §6–§9 remain proposals.

Goal: make **Experiments** (Monte Carlo batches) as fast as possible, with
per-seed parallelism across threads/workers, and decide whether WASM (browser),
native (server), and WebGPU are worth their cost.

Everything labelled _measured_ below comes from harnesses in
[`../benchmarks/`](../benchmarks/README.md), run on a 10-core Apple Silicon
laptop, Node 25.6, against the built `dist` of this package.

---

## TL;DR

1. **The engine is ~36× slower than equivalent flat JavaScript.** The gap is
   architectural (allocation, copying, string-keyed lookup, per-run
   recompilation), not "JavaScript is slow". WASM addresses the _wrong_ 3% of
   the problem until that is fixed.
2. **There is a quadratic blow-up on coloured input arcs with weight ≥ 2** that
   dwarfs everything else: 13.4 ms _per run-frame_ at 400 tokens in a place.
   That is ~6.7 hours for a 1000-run × 1800-frame experiment. Fixing it is a
   contained change and should happen before anything on this list.
3. **Per-seed worker sharding needs no `SharedArrayBuffer` and is
   result-preserving — now implemented** (§3.3): ~4× on 8 shards (10-core
   machine), byte-identical output at every shard count. The metric accumulators
   were already monoids (`empty`/`merge`), so this was designed for.
4. **Optional per-place token capacity — now implemented** (§5.3). Beyond the
   modelling feature, it is the keystone that converts frames from growable to
   fixed-size, which is the precondition for SoA layout, a WASM linear-memory
   ABI, a computable state-space bound, and any GPU path. Those follow-ons are
   _not_ done: the runtime still uses growable frames.
5. **WASM is worth doing, but as a second codegen backend behind whole-loop
   codegen, not as a rewrite.** Expect ~1.5–3× over _good_ JS, not over
   today's engine.
6. **WebGPU: discrete transitions are possible but only for a restricted
   subset, and WGSL has no `f64`** — so a GPU path is a numerically-different
   fork, not an acceleration of the existing one. Offloading _only_ ODEs is
   architecturally worse than doing nothing (per-frame round-trip).

Done: **§3 worker sharding**, **§5 capacities**.
Remaining, in order: **§4 hot-path fixes → §6 whole-loop codegen → §7
WASM/native → §8 GPU (spike only)**.

§4 item 1 (the quadratic enumeration blow-up) is the single highest-value change
left and is independent of everything else.

---

## 1. What runs today

Two engines share `engine/` compilation but differ in stepping:

| Path                           | Used by                         | Frame storage                                |
| ------------------------------ | ------------------------------- | -------------------------------------------- |
| `engine/compute-next-frame.ts` | interactive single-run playback | immutable; appends every frame to `frames[]` |
| `monte-carlo/advance-run.ts`   | **Experiments**                 | two reusable buffers, swapped per step       |

Experiments are the target, so everything below concerns the Monte Carlo path.
One experiment now runs several Web Workers (§3.3), each owning a slice of the
runs and running its own `MonteCarloSimulator`, which advances its runs
round-robin one frame at a time (`advanceAll()`) and streams per-frame metric
state to the main thread for merging. The §2 measurements below are per worker
and unaffected by that fan-out.

User code (dynamics, lambdas, kernels, expression metrics) is compiled by the
HIR pipeline in the LSP worker into buffer-ABI JS programs
(`hir/emit-buffer-js.ts`), instantiated via `new Function`, and reads packed
token bytes directly. That part is already well designed — it is the _engine
around it_ that is expensive.

---

## 2. Where the time actually goes (measured)

### 2.1 Baseline throughput

SIR example, 500 S + 5 I, 3 uncoloured places, 2 transitions, `dt` 0.1,
`maxTime` 60, 4000 runs (2.4 M run-frames), single thread:

| Configuration                                 | ns / run-frame |
| --------------------------------------------- | -------------- |
| Current engine, no metrics                    | **1 143**      |
| Current engine, 1 scalar metric               | 1 385          |
| Current engine, 1 distribution metric         | 2 223          |
| Current engine, 3 metrics (2 distributions)   | 3 798          |
| Hand-written flat SoA stepper, same semantics | **31**         |

The last row is the headline. `benchmarks/flat-stepper-ceiling.mjs` implements
the same net — same RNG shape, same `exp(-λ·elapsed) ≤ u` acceptance test, same
deadlock rule — as typed arrays with no allocation, no string lookup, and no
per-frame copying. It produces the same mean recovered count and runs **~36×
faster**.

Caveat, stated plainly: that stepper is _specialised to one net_. A generic
engine cannot reach 31 ns. But a **code-generating** engine can get close, and
this codebase already generates code (§6). Treat 36× as the ceiling and
5–15× as the realistic target for a generic flat rewrite.

### 2.2 Self-time profile

`--cpu-prof` over 2.4 M run-frames, simulation portion only:

| Cost centre                                | Share   | Why                                                                                                                             |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `computeTransitionEffect` (+ closures)     | **29%** | allocates an object array per transition per frame (`inputPlaces.map(spread)`), then three more arrays via `.every`/`.filter`×2 |
| `copyMonteCarloFrameBuffer`                | **20%** | full frame memcpy every step — _even with zero dynamics_                                                                        |
| `advanceRun` + `advanceAll`                | 14%     | scheduling, `Set`/`Map` churn per step                                                                                          |
| `nextRandom`                               | 9%      | one draw per transition per frame                                                                                               |
| token add/remove/merge                     | 7%      | `Object.entries`, `new Set`, `Record<PlaceID, …>`                                                                               |
| `enumerateWeightedMarkingIndicesGenerator` | 4%      | see §2.4                                                                                                                        |
| `getPlaceIndex`                            | 3%      | `Map<string, number>` lookup **in the innermost loop**                                                                          |
| GC                                         | 2%      | consequence of the above                                                                                                        |

Note what is _absent_: the compiled user code barely registers. The buffer-ABI
programs are fast. The engine wrapping them is not.

Three of these are pure waste rather than trade-offs:

- **The frame copy.** `writeFrameAfterDynamics` copies current → next
  unconditionally, then applies dynamics. With no dynamics-enabled places
  (the SIR case, and many others) the copy is the only thing that happens.
- **String-keyed place lookup.** `frameLayout.placeIndexById.get(placeId)` runs
  per place per transition per frame. Indices are known at build time.
- **`Record<PlaceID, …>` for removals/additions.** Every firing allocates
  objects keyed by string IDs, immediately iterated with `Object.entries`.

### 2.3 Per-run construction

`createRunState` calls `buildSimulation()` **once per run**, and
`buildSimulation` calls `instantiateHirBuffer{Lambda,Kernel,Dynamics}`, each of
which is a `new Function`.

| Runs  | Construction | Per run |
| ----- | ------------ | ------- |
| 100   | 23 ms        | 229 µs  |
| 1 000 | 95 ms        | 95 µs   |
| 4 000 | 319 ms       | 80 µs   |

For a 1000-run experiment on a 5-transition net that is ~10 000 `new Function`
calls, ~1000 duplicate `frameLayout` maps, and 1000 distinct function identities
at every shared call site in the engine — which also defeats V8 inlining. The
compiled programs are **pure and stateless**; only the scratch buffers
(`placeBases`, `indices`, `kernelStaging`) are per-run, and those are small.
One compiled `SimulationDefinition` should be shared by all runs in a shard,
with per-run state reduced to buffers + RNG + counters.

This also explains part of why sharding scales sub-linearly (§3): every shard
pays its own construction cost.

### 2.4 The quadratic blow-up (most important finding)

`enumerateWeightedMarkingIndicesGenerator` is a generator, but it is only lazy
over the _Cartesian product across arcs_. Per arc it eagerly materialises the
full combination list:

```ts
const perPlaceCombos = places.map((p) => indexCombinations(p.count, p.weight));
```

`indexCombinations(n, k)` backtracks and pushes **every** k-combination into an
array before a single one is yielded. So a transition with a coloured input arc
of weight `w` over a place holding `n` tokens allocates `C(n, w)` arrays on
_every evaluation, every frame_ — and `computeTransitionEffect` `return`s on the
first accepted combination, so nearly all of it is discarded.

Measured, one coloured place, one weight-2 input arc, transition never fires:

| Tokens in place | `C(n,2)` | ns / run-frame |
| --------------- | -------- | -------------- |
| 10              | 45       | 17 892         |
| 25              | 300      | 58 276         |
| 50              | 1 225    | 214 988        |
| 100             | 4 950    | 870 518        |
| 200             | 19 900   | 3 318 793      |
| 400             | 79 800   | **13 406 833** |

Clean quadratic, ~170 ns per enumerated combination. At 400 tokens that is
**13.4 ms for one run-frame**; a 1000-run × 1800-frame experiment would take
~6.7 hours. Weight 3 makes it cubic.

The general bound for one transition is `∏ᵢ C(nᵢ, wᵢ)` over its coloured
non-inhibitor input arcs.

**Fix** (contained, no architecture change): iterate combinations by index
without materialising them — an odometer over per-arc combination ranks, with
`combinationCount = C(n, w)` computed arithmetically and the _k_-th combination
unranked on demand. Cost becomes proportional to combinations actually
_examined_, which for a firing transition is often 1. This is worth doing
independently of everything else in this document.

### 2.5 Metric aggregation

`createMonteCarloMetricHistogramAccumulator().add` does `new Map(state)` per
sample — an O(bins) copy per run per frame per metric. With 4000 runs that is
4000 map clones per frame. Measured cost at 4000 runs: **+94%** for one
distribution metric, **+232%** for three metrics.

Worse, that cost is not constant per unit of work — it **grows with run count**,
because bin count grows with the number of runs sampled:

| Runs  | Engine ns/run-frame | With 1 distribution metric | Metric cost |
| ----- | ------------------- | -------------------------- | ----------- |
| 125   | 1 140               | 1 565                      | 425         |
| 500   | 893                 | 1 722                      | 828         |
| 1 000 | 979                 | 1 745                      | 766         |
| 4 000 | 1 101               | 2 139                      | **1 038**   |

The engine term is flat (~900–1150 ns, within noise); the metric term rises
2.4× across a 32× increase in runs. So doubling an experiment's run count more
than doubles its distribution-metric time — exactly the wrong scaling property
for a tool whose answer to "I need better statistics" is "run more seeds".

The accumulators are already monoids, which is exactly right for sharding
(§3); they just need mutable-in-place `add` on a private state object, plus a
reused typed-array bin table when binning is fixed-width. Also,
`forEachRunFrame` allocates a fresh `SimulationFrameReader` **per run per frame
per metric** (`createMonteCarloFrameReader`) — that should be one reusable
cursor rebound to each run.

---

## 3. Per-seed parallelism (the headline ask)

### 3.1 Why this is the easy win

Runs are fully independent: separate seed, separate RNG state, separate frame
buffers, no shared mutable state. The only cross-run interaction is metric
aggregation, and `MonteCarloMetricMonoid` already exposes `empty`/`merge`.

So the design is: **shard runs across N workers; each shard runs the existing
simulator over its slice; the main thread merges per-frame metric states.**

Two invariants make shard count invisible to results:

1. **Seeds derive from the global run index**, not the shard-local one — so run
   _i_ gets the same seed no matter which shard owns it. `deriveRunSeed` already
   takes a run index; shards must pass the global one.
2. **Merge is associative and commutative** over the per-frame accumulator
   state, so shard completion order does not matter.

Notably, this needs **no `SharedArrayBuffer`**. The app is not cross-origin
isolated (no COOP/COEP headers), so `SharedArrayBuffer` — and therefore WASM
threads — is unavailable today. Message-passing shards with transferable
`ArrayBuffer`s sidestep that entirely. Worth remembering when §7 tempts you
toward WASM threading.

### 3.2 Prototype and results

[`../benchmarks/shard-main.mjs`](../benchmarks/README.md) shards 4000 SIR runs
across Node `worker_threads`, using the **shipped, unmodified**
`MonteCarloSimulator`, with one distribution metric merged on the main thread:

| Shards | Wall clock | Speedup | Merged result identical to 1 shard |
| ------ | ---------- | ------- | ---------------------------------- |
| 1      | 5 866 ms   | 1.00×   | —                                  |
| 2      | 2 990 ms   | 1.96×   | **yes**                            |
| 4      | 1 785 ms   | 3.29×   | **yes**                            |
| 8      | 1 414 ms   | 4.15×   | **yes**                            |
| 12     | 1 619 ms   | 3.62×   | **yes**                            |

One representative run; timings vary ±10% between invocations (8 shards
measured between 3.79× and 4.18× across repeats). Result-preservation does not
vary — it is exact, verified by fingerprinting every frame's merged histogram
and comparing across shard counts, identical on every row of every repeat. That
is the property that matters most: sharding must not change what an experiment
reports.

Scaling is sub-linear and regresses past core count, for understandable
reasons: 4 performance + 6 efficiency cores, per-shard HIR compile, and the
per-run construction cost of §2.3 paid N times. Fixing §2.3 should improve
parallel efficiency as well as single-thread speed.

### 3.3 What shipped

Implemented — `createMonteCarloExperiment` now fans out over N transports:

| Piece                                     | Where                                          |
| ----------------------------------------- | ---------------------------------------------- |
| Shard sizing and contiguous split         | `monte-carlo/runtime/shard-plan.ts`            |
| Global-index seed derivation              | `MonteCarloSimulatorConfig.runIndexOffset`     |
| Streaming monoid merge of per-frame state | `monte-carlo/metrics/merge.ts`                 |
| Fan-out, progress, lifecycle              | `monte-carlo/runtime/experiment.ts`            |
| Host-level override                       | `ExperimentsProvider`'s `experimentShardCount` |

Two design points worth keeping in mind when touching this:

- **Scalar frames carry `runAggregate`**, the pre-reduction accumulator state,
  because `frameValue` cannot be merged — a mean of means is not a mean. Time
  aggregation is recomputed on the main thread from merged frame values, while
  distribution metrics aggregate per _run_ over time and so are already correct
  shard-locally.
- **Frames are released on a watermark**: a frame number finalises only once
  every still-running shard has reported it, with finished shards dropped from
  the watermark rather than blocking it. That is also why merged output matches
  an unsharded run — a finished shard has no active runs left to contribute,
  exactly like the completed runs a single simulator skips.

Measured end to end by `benchmarks/sharded-experiment.mjs`, which drives the real
runtime over real worker threads and fails if any shard count changes results:

| Shards | Wall clock | Speedup | Identical to 1 shard |
| ------ | ---------- | ------- | -------------------- |
| 1      | 3 156 ms   | 1.00×   | —                    |
| 2      | 1 667 ms   | 1.89×   | yes                  |
| 4      | 1 058 ms   | 2.98×   | yes                  |
| 8      | 769 ms     | 4.11×   | yes                  |

Still open:

- **Concurrent experiments do not share a pool.** Three 8-way experiments spawn
  24 workers and compete for cores. Memory is roughly unchanged (sharding splits
  runs rather than duplicating them), so this degrades gracefully rather than
  breaking, and the docs tell users to run experiments one at a time for maximum
  speed — but a shared pool would be better.
- **Metric state crosses threads as `[number, number][]`**, not typed arrays, so
  it is cloned rather than transferred.
- Scaling is sub-linear past ~4 shards, partly from efficiency cores and partly
  because each shard repays the per-run construction cost of §2.3.

Server side (`petrinaut-cli`), the same sharding applies via
`node:worker_threads` — not yet wired up. Note the existing memory constraint
recorded for the optimisation path — a 1 GB ECS task against multiple Node CLIs
each capped at 768 MB — so shard count there must be bounded by memory, not just
cores.

---

## 4. Hot-path fixes (do these first)

Ordered by measured value per unit of risk. None require new toolchain, new
ABI, or user-visible change.

| #   | Change                                                                                   | Expected                                                   |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Lazy, index-based combination enumeration (§2.4)                                         | up to ~1000× on affected nets; nothing on weight-1 nets    |
| 2   | Share one compiled `SimulationDefinition` across a shard's runs (§2.3)                   | removes 80–230 µs/run and improves inlining                |
| 3   | Skip the frame copy when no place has dynamics; otherwise copy only dynamic places       | ~20%                                                       |
| 4   | Replace `Record<PlaceID, …>` removals/additions with dense per-place-index typed arrays  | ~10% + most GC                                             |
| 5   | Resolve place/transition indices at build time; delete `getPlaceIndex` from the hot loop | ~3%                                                        |
| 6   | Mutable-in-place metric accumulators + reusable frame cursor (§2.5)                      | ~30–50% of metric overhead                                 |
| 7   | Single RNG draw per frame reused across transitions where semantics allow                | up to 9% — **needs a semantics decision**, changes streams |

Items 1–6 are behaviour-preserving. Item 7 changes RNG streams, so existing
seeds would produce different (equally valid) trajectories — a product call,
not an engineering one.

My estimate for 1–6 combined on a typical coloured net: **5–15×**, before any
threading. Combined with §3 on 8 cores: **20–60×**. That is likely enough to
make WASM optional rather than urgent.

---

## 5. Optional per-place token capacity

You raised this as a prerequisite; it is, and for more reasons than frame
sizing.

### 5.1 Shape

Add to `Place` in `types/sdcpn.ts`:

```ts
/** Optional hard upper bound on tokens in this place. */
capacity?: number | null;
```

Semantics to decide (see §10): when a firing would exceed capacity, is the
transition _not enabled_ (classical capacity / self-loop semantics), or does it
fire and **error**? These differ observably. Classical Petri-net capacity treats
it as an enablement condition, and that is also the cheaper check — it folds
into the existing structural-enablement test alongside inhibitor arcs.

### 5.2 What it unlocks

**Fixed frame size.** With every place bounded, the frame's byte length is
static:

```text
frameBytes = header
           + placeCount   × (4 + 4)              // counts + offsets
           + transitionCount × (8 + 4 + 1)       // elapsed + firingCount + flag
           + Σ_p capacity_p × stride_p           // token region, padded
```

No `ensureFrameCapacity`, no reallocation, no `reallocations` counter, no
per-step repacking to keep places contiguous — each place gets a fixed slot and
`placeOffsets` becomes a build-time constant. That removes `applyTokenAdditions`
repacking entirely (a measured 3%, worse on colour-heavy nets) and makes frames
trivially poolable and transferable.

**A computable state-space bound.** For uncoloured places, reachable markings
are at most `∏ (capacity_p + 1)`. Report it in the UI so users see when they
have specified something astronomically large. For coloured places the bound is
over token _values_ too and is generally not enumerable — be careful not to
promise a "combinatorial explosion" number that only holds for uncoloured nets.

**A static worst-case enumeration bound.** Per transition,
`∏ᵢ C(capacity_i, wᵢ)` (§2.4) is computable at compile time. This is worth
surfacing as a **lint**: "this transition can enumerate up to 79 800 token
combinations per frame". That warning would have caught §2.4 before it was
measured.

**The GPU/WASM precondition.** Fixed per-run frame size is what lets you
allocate `runs × frameBytes` as one contiguous block — required for a WASM
linear-memory layout and mandatory for GPU (§8).

### 5.3 Semantics as implemented

A transition is not enabled when firing would take any output place above its
capacity — the supply-side mirror of an input arc that cannot be satisfied. Three
details that were decisions rather than consequences:

- **Net change, not gross output.** Constraints are the sum of output arc weights
  on a place minus the _standard_ input arc weights on the same place, so a
  1-in/1-out self loop is never blocked by its own full place. Read and inhibitor
  arcs consume nothing and therefore do not make room.
- **Same-frame pending output counts.** Output tokens are applied once at the end
  of a frame, so the frame's counts lag during transition evaluation. Without
  folding in what earlier transitions already committed, two producers feeding
  one capped place would each individually fit and jointly overflow. Tracked in
  `MonteCarloRunState.pendingOutputCounts`, allocated only for nets that declare
  a capacity.
- **Deadlock includes capacity.** Both engines' structural-enablement checks
  consider capacity, so a net whose remaining transitions are all blocked by full
  places reports deadlock instead of stepping to `maxTime` with nothing
  happening.

Constraints are precomputed per transition at build time
(`engine/capacity.ts`) and are empty for nets without capacities, so the hot path
pays nothing for a feature it does not use.

An initial marking above a place's capacity is rejected at build time: capacity
blocks transitions, so it cannot repair a starting state that already violates
the bound.

Shipped alongside: the `Place.capacity` field and zod schema, a place-inspector
control, and `drawing-a-net.md` / `simulation.md` updates.

Not done: capacity does **not** yet participate in the HIR artifact fingerprint.
It changes enablement but not any compiled program, so artifacts stay valid; if
capacity ever feeds into codegen (§6) that has to change. The fixed-size frame
layout this unlocks (§5.2) is also still unbuilt — the runtime keeps using
growable frames.

---

## 6. Whole-loop codegen (where the real win is)

The engine currently interprets net structure at runtime: loop over
`transitionIds`, look up compiled transition, build input descriptors, enumerate,
call lambda, call kernel, apply effects generically. The user code is compiled;
the _net_ is not.

Since the net is known when an experiment starts, emit **one specialised
stepper per net** — the whole frame loop, with structure unrolled and user code
inlined:

```text
for each run in shard:
  # transition 0: infection  (S ≥ 1, I ≥ 1)
  if (counts[0] >= 1 && counts[1] >= 1) { …inlined lambda…; …inlined kernel… }
  # transition 1: recovery   (I ≥ 1)
  if (counts[1] >= 1) { … }
```

No dispatch, no descriptor objects, no string lookup, no generic enumeration
for weight-1 arcs, no `Record` allocation. This _is_ the flat stepper of §2.1,
generated rather than hand-written.

This is a natural extension of the existing pipeline, not a new concept:
`emit-buffer-js.ts` already emits per-surface programs from HIR. This emits one
program per _net_, splicing those bodies in. The HIR is designed for it — pure,
no recursion, no unbounded loops, statically unrollable `map`, and the module
docblock already names "JavaScript today, WASM/GPU later" as the intended
backend set.

Sequencing matters: **do §4 and §5 first.** Codegen over a growable frame with
`Record`-based effects would just generate the same expensive shapes.

Risks: compile time per experiment start (mitigate by caching on the artifact
fingerprint, which already exists); debuggability of generated code (keep the
current interpreted path as a reference implementation and differential-test
against it — the existing test suite becomes the oracle); and code size for
large nets.

---

## 7. WASM (browser) and native (server)

### 7.1 The honest case for WASM

WASM buys predictable numeric performance without a JIT warm-up and without
V8's deoptimisation cliffs. Against **well-written** JS numeric code over typed
arrays, expect **~1.5–3×** — not the 10× that "rewrite it in WASM" implies. All
of §2's cost centres are allocation, copying, and dispatch, and WASM does not
fix those by itself; a flat JS rewrite captures most of the same ground.

So: WASM is a worthwhile _second backend_ once §6 exists, and a poor
_first_ move.

### 7.2 Design that works

The only viable shape is **one module per net containing the entire stepping
loop with user code inlined** — the §6 design, emitted as WASM instead of JS.
Frames live in linear memory as `runs × frameBytes` (needs §5). One host call
advances a whole batch of frames for all runs in the shard, so there are
**zero boundary crossings per frame**.

Designs to reject:

- _Rust engine in WASM, user code in JS_ — a boundary crossing per transition
  per frame. Slower than today.
- _Rust engine + HIR interpreter in WASM_ — interpretation loses to JIT-compiled
  JS on hot code.
- _Runtime Cranelift in the browser_ — not available.

### 7.3 The `libm` gotcha

WASM has only `sqrt`, `abs`, `min`, `max`, `ceil`, `floor`, `trunc`, `nearest`
for `f64`. It has **no `exp`, `log`, `pow`, `sin`, `cos`, `tan`** — and
`HIR_MATH_FNS` exposes all of them, with `Math.exp` on the firing path of
_every_ transition evaluation.

Importing them from JS means a host call per invocation, which would erase the
win. So a WASM backend must ship its own `libm` subset in the module. That is a
known, bounded piece of work, but it is real, and it must produce
**bit-identical** results to V8's `Math.*` or seeded runs will diverge between
backends. Getting bit-identical `exp` across V8 and a hand-rolled
implementation is not guaranteed — this may force accepting per-backend
divergence, which is a product decision about what "same seed" promises.

Two build routes:

| Route                                                                       | Notes                                                                                                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Emit WASM bytes directly from HIR                                           | No runtime toolchain; ~1.5–2.5k lines for the emitter; must hand-roll libm                                                   |
| Rust engine template + generated Rust for user code, compiled ahead of time | Only works if nets are known at build time — they are not (users author code at runtime), so this cannot be the general path |

Since nets and user code are authored at runtime, **direct WASM emission from
HIR is the only route that covers the product**. Precedent exists in-repo:
`libs/@blockprotocol/type-system/rust` already ships `cdylib` + `wasm-bindgen`,
and `wasm-bindgen` is pinned in the workspace — but note that precedent is for
_ahead-of-time_ compiled Rust, which is the case that does not apply here.

### 7.4 Server: native

The elegant option: **one HIR→WASM backend, two hosts.** The browser runs it on
the built-in engine; `petrinaut-cli` runs the same module under Wasmtime, which
compiles it natively with good codegen. One emitter, one set of semantics, one
place for bit-exactness to be verified — and CPU-native speed on the server.

Alternative if the server should not depend on WASM: a Rust engine plus
**Cranelift** JIT of the HIR (Cranelift is a normal crate; runtime codegen is
fine off-browser). Faster ceiling, but a second codegen backend to keep
semantically in sync with the browser's — I would avoid that until there is
evidence it is needed.

Either way the server also wants §3's sharding across `worker_threads` (or OS
processes, given the recorded 768 MB-per-CLI cap).

---

## 8. GPU / WebGPU

### 8.1 Is Petri-net simulation possible on a GPU?

Yes — but the parallelism axis has to be **across runs, not within a run**. One
GPU thread per seed is exactly the embarrassingly-parallel shape GPUs want, and
it is what an experiment already is. Within a single run there is very little to
parallelise: transitions must be evaluated in a defined order because each
firing mutates the marking the next transition observes (`applyTokenRemovals`
runs immediately, inside the loop).

So the model is: `runs` threads, each stepping its own net for many frames,
with metrics reduced on-GPU via atomics into histogram buffers, reading back
only every N frames.

### 8.2 The four hard constraints

**1. No `f64` in WGSL.** WebGPU core has `f32`; `f16` behind the `shader-f16`
feature; `f64` is an open proposal, not a shipped extension
([gpuweb#2805](https://github.com/gpuweb/gpuweb/issues/2805)). The entire token
layout is `f64`, dynamics integrate in `f64`, and `real`/`integer` both map to
`f64` lanes. A GPU path is therefore **`f32`** — different rounding, ~7
significant digits, and integer exactness only to 2²⁴. Consequences: Euler
integration on stiff dynamics degrades noticeably, and **GPU results will not
match CPU results for the same seed**. For a product whose reproducibility
story is "same seed, same trajectory", that is a fork in semantics, not an
optimisation.

Also no `u64`: the string-pool ids and 128-bit UUIDs need `u32` pairs, with
manual 64-bit arithmetic if compared or hashed.

**2. Variable token counts.** GPU buffers are fixed at dispatch. §5 capacities
are therefore **mandatory**, not optional, for any GPU path — and the total
allocation is `runs × frameBytes`, so generous capacities multiply fast.

**3. Unbounded enumeration.** `∏ᵢ C(nᵢ, wᵢ)` combinations per transition with
data-dependent trip counts is hostile to SIMT: divergence plus per-thread work
imbalance. A realistic GPU subset would restrict to weight-1 coloured arcs (or
first-match semantics), which is a real capability reduction.

**4. Divergence.** Each run fires different transitions, so a subgroup executes
the union of taken branches. Bounded by transition count — the CPU engine walks
all transitions every frame anyway — but kernel bodies with heavy user code
will diverge badly.

### 8.3 Why "ODEs on the GPU only" is the wrong split

This is the specific idea worth pushing back on. A frame is
`dynamics → transitions → timers`, and the discrete part reads exactly what the
continuous part wrote. Running dynamics on the GPU and transitions on the CPU
means, **every frame**, uploading the token region, dispatching, and reading
back — with `mapAsync` readback latency in the hundreds of microseconds to
milliseconds, against a whole-frame CPU cost of ~1 µs per run today. The
round-trip would be 100–1000× the work it replaces.

Same for "timing of the next firing": that is one `exp` and a compare per
transition. There is nothing there to offload.

The rule: **GPU pays off only if the entire stepping loop lives on the GPU for
many frames without readback.** Partial offload of any per-frame stage is
strictly worse than not doing it.

### 8.4 Verdict

Sequence this **after** §4–§7, and scope it as a spike, not a roadmap item.
Realistic upside for a suitable net — bounded capacities, weight-1 arcs,
`f32`-tolerant, thousands of runs — is large (plausibly 10–100× over a
multi-threaded CPU implementation, dominated by how much divergence the net
causes). But it is a second engine with different numerics, a restricted
feature subset, and a hard dependency on §5, and it only helps at run counts
where a well-optimised threaded CPU engine may already be fast enough.

Reasonable spike, ~1 week, answering one question: for the SIR net with 10 000
runs, `f32`, capacities set, what is the end-to-end wall clock versus the
threaded CPU path? If it is not ≥10×, drop it.

A cheaper GPU idea worth noting: keep simulation on the CPU and use WebGPU only
for **rendering** large token populations and distribution charts, which has no
numerical-fidelity problem at all.

---

## 9. Not covered above: the algorithmic option

Worth flagging because it may beat every item here. The engine uses fixed-`dt`
time-stepping: cost is `frames × transitions` regardless of activity —
`maxTime` 180 / `dt` 0.1 = 1800 frames per run, whether or not anything
happened. For nets where firings are sparse relative to `dt`, an **event-driven
scheme** (Gillespie SSA / next-reaction method, with ODE integration between
events) does work proportional to _events_, not frames. That can be 10–100×
fewer steps, and it composes with everything above.

It is a semantics change — different trajectories, different meaning for
`dt`, and hybrid continuous/discrete handling — so it would have to be an
opt-in mode. But "reduce the number of steps" is a bigger lever than "make each
step faster", and it deserves evaluation alongside the engineering work.

---

## 10. Questions for you

Blocking design decisions:

1. **Capacity semantics** — when a firing would exceed a place's capacity: is
   the transition not enabled (classical, cheap, composes with inhibitor arcs),
   or does it error and fail the run? Do capacities affect _existing_ nets at
   all, or only where explicitly set?
2. **Reproducibility contract** — must the same seed give the same trajectory
   across (a) shard counts, (b) engine versions, (c) CPU vs WASM vs GPU
   backends? (a) is preserved by the §3 design. (b) is broken by hot-path item 7.
   (c) is essentially impossible for GPU (`f32`) and hard for WASM (`libm`).
   Knowing which of these you are willing to give up decides §7 and §8.
3. **Worker budget** — one shared pool across concurrent experiments, or per
   experiment? What is the acceptable core count while the user keeps editing?

Sequencing:

4. Should I start with §4 items 1–6 (measurable, behaviour-preserving, no new
   concepts), or do you want the §3 sharding landed first because it is the
   visible feature?
5. Is the §9 event-driven mode in scope at all, or is fixed-`dt` a fixed
   product decision?
