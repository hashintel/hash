# PRD: Atlas Track A (data/audit) + Track C (layout gate battery)

**Language:** Python 3.12+. **Consumer:** the Semantic Atlas pipeline
(see `atlas-unified-spec.md`); these components gate and feed a Rust/burn
projector trainer that is explicitly out of scope here.

**Working style expected:** every metric and generator ships with a test
that could fail; determinism everywhere (seeded, no wall-clock, no
network in tests); artifacts carry provenance (input hashes, config,
seed, versions) in a JSON sidecar. Prefer boring code over clever code.

---

## 0. Shared contracts

### 0.1 Raw float matrix files

Embeddings and coordinates are exchanged as raw row-major float32 files
(no header), with a JSON sidecar `<name>.meta.json` (sidecar name appends
to the full binary filename: `X.f32` -> `X.f32.meta.json`). The sidecar is
a provenance envelope; the matrix contract lives under `details`:

```json
{
  "producer": "...",
  "created_at": "...",
  "tool_version": "0.1.0",
  "config": null,
  "config_hash": null,
  "input_hashes": null,
  "seed": null,
  "details": {
    "dtype": "f32",
    "dim": 3072,
    "rows": 986432,
    "byte_order": "little",
    "content_sha256": "...",
    "extra": null
  }
}
```

Only `producer`, `created_at`, and `details` are required; `config` and
`config_hash` must be set together (the hash is over the canonical JSON of
`config`, sorted keys, compact separators, UTF-8).

Loader MUST validate: file size == `rows * dim * 4`; reject otherwise with
an error naming the mismatch. (The Rust consumer follows this envelope
contract; do not add headers to the binary.)

### 0.2 Layout artifacts

A layout is `layout.npz` with `xy` (n, 2) float32 and `row_id` (n,) int64,
plus a sidecar `layout.meta.json` recording engine, config hash, seed,
and source-embedding hash. The battery consumes ONLY this format; it must
never import engine code.

### 0.3 Repo layout

```
atlas-tools/
  audit/        # W1
  wikidata/     # W2
  battery/      # W3
  fixtures/     # small committed synthetic fixtures (< 5 MB total)
  tests/
  pyproject.toml  (uv-compatible; numpy, scipy, scikit-learn,
                   umap-learn, hnswlib or faiss-cpu, pyyaml, click)
```

CLI entry points via `click`; typed YAML configs; `pytest -q` green from
clean checkout; no GPU assumed.

---

## W1: Prefix representation audit

**Purpose:** measure the information ceiling of truncated-and-renormalized
embedding prefixes. Map neighbor recall can never exceed prefix neighbor
recall; every projector gate downstream references this number.

### Functional requirements

1. `audit run --embeddings X.f32 --dims 128,256,512,1024 --k 15,30,50
--sample 20000 --strata strata.parquet --out report/`
2. Prefix transform: take first d components, L2-normalize AFTER
   truncation, epsilon-guard zero norms, reject non-finite. This exact
   function is exported for reuse and covered by test vectors.
3. Ground truth: exact cosine kNN on the FULL 3072-d vectors for the
   sampled queries against the full corpus (blockwise matmul; do not
   materialize an n x n matrix; memory cap configurable).
4. Candidates: exact kNN in each prefix space for the same queries.
5. Metrics per (dim, k): recall@k vs full-vector truth; intrusion rate
   (prefix neighbors not in full top-3k); mean rank displacement.
6. Stratified reporting: if a strata table is provided (row -> group
   labels: role, type family, language, source, density decile, time
   cohort), report every metric per group and flag any group worse than
   2x the overall degradation.
7. Output: `report.json` (machine) + `report.md` (human, one table per
   k) + the sidecar provenance block.

### Acceptance

- Synthetic fixture where prefix dims provably lose information
  (e.g. signal in dims 400-512): recall@15 for d=256 measurably below
  d=512, and the test asserts the ordering.
- Deterministic across runs at fixed seed.
- 1M x 3072 corpus completes on a 32 GB machine (blockwise; document the
  block size math).

---

## W2: Wikidata miner, two consumers, two data paths

**Purpose:** feed (a) relation cards for the relation-policy classifier
and (b) a sampling manifest for vec2slug retraining. THE FULL DUMP IS
REQUIRED ONLY FOR (b), which is the last milestone; (a) uses APIs and
moves megabytes.

### W2a: property extractor (relation cards) — NO DUMP

