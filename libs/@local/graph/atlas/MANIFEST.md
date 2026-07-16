# Atlas working manifest

Agent working file. Not documentation. If you are a fresh context: read this
before touching anything, then `src/projection/PRD.md` and
`src/projection/COMPLETION_PLAN.md` for the original design, and
`~/Downloads/canvas-implementation.md` for the serving design (the spec that
supersedes parts of both).

## What this crate is

Atlas drives the semtype canvas backend: UMAP alpha-ladder layouts over
entity embeddings, distilled per-rung MLP encoders for fast incremental
placement of new entities, and (to be built) the ranked tile inputs
(bucket cascade + morton codes + i16 deltas + Procrustes params) published
as version-stamped Postgres columns. The API crate owns endpoint shapes;
this crate provides the composable drivers. Daily warm refits; inserts land
between versions via encoder inference + occupancy upserts.

## Agreed with Bilal (do not relitigate)

- **API surface**: minimal, composable driver pieces; endpoint shapes live in
  the API crate. Nothing outside the crate touches pipeline internals.
  Everything `pub(crate)` until a surface is agreed item by item. Do NOT
  design/expose public API unilaterally. No `public = true` deps unless the
  boundary genuinely requires them.
- **No visibility modifiers on struct fields, ever** (no `pub(crate)`/
  `pub(super)` fields). Plain `pub` fields inside scoped structs, or private
  - accessors where invariants demand.
- **Frameworks**: stay on burn for training/inference (SupervisedTraining +
  Learner + file checkpointer for best-epoch restore). Framework moves are
  Bilal's call, always.
- **Storage**: filesystem for now, but core stages generic over
  `Write`/`AsyncWrite` sinks (his `query_embeddings` pattern) so they are
  adaptable (object storage later) and trivially testable. Paths only at the
  outermost layer.
- **rank.py is ported to Rust in this crate.** No Python remains in the repo
  at the end (this includes the tools/embedding2d oracle).
- **Shed the oracle**: no 1:1 umap-learn port long term. Replace pinned
  fixtures with property/invariant tests + thresholded quality metrics
  (trustworthiness, k-NN preservation on synthetic data) + per-refit tracked
  metrics in the refit report. This unlocks FMA/SIMD/operation-order work.
- **Benchmarking phase** comes with the perf/SIMD work: criterion-style
  benches, darwin kperf welcome.
- **Versions are immutable** (`/v{N}/`): refit publishes a new version;
  serving artifacts are cache-forever under it. In-place hotswap is the
  wrong model for serving state (fine for the sample cache).
- **Parallel optimizer**: rewrite WITHOUT atomics as deterministic
  sub-slice parallelism (see "Open threads"). Bilal explicitly dislikes the
  current recursive/atomic design.
- **Multiple links between the same pair** (multiplicity as degree/weight
  signal): OPEN DESIGN QUESTION. PRD 9.1 says multiplicity is not a layout
  signal; Bilal questions that. Do not decide alone; present options.

## Known facts (verified; do not re-derive wrongly)

- `entity_embeddings` HAS a unique index:
  `entity_embeddings_idx UNIQUE (web_id, entity_uuid, property) NULLS NOT
DISTINCT` (v009 migration, line ~153). Whole-entity embedding rows
  (`property IS NULL`) are unique per entity; draft state is intentionally
  ignored by sampling. The `draft_id IS NULL` filters I added were wrong and
  have been reverted.
- `degree > $1::DOUBLE PRECISION` in hub selection is correct:
  `percentile_cont` interpolates, so the hub cut is inherently fractional.
- The pinned oracle in tools/embedding2d is a PATCHED umap-learn
  (`grad_d = 0` for coincident negatives, per-vertex `rng_state_per_sample`).
  Stock umap-learn applies a 4.0 kick there. While oracle tests exist, match
  the patched oracle.
- TABLESAMPLE param types: percentage and REPEATABLE bind as
  `DOUBLE PRECISION` with explicit casts (live tests caught this).
- burn `Param` is lazily initialized: cloning an unmaterialized module gives
  every clone different random weights. Trained modules are materialized;
  synthetic test fixtures must round-trip a record first.
- burn-candle is deprecated upstream and is not used. Hardware-independent
  tests use NdArray CPU, while production SALT uses configured CubeCL Metal or
  CUDA with no CPU fallback.

## Current state (last verified: all green)

- 30 unit tests + 3 live-Postgres integration tests + 1 doctest passing;
  fmt clean; no broken intra-doc links.
- Live PG tests currently in `tests/postgres.rs` (external) but must move
  in-crate as `#[ignore = "requires live PostgreSQL"]` once visibility is
  reverted; they shadow real tables via session-temporary mirrors (pg_temp
  resolves first), never touching dev data.
- Working tree is dirty on top of commit "feat: slop umap" (8e3d835054):
  draft-filter revert + dead dim-check removal in `sample/cache.rs` and the
  `EmbeddingDimension` variant removal in `sample/mod.rs` are DONE and
  compiling. Everything below is NOT started.

## Resume here (post-compaction pointer)

Bilal approved executing queue items 1-3 now. I had just re-read Cargo.toml
and was about to start. Concrete next actions, in order:

