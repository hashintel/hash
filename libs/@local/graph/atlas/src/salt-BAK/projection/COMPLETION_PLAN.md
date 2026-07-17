# Atlas Projection Completion Plan

- **Status:** Baseline implemented; production-scale evaluation (section 8) outstanding
- **Last updated:** 2026-07-10
- **Scope:** `libs/@local/graph/atlas/src/projection`
- **Design source of truth:** [`PRD.md`](./PRD.md)

## Purpose

This document is the execution checklist for finishing the Atlas projection pipeline. It separates work required for the first production-capable end-to-end version from later hardening and optimization.

The baseline is not complete until a real PostgreSQL sample can flow through relation extraction, semantic and relation graph construction, UMAP layout fitting, structure-feature generation, projector training, and durable artifact publication.

## Constraints that remain in force

- Correctness and performance take precedence over dependency count.
- PostgreSQL performs relational identity mapping, deduplication, degree statistics, and hub selection.
- The repeatable-read transaction ends before HNSW, PCA, UMAP, feature generation, or projector training.
- Embeddings and persisted layouts remain mmap-backed.
- Structure features are transient owned `FloatBytes`; they do **not** need a file or mmap.
- Sampled row IDs and graph endpoints remain `u32` until indexing Rust slices.
- No dense `O(n²)` allocation is permitted.
- Relation diffusion prunes during row construction.
- Parallel UMAP must not use non-atomic racing writes.
- Persisted outputs use temporary-file hotswapping without pre-removing the destination.
- Error implementations remain explicit; do not add derive-helper error macros.
- Plain UMAP is the production behavior. The measured densMAP experiment is rejected.

## Implemented baseline components

- [x] Cold and hot sample-cache paths.
- [x] Native-endian mmap-backed sampled embeddings.
- [x] PostgreSQL binary COPY persistence for sample identity mappings.
- [x] Temporary sampled-identity table inside a repeatable-read transaction.
- [x] PostgreSQL relation endpoint mapping, canonicalization, deduplication, degree calculation, hub selection, and hub-edge removal.
- [x] Ordered symmetric relation streaming using `u32` row IDs.
- [x] `sprs` semantic, relation, and fused sparse graphs.
- [x] USearch/HNSW cosine k-NN extraction from mmap-backed embeddings.
- [x] UMAP fuzzy-set construction checked against the pinned Python oracle.
- [x] Bounded relation diffusion checked against the pinned Python oracle.
- [x] Serial UMAP conformance implementation.
- [x] Safe atomic parallel UMAP implementation.
- [x] Alpha-ladder fitting with rung-to-rung coordinate warm starts.
- [x] Native-endian mmap-compatible `layout-aXXX.f32` persistence.
- [x] Bounded-memory PCA initialization using `faer`.
- [x] Oracle-backed structure-feature generation:
  - embedding;
  - deterministic capped neighbor mean;
  - coherence;
  - fit-time normalized true degree.
- [x] In-memory `FloatBytes` backing for transient structure features.
- [x] Projector training against structure features rather than raw embeddings.
- [x] Projector weight warm-chaining between alpha rungs.

## Remaining baseline work

Complete these sections in order unless a discovered correctness issue requires revisiting an earlier stage.

### 1. Exercise the PostgreSQL lifecycle against a real database

The relation SQL currently compiles as Rust but still needs live PostgreSQL coverage.

- [x] Add Atlas PostgreSQL integration coverage using the repository's established database test harness.
- [x] Verify the cold sample path creates matching embedding and mapping rows.
- [x] Verify the hot path restores the same sampled identity mapping from binary COPY.
- [x] Verify self-relations are removed.
- [x] Verify directional and parallel duplicates collapse to one canonical undirected pair.
- [x] Verify degree statistics are calculated after deduplication.
- [x] Verify the quantile and median-ratio hub thresholds against a small known graph.
- [x] Verify hub identities are returned as stable `EntityId` values in sampled-row order.
- [x] Verify every streamed endpoint is a valid `u32` sampled row.
- [x] Verify streamed adjacency is strictly ordered and symmetric.
- [x] Verify `Sample::finish` commits and releases the transaction before local numerical work.
- [x] Verify a transaction or relation-extraction failure does not publish layout artifacts.
- [x] Fix any SQL behavior discovered by these tests rather than mocking around it.

**Acceptance:** cold and hot paths produce equivalent relation behavior on a known fixture, and transaction release is observable before HNSW/PCA/UMAP work begins.

