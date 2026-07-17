# Atlas Projection Layout and UMAP PRD

- **Status:** Approved for implementation
- **Last updated:** 2026-07-10
- **Owners:** HASH Graph / Atlas
- **Primary Rust module:** `libs/@local/graph/atlas/src/projection`
- **Prototype references:**
  - `tools/embedding2d/app/sample.py`
  - `tools/embedding2d/app/layout.py`
  - `tools/embedding2d/app/fit.py`
  - `tools/embedding2d/app/features.py`

## 1. Summary

Atlas needs a production Rust pipeline that turns a repeatable sample of entity embeddings and entity relations into a ladder of two-dimensional layouts. Each ladder level blends semantic similarity with relational structure at a different `alpha`, and each fitted layout is subsequently distilled into a serving-time projector.

This implementation must not be a line-for-line translation of the Python prototype. PostgreSQL should perform relational operations that it is better suited to perform, maintained numerical libraries should provide standard algorithms and data structures, and Rust should own the HASH-specific graph construction, graph fusion, and UMAP behavior.

The implementation will use:

- PostgreSQL for sampled identity mapping, relation joins, deduplication, degree statistics, and hub selection;
- USearch for HNSW approximate nearest-neighbor search;
- `sprs` for sparse graph representation and standard sparse operations;
- `faer` for dense numerical decompositions such as PCA or eigendecomposition;
- `rayon` for specialized parallel graph and optimization kernels;
- `burn` for the existing trainable projector;
- a pinned Python `umap-learn` oracle for behavioral conformance while implementing the required UMAP subset in Rust.

Dependency count is not an optimization target. Correctness, performance, maintainability, and operational suitability take precedence. Standard algorithms should not be reimplemented merely to avoid a maintained dependency.

## 2. Background

### 2.1 Existing Rust sampling lifecycle

`projection/sample.rs` already provides the sample lifecycle:

- `sample.f32` stores contiguous native-endian embedding rows and is mmaped through `FloatBytes`;
- `sample.pgcopy` stores an opaque PostgreSQL binary COPY of `(sample_index, web_id, entity_uuid)`;
- `Sample::load` supports cold and hot cache paths;
- a temporary PostgreSQL table restores the mapping from entity identity to sampled row index;
- a repeatable-read transaction keeps the sampled identity mapping and relational reads consistent;
- relation edges are streamed rather than persisted;
- `Sample::finish` commits the transaction and returns the embeddings for long-running local computation.

Cache files are published individually by persisting temporary files over their destination. Existing destination files must not be removed before persistence.

### 2.2 Existing Python layout behavior

The Python prototype:

1. builds an HNSW cosine k-nearest-neighbor graph over sampled embeddings;
2. converts the k-NN result into a UMAP fuzzy simplicial set;
3. constructs a degree-normalized, hub-trimmed relation graph;
4. adds bounded shared-neighbor structure through sparse diffusion;
5. blends semantic and relation graphs at multiple alpha levels;
6. resets local connectivity after each blend;
7. runs UMAP layout optimization, warm-starting each level from the previous level;
8. trains one projector per alpha level.

The Rust implementation must preserve the intended behavior, but may use different internal algorithms when they are demonstrably correct and more appropriate for production.

## 3. Goals

### 3.1 Functional goals

1. Build a semantic UMAP fuzzy graph from mmaped sampled embeddings.
2. Build a relational graph containing only entities in the sample.
3. Detect and remove relational hubs using the fit-time degree distribution.
4. Add bounded shared-neighbor structure without materializing an unbounded sparse matrix product.
5. Blend semantic and relation graphs for an alpha ladder.
6. Fit a two-dimensional UMAP layout for each alpha.
7. Warm-start successive ladder levels and future refits where valid.
8. Persist final coordinates as native-endian row-major `f32` files compatible with `FloatBytes`.
9. Preserve the relation adjacency and hub identities needed by structure-feature generation and serving metadata.
10. Provide precise error reporting without derive-helper error macros.

### 3.2 Correctness goals