1. Cargo.toml: delete every `public = true` marker and the burn-backend/
   burn-core/burn-tensor/burn-train/cxx/tempfile direct deps added only for
   the public-dependency lint; fold tokio/tokio-postgres/camino/bytes/
   hash-graph-embeddings/type-system back into the private sections; drop
   dev-dep duplicates that the main deps already cover.
2. Fold pipeline.rs into projection/mod.rs; artifact.rs -> artifact/{mod,
   warm,tests}.rs (warm.rs moves under artifact); delete pipeline.rs and
   warm.rs.
3. Visibility: every `pub` item back to `pub(crate)` (or private); fields
   get NO scoped modifiers (plain `pub` inside scoped structs, or private +
   accessor); fix existing `pub(super)` fields in umap/kernel.rs
   (OptimizerEdges), umap/curve.rs (CurveParameters), sample/relations.rs.
   lib.rs: modules become `pub(crate)`, delete the doctest (crate-private
   API), keep prose. Re-exports in projection/mod.rs and graph/mod.rs back
   to `pub(crate) use`.
4. Integration tests: VETOED moving them in-crate behind `#[ignore]`.
   Bilal's pattern: keep `tests/postgres.rs` as a real external integration
   target and add `#[doc(hidden)] pub mod _integration` at the crate root
   re-exporting exactly what the tests need (Sample, SampleOptions,
   Relations, QueryEdges; FloatBytes stays `pub` for signature visibility).
   Modules themselves go private, so the hidden module is the only public
   path in. package.json test:integration stays
   `cargo nextest run --package hash-graph-atlas --test postgres`.
   Keep `public = true` only for deps that leak through that hidden surface
   (expect tokio-postgres, camino, hash-graph-embeddings; annotate why).
5. Review fixes from the queue item 3 list below.
6. Validate: `cargo fmt -p hash-graph-atlas`, `cargo check -p
hash-graph-atlas --all-targets`, `cargo nextest run -p hash-graph-atlas`,
   `cargo nextest run -p hash-graph-atlas --run-ignored ignored-only`
   (needs the running hash-postgres container), clippy warning count should
   not regress (~170-207 pre-existing tolerated).

Files change under you: Bilal edits concurrently. Re-read EVERY file
immediately before editing it; reconcile, never clobber.

## Queue (in intended order)

1. Visibility revert: everything back to `pub(crate)`; remove all
   `public = true` from Cargo.toml; drop the lib.rs doctest (crate-private
   API); move PG tests in-crate behind `#[ignore]`; package.json
   test:integration -> `--run-ignored ignored-only`.
2. Structure: fold pipeline.rs into projection/mod.rs (the module IS the
   pipeline); move warm.rs under artifact/ (it consumes previous artifacts);
   keep the 500-line code rule.
3. Review fixes: `NonZero` option fields via `nz!` (macros.rs) instead of
   validate loops (drop InvalidSemanticOption-style variants);
   `transform_output(bool)` -> two explicit fold/unfold impls;
   `ProjectorError::Summary(String)` -> named variants (burn's summary error
   string wrapped as TrainingLog(String), separate MissingValidationLoss);
   `native_floats` -> `unsafe fn` + SAFETY at call sites; Debug impls for
   Relations/QueryEdges (restore expect_err in tests); select_hubs
   idempotency (DROP TABLE IF EXISTS + anti-join stream instead of DELETE).
4. De-oracle metric/property test suite FIRST (Bilal: "first build the
   suite, then muck around with the implementation"). Then delete Python
   oracle fixtures/tooling.
5. Parallel optimizer rewrite (no atomics), gated on that suite:
   symmetric edge list already contains both directions -> self-moves only
   (uwot batch=TRUE precedent) + double-buffered epochs (read prev
   snapshot, write own disjoint row slices). Deterministic across thread
   counts (kills spurious refit drift). Compensate halved per-pair
   attraction (double attractive coefficient or halve repulsion); Adam is
   the fallback lever. Acceptance gate: trustworthiness/k-NN preservation
   parity within modest epoch overhead, else keep async semantics and only
   beautify the atomic version.
   Memory-model note (do not "fix" blindly): the current Relaxed atomics
   are not UB and lose no single-word updates (CAS retry); Relaxed is the
   right ordering since nothing is published. The defect is algorithmic
   read inconsistency (mixed x/y, stale gradients) inherent to
   Hogwild-style async SGD; stronger orderings would NOT help.
6. New spec stages: Procrustes align + params, full-corpus projection,
   i16 deltas (global lsb = span/65536), rank pass port (buckets + morton),
   occupancy maintenance, versioned PG publication of layout columns,
   manifest inputs. Insert-path projection primitives for the API crate.
7. Perf/SIMD/benchmark phase (after metrics exist).

## Do not repeat (I did these; Bilal caught them)

- Making everything public / designing the API without asking.
- Replacing framework machinery (burn Learner) with hand-rolled loops.
- Asserting a schema bug without checking indexes in migrations AND live DB.
- Clobbering concurrent edits: files change under you mid-session; re-read
  before every edit; reconcile, don't overwrite.
- Stringly-typed error variants; bool-parameter mode switches; dead
  defensive checks against DB-guaranteed invariants; scoped-visibility
  fields; validate-loops where NonZero types fix it statically.
- Trusting an outline/selection over the current file content.