_Delivered by `tests/postgres.rs`, which runs against the live development server using
session-temporary mirrors of `entity_embeddings`/`entity_edge` (real graph data is shadowed,
never read or written). The suite immediately caught three real SQL bugs, all fixed: missing
`draft_id IS NULL` filters (duplicate sampled identities), `TABLESAMPLE`/`REPEATABLE`
parameter type mismatches, and an `int8`-inferred hub-degree comparison._

### 2. Finish projector-training correctness

The projector is connected to the right feature matrix and warm-chains weights, but its training contract still needs to match the prototype's stable behavior.

- [x] Compute per-axis layout center and scale for each alpha level.
- [x] Train against standardized coordinates.
- [x] Fold de-standardization into the final linear layer, or preserve an equivalent serialized output transform.
- [x] Report validation RMSE in layout units for each alpha.
- [x] Confirm the first projector uses the full epoch budget and later rungs use the chained budget.
- [x] Confirm rung-to-rung weight initialization actually preserves the previous fitted weights on the selected Burn backend.
- [x] Replace user/configuration-dependent projector panics with a manual `ProjectorError` and explicit validation.
- [x] Handle invalid batch size, epoch count, validation split, learning rates, row counts, and target dimensions.
- [x] Ensure early stopping returns or restores the best validation model rather than an arbitrarily later epoch.

**Acceptance:** a small deterministic training test reduces validation error, returns finite raw-layout coordinates, and demonstrates that chained initialization starts from the previous rung's weights.

### 3. Publish complete serving artifacts

Layouts are persisted, but trained models and their fit-time serving state are not yet durably published.

- [x] Select the Burn model record format compatible with the intended serving backend.
- [x] Persist one model per alpha using stable names such as `encoder-a100`, `encoder-a075`, and so on.
- [x] Publish models through temporary-file hotswapping without deleting the existing destination first.
- [x] Persist stable hub identities; never persist sample-local hub row indices as serving identity.
- [x] Persist and validate feature metadata:
  - feature specification and ordering;
  - embedding/MRL dimension;
  - neighbor cap;
  - SplitMix64 salt;
  - fit-time degree normalizer;
  - alpha level;
  - model/input dimensions;
  - artifact-format revision.
- [x] Add a loader that validates metadata before accepting a model.
- [x] Add a model serialization round-trip test that compares inference before and after loading.
- [x] Verify publication failure leaves the previous model or metadata file intact.

**Acceptance:** a fresh process can load hubs, metadata, and every alpha projector and reproduce the in-memory projector output within the backend's numerical tolerance.

### 4. Complete refit warm-start behavior

Warm starts currently work within one alpha ladder. Warm starts between separate refits remain incomplete.

- [x] Define the production input for a previous alpha-1.0 layout and projector generation.
- [x] Reuse prior coordinates directly when the sampled row ordering is unchanged.
- [x] For a changed sample, implement one measured strategy from the PRD priority order:
  - stable identity matching plus semantic-neighbor placement for new rows; or
  - previous-projector inference for the new sample.
- [x] Load the previous alpha-1.0 projector as the first projector's initial weights when compatible.
- [x] Fall back cleanly to PCA/new projector initialization when previous artifacts are absent or incompatible.
- [ ] Measure carried-over entity drift and new-entity placement quality. _(Blocked on a
      production-scale sample; the mechanisms are implemented and unit-tested, the measurement
      belongs to the section 8 evaluation run.)_

**Acceptance:** repeated fitting with compatible prior artifacts is visibly stable, while stale or incompatible artifacts produce an explicit fallback rather than corrupt initialization.

### 5. Expose one complete production lifecycle

The implemented pieces are currently crate-private and have no production call site.

- [x] Define the minimal public entry point and option types needed by the Atlas caller.
- [x] Orchestrate:
  1. sample load;
  2. PostgreSQL relation extraction;
  3. transaction finish;
  4. PCA or supplied warm initialization;
  5. semantic graph construction;
  6. alpha-ladder layout fitting;
  7. transient structure-feature generation;
  8. projector fitting;
  9. hub, metadata, model, and layout publication.
- [x] Return useful per-stage artifacts and metrics without retaining unnecessary sparse graphs or training buffers.
- [x] Drop the transient structure-feature `Bytes` once projector fitting completes.
- [x] Ensure no API permits accidentally carrying `Sample`'s transaction into numerical work.

**Acceptance:** one caller can run the complete fit without reaching into private stage modules, and resource lifetimes follow the intended database/memory boundaries.