1. Match pinned `umap-learn` behavior stage by stage for the serial reference implementation within documented floating-point tolerances.
2. Preserve UMAP graph semantics:
   - smooth local distance calibration;
   - fuzzy directed memberships;
   - fuzzy union;
   - weak-edge epoch filtering;
   - weighted positive-edge sampling;
   - negative sampling;
   - attraction and repulsion curves;
   - linear learning-rate decay.
3. Handle duplicate embeddings and zero-distance neighbors correctly.
4. Guarantee that each k-NN row contains itself first with distance exactly zero.
5. Reject malformed dimensions, indices, sparse structures, and non-finite numerical inputs before optimization.
6. Never introduce undefined behavior for parallel optimization. Non-atomic concurrent mutation of coordinates is forbidden.

### 3.3 Performance goals

1. Support the default sample size of approximately 1.5 million rows at dimension 512.
2. Avoid any `O(n²)` dense distance matrix or graph representation.
3. Use `u32` sampled row indices after validating that the sample fits in `u32`.
4. Avoid avoidable per-row and per-edge heap allocation in hot paths.
5. Reuse thread-local and batch buffers where practical.
6. Avoid materializing the complete `W²` relation graph before top-k pruning.
7. Keep only one alpha level's fused optimization state and coordinates alive when possible.
8. Release the PostgreSQL repeatable-read transaction before HNSW construction and UMAP optimization.
9. Provide benchmarks and memory measurements before changing numerical precision or algorithmic behavior for performance.

### 3.4 Operational goals

1. No Python dependency in production or normal Rust CI.
2. During the baseline port, oracle fixtures are committed and consumed directly by Rust conformance tests. After the first end-to-end implementation is complete, normal unit tests become self-contained and oracle comparison moves to a separate differential/conformance suite.
3. Expensive phases emit structured progress and timing information.
4. Failures leave previously persisted output files intact wherever the existing hotswap persistence model allows.
5. Intermediate HNSW and sparse graph persistence is optional and must only be added when measurements justify it.

## 4. Non-goals

The initial implementation will not provide:

- a general-purpose public UMAP crate;
- arbitrary output dimensions;
- supervised or semi-supervised UMAP;
- generic runtime-selected high-dimensional distance functions;
- UMAP transform or inverse-transform APIs;
- distributed HNSW construction;
- GPU UMAP optimization unless CPU measurements show it is required;
- bit-identical parallel layouts across machines or thread counts;
- persistence of every intermediate graph;
- a replacement for `sprs`, `faer`, USearch, Rayon, or Burn.

## 5. Architectural decisions

### 5.1 HNSW is provided by USearch

USearch is the initial ANN implementation. It provides a maintained, optimized HNSW index with cosine distance, parallel insertion/search support, SIMD acceleration, and configurable vector quantization.

The HNSW index is transient by default:

1. reserve capacity for the sampled row count;
2. add every `FloatBytes` row using its sample index as the USearch key;
3. query neighbors for every sampled row;
4. repair self-neighbor placement;
5. build the semantic fuzzy graph;
6. drop the HNSW index.

The baseline implementation must use `f32` index storage. `f16` or another compressed storage mode may be enabled only after measuring recall, layout quality, peak memory, and runtime. If approximate candidates are reranked, exact cosine distances must be recomputed from the original `FloatBytes` rows.

A k-d tree such as Kiddo is deliberately not the baseline index. Kiddo is designed and benchmarked primarily for low-dimensional spaces such as 2D, 3D, and 4D, while Atlas searches approximately 1.5 million points in 512 dimensions. Axis-aligned k-d tree pruning degrades under that dimensionality; HNSW is the appropriate high-dimensional ANN baseline. Kiddo may still be useful for later low-dimensional layout diagnostics, but not for semantic-neighbor extraction.

### 5.2 Sparse graphs use `sprs`

Semantic, relation, and fused graphs use `sprs` compressed sparse matrices. The selected concrete type must use compact `u32` node indices when supported and must validate all conversions from `usize`.

`sprs` should provide:

- CSR/CSC ownership and views;
- transpose/conversion operations;
- sorted sparse structure invariants;
- sparse addition and multiplication where bounded;
- row traversal for specialized algorithms.