1. Property inventory via SPARQL (query.wikidata.org): all properties
   with datatype wikibase-item (~2k of ~12k total; external-identifier
   properties are the majority and are excluded), plus constraints
   (P2302), inverse (P1696), and subject/value type constraints.
2. Full property documents via wbgetentities in batches of 50 (~40
   calls): labels, descriptions, aliases for configured languages.
3. Example pairs per property with a fallback ladder: WDQS LIMIT query
   -> QLever public Wikidata endpoint for properties that time out ->
   skip with a recorded flag. Diversity via multiple offsets or a
   subject-class GROUP BY where the endpoint supports it.
4. Politeness: configurable rate limit, exponential backoff, all
   responses cached to disk keyed by (query hash, endpoint, date);
   a full rerun against a warm cache makes zero network calls.
5. Snapshot semantics: record retrieval timestamps per property; the
   cards manifest records the API-snapshot date in place of a dump SHA.

### W2b: entity manifest (vec2slug) — dump-shaped, LAST milestone

1. Gate: runs only when vec2slug retraining is scheduled; the
   Wikidata5M pilot (prebuilt download) precedes it per the runbook.
2. STREAM, NEVER STORE: read the JSON dump as `download | parallel
bzip2 -dc | field extractor`, persisting nothing but the output
   parquet (QID, P31 list, sitelink count, label-length stats). The
   dump must never be written to disk; peak local storage is the
   manifest plus checkpoints.
3. Restartable via HTTP range + byte-offset checkpoints; resume after
   kill produces identical output (idempotence test as below).
4. Parser budget: field extraction only (orjson or simdjson bindings),
   no full-document model; document measured MB/s on a 1 GB slice and
   the projected end-to-end wall time. Deployment note: intended to run
   on a high-bandwidth EU host near the dump mirrors, not a laptop.