### 6. Close baseline test coverage

- [x] Keep the pinned oracle differential tests for semantic graph, relation graph, feature generation, fusion, and serial UMAP.
- [x] Add projector normalization and serialization tests.
- [x] Add a small end-to-end pipeline smoke test.
- [x] Add malformed-shape/index/configuration tests for every manual error boundary.
- [x] Add output hotswap failure tests where failure can be induced deterministically.
- [x] Run the live PostgreSQL integration suite.
- [x] Run full crate formatting, checking, clippy, unit tests, and doc tests.

**Acceptance:** all baseline stages have either a deterministic unit/oracle test or a live integration test, and the full crate validation is green apart from explicitly documented pre-existing warnings.

### 7. Add baseline observability

Use the repository's established tracing conventions rather than progress bars embedded in numerical code.

- [x] Sample rows, dimensions, cache path, and hot/cold status.
- [x] Relation rows before/after deduplication and hub removal.
- [x] Degree median, quantile cutoff, and hub count.
- [x] HNSW configuration, build/query duration, and resulting graph size.
- [x] Relation diffusion candidates/retained counts and graph size.
- [x] PCA sketch size and duration.
- [x] Per-alpha fused graph size, epochs, duration, and final objective diagnostic.
- [x] Structure-feature duration, dimensions, and memory size.
- [x] Per-alpha projector duration and validation RMSE in layout units.
- [x] Artifact paths and byte sizes.

**Acceptance:** a production run identifies which stage dominates time or fails without logging individual embeddings or high-volume row data.

### 8. Run and record a representative production-scale evaluation

_Outstanding: this section needs a production-scale database and a dedicated evaluation run;
it cannot be produced from unit or fixture-scale integration tests. The tracing added in
section 7 and the returned `FitMetrics` provide the stage timings and sizes this run records._

- [ ] Run the default configuration, or the largest operationally representative sample available.
- [ ] Record peak RSS separately for sampling, HNSW, graph construction, UMAP, feature generation, and projector training.
- [ ] Record stage timings and persisted artifact sizes.
- [ ] Record HNSW recall on an exact-search-capable subset.
- [ ] Record UMAP topology/global metrics and projector RMSE for the alpha ladder.
- [ ] Confirm there is no accidental `O(n²)` allocation.
- [ ] Confirm transient feature memory is released after projector training.

**Acceptance:** the default-scale run finishes within operational memory/time limits, and its measurements are saved with the implementation revision and configuration.

## Post-baseline hardening and optimization

Do not start these items until the end-to-end baseline above is complete and validated.

- [ ] Make ordinary unit tests independent of committed oracle files.
- [ ] Retain a separate pinned-oracle differential/conformance suite.
- [ ] Audit `Knn` construction, validation, self-neighbor repair, scans, and conversions.
- [ ] Audit arithmetic ordering and suboptimal FLOPs; only change oracle-sensitive arithmetic after quality comparison.
- [ ] Benchmark FMA formulations rather than enabling them solely to satisfy clippy.
- [ ] Benchmark USearch compressed storage and optional exact reranking.
- [ ] Measure HNSW recall, downstream graph quality, layout quality, runtime, and memory together.
- [ ] Evaluate `portable_simd` in measured hot loops, following the embeddings k-means precedent.
- [ ] Parallelize or further bound structure-feature generation only where profiling justifies it.
- [ ] Consider persistence of HNSW or sparse intermediates only if rebuild cost is operationally significant.
- [ ] Add further deterministic parallel-layout quality and rung-drift benchmarks.

## Explicitly rejected work

- **densMAP:** rejected for the Atlas use case. On the 20,000-row, 200-epoch, seed-42 sweep it improved radius-density correlation but reduced k-NN recall from approximately `0.38` to `0.09`, reduced trustworthiness, worsened global-distance metrics and projector RMSE, and increased runtime. Do not implement or expose it without materially different data/objectives and a new evaluation.
- **Kiddo/k-d tree for 512D semantic search:** rejected as the baseline. USearch/HNSW remains the high-dimensional ANN implementation.
- **A custom generic CSR implementation:** rejected. Continue using `sprs` plus specialized bounded row kernels.
- **Unsafe non-atomic Hogwild coordinate updates:** rejected. Keep the safe atomic/partitioned parallel optimizer.

> another rule: if you have more than like 3 arguments, it's probably time to create a struct that houses them _especially_ if they're of the same type, like e.g. `foo, bar, context` or smth like that