HASH-specific algorithms may operate directly over sparse row views, but must return standard `sprs` matrices rather than introducing a second generic CSR container.

### 5.3 Dense decompositions use `faer`

Use `faer` for substantial dense linear algebra such as:

- PCA initialization;
- eigendecomposition;
- SVD or QR if needed by initialization or diagnostics.

Do not manually implement standard decompositions. Small two-dimensional UMAP coordinate updates may use `[f32; 2]` or an equivalent compact representation when a matrix abstraction does not improve correctness or generated code.

### 5.4 UMAP is a focused internal implementation

Atlas will implement the UMAP subset required by this pipeline rather than depending directly on the current `umap-rs` optimizer.

Reasons:

- Atlas must optimize externally fused semantic and relation graphs;
- the available crate does not expose the required prebuilt-graph optimization boundary;
- its documented parallel Hogwild implementation requires a safety audit;
- Atlas does not need the broad surface of a general-purpose UMAP package;
- a stage-level Python oracle can provide a strong executable specification.

This does not authorize reimplementation of HNSW, sparse matrices, numerical decompositions, random-number infrastructure, or generic parallel execution.

### 5.5 PostgreSQL performs relational set operations

While `Sample`'s repeatable-read transaction is alive, PostgreSQL should:

1. map relation endpoints through the temporary sample table;
2. remove self-relations;
3. canonicalize undirected pairs;
4. deduplicate parallel and directionally duplicated relations;
5. compute sampled post-deduplication degrees;
6. compute the hub threshold from the positive degree distribution;
7. identify hub rows and their stable entity identities;
8. remove relations touching hubs;
9. stream the remaining adjacency ordered by sampled row index.

The exact split between SQL and Rust may be adjusted after `EXPLAIN ANALYZE` and memory measurements, but UUID/index lookup and relational deduplication must remain in PostgreSQL.

### 5.6 Relation diffusion is bounded during construction

The Python prototype computes sparse powers and prunes each row afterward. Production Rust must avoid materializing a potentially enormous complete sparse product when `shared_k` is enabled.

For each source row, the bounded diffusion algorithm should:

1. traverse one-hop neighbors;
2. traverse each neighbor's outgoing row;
3. accumulate candidate target weights in a reusable thread-local accumulator;
4. remove the diagonal;
5. retain only the largest `shared_k` candidates;
6. symmetrize by element-wise maximum;
7. apply hop weight and decay;
8. merge with direct relation weights by element-wise maximum.

The implementation must preserve the Python weighting semantics and be checked against oracle fixtures on small graphs.

## 6. End-to-end data flow

```text
Sample::load
  |
  |-- sample.f32 -> FloatBytes
  |-- sample.pgcopy -> temporary atlas_sample table
  |-- repeatable-read transaction
  |
  v
PostgreSQL relation preprocessing
  |-- sampled, deduplicated undirected adjacency
  |-- degree distribution and hub rows
  |-- stable hub entity IDs
  v
Rust relation CSR construction
  |-- direct degree-normalized graph
  |-- bounded shared-neighbor diffusion
  |-- adjacency retained for structure features
  v
Sample::finish
  |-- commit transaction
  |-- return FloatBytes
  v
USearch HNSW
  |-- cosine k-NN
  |-- exact self-neighbor repair
  |-- optional exact reranking
  v
Rust UMAP fuzzy semantic graph
  |
  +--------------------------+
                             |
Relation graph --------------+--> alpha blend
                                  |
                                  v
                         reset local connectivity
                                  |
                                  v
                         UMAP optimization
                                  |
                                  v
                     layout-aXXX.f32 per alpha
                                  |
                                  v
                      structure feature generation
                                  |
                                  v
                         Projector::fit per alpha
```

The PostgreSQL transaction must not remain alive during HNSW construction, UMAP optimization, or MLP training.

## 7. Proposed Rust boundaries

Exact names may change during implementation, but responsibilities must remain separated.

### 7.1 Semantic graph

```rust
struct SemanticGraphOptions {
    neighbors: usize,
    hnsw_connectivity: usize,
    hnsw_expansion_add: usize,
    hnsw_expansion_search: usize,
    seed: u64,
}

struct Knn {
    indices: Vec<u32>,
    distances: Vec<f32>,
    rows: usize,
    neighbors: usize,
}

struct SemanticGraph {
    graph: SparseGraph,
}
```