5. Dump date and SHA (from the mirror's checksum file) recorded in the
   manifest without hashing the stream locally.

### Functional requirements (shared)

1. Restartable via checkpoint, provenance in every output.
2. **Property extraction scope** (relation-card consumer): entity-valued
   properties only (datatype wikibase-item). Exclude by default:
   external identifiers, Wikimedia-maintenance properties, deprecated
   properties. For each retained property collect: PID; labels, descriptions,
   aliases for configured languages; datatype; inverse property (P1696);
   symmetry/transitivity/uniqueness constraints (P2302 parse: document
   which constraint types are parsed and ignore the rest explicitly);
   subject/value type constraints; usage count (for sampling ONLY, never
   emitted as a semantic field); a bounded diverse example set
   (subject/object label pairs, configurable count, sampled
   deterministically across distinct subject types).
3. **Emitter 1, relation cards:** serialize per the atlas spec §9.2 field
   order with the §9.3 token-budget rules (configurable budget, default
   6000 tokens by the tiktoken cl100k tokenizer as a proxy; field-aware
   truncation: drop lowest-priority examples first, then sentence-boundary
   truncate endpoint descriptions; never truncate identifiers, titles,
   or structural flags mid-field; record omitted fields and final token
   count; severe-truncation flag). Output JSONL: one card per property
   with card_hash (sha256 of canonical serialization), plus a cards
   manifest. NO embedding calls: embedding is a separate, budgeted step
   outside this tool.
4. **Emitter 2, vec2slug sampling manifest:** P31-stratified entity
   sampling plan (entity QID, P31 class, sitelink count, label length
   stats) emitted as parquet, WITHOUT fetching or serializing entity
   documents; the downstream corpus builder consumes this manifest. The
   stratification must be configurable (per-class caps, floor for rare
   classes).
5. Both emitters share the single dump pass (multiplexed), or two passes
   with a shared extraction cache; either is acceptable if restartable
   and documented.

### Acceptance

- Golden tests on a committed 200-entity dump excerpt: known properties
  (e.g. P361 part-of, P50 author) produce byte-stable cards; token budget
  respected; inverse linkage correct; exclusion rules drop P212-style
  identifiers.
- Kill -9 mid-run and resume produces identical outputs to an
  uninterrupted run (idempotence test).
- Full-dump wall-clock estimate documented from a measured 1 GB slice.

---

## W3: Layout gate battery

**Purpose:** the engine-agnostic instrument that accepts or rejects
layout engines and loss-term changes. Consumes layout.npz artifacts;
never imports engine code. This is the release gate for Phase 2 of the
atlas spec; treat metric correctness as the product.

### W3.1 Planted-shape generators

Each generator emits (embeddings f32, edges int64 pairs, labels, ground-
truth descriptor) at configurable n (default 20k), seeded:

- `bipartite_star`: documents with k items each, items degree 1;
  optional multi-parent fraction.
- `clique_communities`: c communities, dense intra-edges, embedding
  clusters aligned with communities.
- `chains`: document-flow chains of configurable depth (order -> item ->
  movement -> delivery), embeddings clustered by TYPE not by chain.
- `lattice_product`: two categorical factors, embeddings near the sum of
  factor vectors (produces ring/sheet structure).
- `noise_edges`: clustered embeddings + uniformly random edges.
- `isolates`: fraction of nodes with zero edges.
- `mixed`: weighted combination of the above in one dataset.

### W3.2 Metrics (each a pure function of layout + ground truth)

1. **Merge-tree leaf persistence** (primary structure metric). Spec:
   density raster via 2D histogram at grid 1024 + gaussian blur,
   bandwidth 4 px over the layout's own extent; threshold sweep
   descending over unique density levels above floor_frac=0.005 of max;
   union-find with per-component birth level; a component whose peak
   persistence (birth - merge level) < persistence_frac=0.05 \* birth is
   merged, else recorded as a leaf; report leaf count and total leaf
   persistence normalized by density max. Calibration: on the operator's
   real 986k-point reference layout this must reproduce leaves within
   +-3% and normalized persistence within +-5% of the reference values
   supplied in the fixtures manifest.
2. kNN recall@15/30/50 of layout neighborhoods vs embedding-space truth;
   trustworthiness and continuity (sklearn).
3. Community separation (silhouette on planted labels) where labels exist.
4. Pendant diffusion: median layout distance of degree-1 nodes to their
   partner's cluster centroid, normalized by layout std.
5. Edge binding: median layout distance across relation edges vs a
   size-matched random-pair baseline (report the ratio).
6. Contraction factor: layout std relative to a same-seed no-relation
   baseline layout when one is provided.
7. Rerun-noise floor: run the engine command s times (default 3) at
   different seeds, report per-metric spread; every comparative claim in
   the report is annotated against this floor.
8. **No-structure-from-noise differential (hard assertion):** on
   `noise_edges`, any engine configuration using edges MUST NOT improve
   community separation or persistence beyond the noise floor relative
   to the same engine with edges disabled. This is a pass/fail gate, not
   a reported number.

### W3.3 Baselines and harness

- Baseline runners producing layout.npz via subprocess/CLI: PCA-2D and
  tuned umap-learn (config-driven; document the tuning grid). The
  operator's engines integrate by emitting the same artifact; the
  battery's engine interface is "a command that reads embeddings/edges
  and writes layout.npz".
- `battery run --suite suites/phase2.yaml --engines engines.yaml --out
runs/<ts>/`: executes generators x engines x seeds, computes all
  metrics, emits `results.parquet`, `report.md` (per-shape tables with
  noise-floor annotations), and `gates.json` (pass/fail per configured
  threshold).
- Threshold config: gates expressed as "candidate >= baseline - margin"
  or absolute bounds, in YAML, versioned.

### Acceptance

- umap-learn baseline PASSES the default suite; a row-shuffled layout
  FAILS every structure gate (committed test).
- A rigged engine that inflates density contrast by collapsing points
  (contraction) does NOT gain persistence after normalization (test).
- The noise differential catches an engine that manufactures clusters
  from random edges (test with a deliberately cheating toy engine).
- Full default suite (7 shapes x 3 engines x 3 seeds at n=20k) completes
  in < 60 minutes on 8 cores.

---

## Non-goals

No Rust/burn code; no embedding API calls or network access; no relation-
policy classifier training (Track B); no serving/tiles/client work; no
attempt to make umap-learn deterministic under parallelism (use the seed-
spread machinery instead).

## Milestones

1. W3.1 + W3.2 metrics with tests (the battery is the priority).
2. W3.3 harness + baselines + gates; calibration against the reference
   layout fixture values.
3. W1 audit tool.
4. W2a property extractor + card emitter (API path, no dump).
5. W2b entity manifest (streaming dump job) only when vec2slug
   retraining is scheduled; Wikidata5M pilot precedes it.

## Definition of done

Clean checkout -> `pytest -q` green -> `battery run` on the default suite
produces a report in which every number is reproducible from the manifest
alone, and the three adversarial acceptance tests (shuffled, contracting,
cheating-noise engines) fail exactly as specified.