Responsibilities:

- build/query USearch;
- repair self neighbors;
- validate and normalize distances;
- convert k-NN output to a fuzzy graph.

### 7.2 Relation graph

```rust
struct RelationGraphOptions {
    hub_quantile: f64,
    hub_min_ratio: f64,
    shared_neighbors: usize,
    shared_weight: f32,
    hops: usize,
    hop_decay: f32,
}

struct RelationGraph {
    graph: SparseGraph,
    adjacency: SparseGraph,
    hubs: Vec<EntityId>,
}
```

Responsibilities:

- consume the sampled relation stream;
- construct adjacency;
- degree-normalize direct edges;
- add bounded shared-neighbor structure;
- retain hub identities and feature adjacency.

### 7.3 UMAP graph and optimizer

```rust
struct UmapOptions {
    min_dist: f32,
    spread: f32,
    epochs: usize,
    learning_rate: f32,
    repulsion_strength: f32,
    negative_sample_rate: usize,
    seed: u64,
}

struct UmapInit {
    coordinates: Vec<[f32; 2]>,
}

struct UmapLayout {
    coordinates: Vec<[f32; 2]>,
}
```

Responsibilities:

- fit low-dimensional curve parameters;
- filter weak edges according to epoch count;
- create positive and negative sampling schedules;
- optimize from caller-supplied initialization;
- provide a serial reference backend and a safe parallel backend.

### 7.4 Layout ladder orchestration

```rust
struct LayoutLadderOptions {
    alphas: Vec<f32>,
    first_epochs: usize,
    chained_epochs: usize,
    cold_learning_rate: f32,
    warm_learning_rate: f32,
}
```

Responsibilities:

- validate and sort alpha levels descending;
- blend semantic and relation graphs;
- reset local connectivity;
- choose cold or warm initialization;
- fit one level at a time;
- persist coordinates;
- pass each result to the next level as its warm start.

## 8. Semantic graph requirements

### 8.1 k-NN output

For `n` rows and `k` neighbors, the logical output is two row-major `n * k` arrays:

- sampled row indices;
- cosine distances.

Requirements:

1. `k <= n` after handling small samples.
2. Every index is within the sampled row count.
3. Every distance is finite and non-negative after clamping small floating-point residue.
4. Every row has itself at position zero.
5. Self-distance is exactly `0.0`.
6. Remaining entries are sorted by non-decreasing distance after any self repair or exact reranking.

HNSW recall must be measured against exact search on a manageable representative subset. Parameters should default to at least the Python prototype's effective quality settings unless benchmarks justify a change.

### 8.2 Fuzzy set construction

The Rust implementation must reproduce the pinned oracle's behavior for:

- local connectivity;
- smooth k-NN binary search;
- `rho` and `sigma` calculation;
- handling duplicate zero-distance neighbors;
- directed membership strengths;
- fuzzy union `a + b - a * b`;
- removal of explicit zero entries;
- canonical sorted sparse output.

All graph weights must be finite and within `[0, 1]`, modulo a documented floating-point tolerance.

## 9. Relation graph requirements

### 9.1 Direct graph

The direct graph is an undirected, unweighted adjacency after SQL deduplication. Multiplicity and original relation direction are not layout signals.

After hub removal, compute:

```text
weight(i, j) = 1 / sqrt(degree(i) * degree(j))
```

Isolated rows remain present in the matrix shape and have no entries.

### 9.2 Hub selection

A node is a hub only when its degree exceeds both:

- the configured positive-degree quantile threshold;
- `hub_min_ratio * median_positive_degree`.

Hub selection is fit-time state. Persist stable entity IDs for serving and feature construction; sampled row indices alone are insufficient across refits.

### 9.3 Shared-neighbor graph

For hop two, the intended weight is equivalent to the normalized sparse product used by the Python prototype before top-k pruning. Deeper hops apply:

```text
shared_weight * hop_decay^(hop - 2)
```

Top-k selection may break symmetry; restore symmetry by element-wise maximum with the transpose. Merge direct and shared graphs by element-wise maximum. Scale non-empty relation weights so the global maximum is `1.0`.

## 10. Graph fusion requirements

For each alpha:

```text
blend = alpha * semantic + (1 - alpha) * relation
```

Requirements:

1. `alpha` is finite and within `[0, 1]`.
2. Explicit zero entries are removed.
3. Reset local connectivity after blending.
4. Preserve a symmetric final graph.
5. Do not mutate the reusable semantic or relation inputs.
6. Avoid retaining fused graphs from completed alpha levels.

The local-connectivity reset must match the oracle. If implemented without materializing an intermediate graph, tests must prove equivalence.

## 11. UMAP optimizer requirements

### 11.1 Serial reference backend

Implement the serial backend first. It is the correctness reference for:

- edge thresholding;
- epochs-per-sample calculation;
- positive-edge scheduling;
- negative-sample scheduling;
- random-number generation;
- attractive gradients;
- repulsive gradients;
- gradient clipping;
- coordinate normalization;
- learning-rate decay.

The serial backend should reproduce oracle fixture coordinates closely when given identical graph ordering, initialization, parameters, and RNG state. Raw coordinates are checked strictly at early checkpoints. Because the pinned Numba epoch kernel uses `fastmath=True`, tiny arithmetic differences can be chaotically amplified by near-collision repulsion at later epochs; final conformance therefore also requires exact sampling call counts and RNG states plus an invariant fuzzy cross-entropy objective comparison, rather than weakening the raw-coordinate tolerance until unrelated layouts pass.

### 11.2 Random-number behavior

Port the small UMAP reference RNG used by `umap-learn` for the serial conformance backend if required for stage-level coordinate comparison. The production parallel backend may use independently partitioned deterministic streams, provided its statistical behavior and quality meet acceptance criteria.

### 11.3 Parallel backend

The parallel backend must be memory-safe and data-race-free.

Candidate designs include:

- row-partitioned updates against an epoch snapshot;
- atomic coordinate updates;
- conflict-free batching or graph coloring;
- GPU optimization through Burn if CPU approaches are insufficient.

Selection must be based on measured convergence quality, runtime, peak memory, and scaling. It must not reproduce non-atomic Hogwild writes in safe-looking Rust code.

Parallel output is not required to match serial coordinates exactly. It must achieve equivalent layout quality under the metrics in section 16.

### 11.4 Initialization

Support caller-supplied coordinates from the first implementation.

Initialization priority for a ladder level:

1. previous rung coordinates;
2. a valid previous layout for the same sampled row ordering;
3. coordinates produced by a previous serving projector for a new sample, when available;
4. PCA initialization using `faer`;
5. seeded random initialization as a supported fallback.

Cold-start behavior and disconnected-component placement must be tested explicitly. Any departure from the Python PCA default must be justified by measurements, not dependency concerns.

## 12. Python oracle

### 12.1 Purpose

The oracle is an executable specification, not a production component. It allows Rust development to proceed stage by stage against the established `umap-learn` implementation.

### 12.2 Package

Create a separately pinned Python package, provisionally under:

```text
tools/embedding2d/oracle/
```

It must pin exact compatible versions of:

- Python;
- NumPy;
- SciPy;
- `umap-learn`.

Fixture metadata must include package versions, parameters, seed, and generator revision.

### 12.3 Oracle stages

The oracle must be able to emit:

1. smooth k-NN `sigmas` and `rhos`;
2. directed memberships;
3. fuzzy-union CSR;
4. local-connectivity-reset CSR;
5. fused CSR for selected alpha values;
6. fitted `a` and `b` parameters;
7. optimizer edge schedules;
8. serial coordinates after selected epoch counts;
9. final serial coordinates;
10. relation graph outputs for small hand-defined graphs.

### 12.4 Fixture format

Use a JSON manifest and `.npy` arrays unless implementation experience establishes a clearly better interoperable format.

A fixture may contain:

```text
manifest.json
knn-indices.npy
knn-distances.npy
sigmas.npy
rhos.npy
graph-indptr.npy
graph-indices.npy
graph-values.npy
initial-layout.npy
final-layout.npy
```

Rust may use a maintained `.npy` reader as a development dependency. Do not invent a custom binary fixture format solely to avoid that dependency.

### 12.5 CI model

- Normal Rust CI reads committed fixtures and does not invoke Python.
- The oracle package provides a documented regeneration command.
- Optional ignored differential tests may invoke the oracle locally.
- Fixture regeneration must produce a reviewable manifest diff when versions or parameters change.

## 13. Persistence

### 13.1 Layout files

Persist one native-endian row-major raw `f32` file per alpha level, with two values per sampled row. Suggested names:

```text
layout-a100.f32
layout-a075.f32
layout-a050.f32
layout-a025.f32
```

Files must open through `FloatBytes` with dimension two.

### 13.2 Publication behavior

Use temporary files and persistence/rename hotswapping consistent with `sample.rs`:

- do not remove the existing destination before persistence;
- flush and close the temporary output before publishing;
- surface persistence errors;
- leave old destination files untouched when computation fails before publication.

Cross-file generation atomicity is not required unless a concrete operational failure demonstrates the need for it.

### 13.3 Intermediate state

Do not initially persist:

- USearch indexes;
- k-NN arrays;
- semantic graphs;
- relation graphs;
- optimizer schedules.

Add intermediate caching only when profiling shows that rebuild cost materially impedes production operation or recovery.

## 14. Errors

Introduce focused error types at subsystem boundaries, for example:

- `SemanticGraphError`;
- `RelationGraphError`;
- `UmapError`;
- `LayoutError`.

Requirements:

1. Implement `Display`, `Error`, and relevant `From` conversions manually.
2. Do not use derive-helper error macros such as `derive_more` merely for convenience.
3. Preserve underlying sources.
4. Include contextual values for malformed shapes, dimensions, indices, and numerical states.
5. Convert panics from third-party validation boundaries into explicit precondition checks where practical.
6. Internal unreachable states may use assertions only when construction has already proven the invariant.

## 15. Allocation and memory requirements

1. Embeddings remain mmaped through `FloatBytes`; do not copy the complete embedding matrix merely to satisfy a numerical API.
2. Prefer APIs that accept row slices or matrix views over mmaped storage.
3. k-NN indices use `u32`; distances use `f32`.
4. Sparse node indices use `u32` after validation.
5. UMAP coordinates use contiguous `f32` pairs.
6. Reuse result buffers and thread-local accumulators in repeated row operations.
7. Do not allocate a fresh accumulator for every relation row.
8. Avoid collecting PostgreSQL `Row` objects beyond the current streaming batch.
9. Measure peak resident memory for HNSW build, k-NN extraction, graph construction, and optimization separately.
10. Numerical precision reductions require quality and error measurements.

## 16. Validation and acceptance criteria

### 16.1 Oracle conformance

Committed fixtures must cover:

- duplicate vectors;
- zero distances;
- displaced or absent self-neighbors;
- asymmetric k-NN rows;
- isolated vertices;
- disconnected components;
- fewer rows than configured neighbors;
- weak edge pruning;
- purely semantic graphs;
- purely relational graphs;
- blended graphs;
- warm starts;
- empty and one-row edge cases where meaningful.

For deterministic serial stages:

- sparse structures must match exactly after canonical sorting;
- integer schedules and indices must match exactly;
- floating-point arrays must match within stage-specific documented tolerances;
- non-finite outputs are always failures.

### 16.2 Parallel layout quality

Parallel layouts must be evaluated using several of:

- UMAP cross-entropy objective;
- trustworthiness or neighborhood preservation;
- k-NN overlap in layout space;
- pairwise-distance rank correlation;
- Procrustes-aligned coordinate error against serial output;
- connected-component separation and compactness;
- rung-to-rung drift for warm-started alpha ladders.

No single raw-coordinate comparison is sufficient because translation, rotation, reflection, and stochastic update order may differ.

### 16.3 HNSW quality

On an exact-search-capable representative fixture:

- report recall at `k`;
- report build and query duration;
- report index memory;
- compare `f32` and any proposed compressed index storage;
- validate downstream fuzzy graph and layout quality, not recall alone.

### 16.4 Rust validation

At minimum, implementation changes must pass targeted equivalents of:

```text
cargo fmt --check --package hash-graph-atlas
cargo check --package hash-graph-atlas
cargo clippy --package hash-graph-atlas --all-targets
cargo nextest run --package hash-graph-atlas
```

Run broader workspace validation when dependency wiring or shared crates change. After changing Rust `Cargo.toml` dependencies, run:

```text
mise run sync:turborepo
```

### 16.5 PostgreSQL integration

Integration coverage must verify:

1. the cold sample path builds usable relation data;
2. the hot path restores the mapping and produces the same sampled identity relation behavior;
3. duplicate and directional edge rows collapse correctly;
4. hub thresholds and removals match a small known dataset;
5. all streamed relation indices are valid sampled rows;
6. `Sample::finish` commits before local long-running work;
7. transaction failure does not publish layout outputs.

## 17. Observability

Emit structured events for:

- sample row count and dimensions;
- relation rows scanned, deduplicated, retained, and removed by hubs;
- degree median, quantile threshold, and hub count;
- HNSW build progress, query progress, configuration, memory, and recall benchmark mode;
- semantic and relation graph nonzero counts;
- shared-neighbor candidate and retained counts;
- graph fusion alpha and nonzero count;
- optimizer epoch progress, active positive edges, objective diagnostics, and elapsed time;
- layout persistence paths and byte sizes;
- projector validation loss per alpha.

Do not log individual entity embeddings or high-volume per-row diagnostics.

## 18. Delivery plan

### PR 1: Python oracle

- create the pinned oracle package;
- expose stage-level generation commands;
- commit initial fixtures and manifests;
- document regeneration;
- cover semantic graph, fusion, and serial optimizer primitives.

### PR 2: Rust sparse and fuzzy graph

- add `sprs` and required fixture-reading development dependencies;
- implement k-NN validation and self-neighbor repair;
- implement smooth k-NN distances;
- implement directed memberships and fuzzy union;
- implement local-connectivity reset and graph fusion;
- pass oracle stage tests.

### PR 3: Rust serial UMAP optimizer

- implement curve parameter fitting, schedules, reference RNG, attraction, repulsion, and learning-rate decay;
- support caller-provided initialization;
- pass serial oracle tests after selected epochs and final convergence.

### PR 4: HNSW and safe parallel optimization

- integrate USearch with `FloatBytes`;
- benchmark HNSW quality and memory;
- implement and benchmark a safe parallel optimizer;
- establish quality equivalence against the serial backend;
- retain a serial mode for conformance and debugging.

### PR 5: Relation graph and layout lifecycle

- move relational deduplication, degree statistics, and hub selection into PostgreSQL;
- construct relation CSR and bounded shared-neighbor diffusion;
- integrate `Sample::finish` at the database/local-compute boundary;
- fit the alpha ladder;
- persist and mmap layout files;
- expose relation adjacency and hubs for structure features.

### Follow-up: Projector and serving contract

- generate structure features using the fitted adjacency and hubs;
- train one projector per alpha;
- persist projector metadata and hub identities;
- add previous-projector warm initialization for new samples;
- validate serving-time feature parity.

### Post-baseline hardening and optimization

Only after the first complete end-to-end version mirrors the pinned Python behavior:

- make ordinary Rust unit tests self-contained and independent of committed Python fixture files;
- retain the pinned oracle as a separate differential/conformance check;
- audit `Knn` construction, validation, self-neighbor repair, and storage for avoidable scans and conversions;
- keep vertex identities and optimizer edge endpoints in `u32`, converting to `usize` only when indexing Rust slices;
- remove operation-order constraints that exist solely for oracle mimicry when benchmarks and quality tests prove a faster formulation is correct;
- enable better FLOP formulations, including fused operations where useful, after comparing objective, neighborhood quality, and performance against both the serial baseline and oracle;
- benchmark allocations, runtime, peak memory, HNSW recall, and layout quality before and after each optimization.

## 19. Risks and mitigations

### 19.1 HNSW peak memory

**Risk:** Storing 1.5 million 512-dimensional vectors in the ANN index may dominate memory.

**Mitigation:** Measure USearch memory directly, evaluate compressed internal storage with exact reranking, and avoid retaining k-NN and HNSW storage longer than necessary.

### 19.2 Relation two-hop explosion

**Risk:** High-degree nodes can produce a massive candidate set even after global hub trimming.

**Mitigation:** Apply hub removal first, use per-row bounded accumulation, reuse thread-local state, record candidate counts, and consider an additional defensible per-row work cap only if measurements require it.

### 19.3 Parallel optimizer divergence

**Risk:** A safe parallel update strategy may converge differently from reference serial UMAP.

**Mitigation:** Keep the serial backend, compare objective and neighborhood metrics, test warm-start drift, and select the parallel design empirically.

### 19.4 Oracle drift

**Risk:** Upgrading Python dependencies silently changes fixtures.

**Mitigation:** Pin all oracle versions and include them in fixture manifests. Treat regeneration as an explicit reviewed change.

### 19.5 Long PostgreSQL snapshots

**Risk:** Holding repeatable read through local numerical work interferes with vacuum and retains database resources.

**Mitigation:** Complete relational extraction and call `Sample::finish` before HNSW or UMAP work.

### 19.6 Sparse-library mismatch

**Risk:** A generic sparse operation materializes a larger intermediate than the algorithm can tolerate.

**Mitigation:** Use `sprs` for representation and standard bounded operations, but retain specialized row-wise algorithms where pruning must occur during construction.

## 20. Open experimental decisions

The following decisions remain open and must be made through benchmarks or conformance experiments during implementation:

1. USearch internal vector storage: `f32` baseline versus compressed alternatives.
2. Number of HNSW candidates to retrieve before optional exact reranking.
3. Safe parallel optimizer strategy.
4. PCA implementation details for a mmaped `n × 512` matrix.
5. Whether semantic graph construction and relation extraction should overlap despite extending transaction lifetime.
6. Whether HNSW or semantic graph persistence is operationally worthwhile.
7. Whether a pure relation alpha level requires explicit disconnected-component placement.
8. Whether prior-layout identity matching or prior-projector inference gives the best refit stability for a newly sampled population.
9. Whether the use of SIMD through `portable_simd` is feasible and where it would create a performance benefit, mirroring the work done for k-means in `hash_graph_embeddings`.

### 20.1 Resolved: use plain UMAP rather than densMAP

A full sweep on a 20,000-row subsample (`200` epochs, seed `42`) rejected densMAP for the Atlas use case. At both `alpha = 1.0` and `alpha = 0.5`, densMAP roughly doubled radius-density correlation but severely damaged neighborhood preservation: k-NN recall fell from `0.385` to `0.086` at `alpha = 1.0` and from `0.383` to `0.087` at `alpha = 0.5`. Trustworthiness also fell from `0.987` to `0.887` and from `0.986` to `0.872`, respectively. Global-distance quality declined, projector RMSE increased, and fit time rose by roughly 38–42%. Small edge-AUC gains do not compensate for the topology loss.

Plain UMAP is therefore the production behavior. densMAP should not be implemented or exposed as a pipeline option unless the data distribution or product objective changes materially and a new evaluation demonstrates density gains without a comparable neighborhood-recall regression.

Experimental choices must not weaken the serial reference implementation or oracle tests.

## 21. Definition of done

The layout and UMAP port is complete when:

1. Rust constructs semantic and relational sparse graphs for a real sample.
2. Stage-level serial behavior passes the pinned Python oracle fixtures.
3. A safe parallel optimizer meets documented quality and performance criteria.
4. The default-scale pipeline runs without an `O(n²)` allocation.
5. PostgreSQL transactions end before long-running local optimization.
6. An alpha ladder is fitted and persisted as mmap-compatible `.f32` files.
7. Warm-started levels remain visually coherent under measured drift metrics.
8. Hub identities and relation adjacency are available for projector feature generation.
9. Errors preserve useful source and shape/index context.
10. Targeted formatting, compilation, linting, unit, oracle, and PostgreSQL integration tests pass.
11. Performance and peak-memory measurements are recorded for the default configuration.
