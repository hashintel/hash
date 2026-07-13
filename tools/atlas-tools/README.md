# atlas-tools

Python tooling for the Semantic Atlas pipeline:

- **`audit/`** measures the information ceiling of truncated-and-renormalized
  embedding prefixes against the full vectors (recall@k, intrusion rate, rank
  displacement, stratified by group). Map neighbor recall can never exceed
  prefix neighbor recall, so this number bounds every projector downstream.
- **`wikidata/`** mines Wikidata on two paths. The API path extracts
  entity-valued property inventories via SPARQL and wbgetentities and emits
  relation cards without touching the dump. The dump path streams the JSON
  dump (never storing it) into a P31-stratified entity sampling manifest for
  vec2slug retraining.
- **`battery/`** is the engine-agnostic layout gate battery: planted-shape
  generators, structure metrics (merge-tree leaf persistence, kNN recall,
  trustworthiness and continuity, pendant diffusion, edge binding,
  contraction), baselines (PCA-2D, umap-learn), rerun-noise floors, and
  pass/fail gates including the no-structure-from-noise differential.
- **`common/`** holds the shared contracts: raw f32 matrix and layout
  artifact I/O, provenance envelopes, blockwise exact cosine kNN, and the
  prefix transform.
- **`relation_cards/`** owns the canonical relation-card format and its
  datasource adapters. Wikidata records and live HASH SemType link types pass
  through the same identifier-free renderer and truncation rules.

## Setup and development

Requires Python 3.14 (pinned in `.python-version`) and
[uv](https://docs.astral.sh/uv/).

```sh
uv sync --extra dev                 # create/refresh the venv
uv run pytest -q                    # full test suite (offline, deterministic, ~90s)
uvx ty check atlas_tools tests      # type check
uvx ruff check                      # lint
uvx ruff format --check             # formatting
```

All three gates are required before merging: tests green, `ty` clean, and
`ruff` clean (check and format). There is no allowlist; new diagnostics are
regressions. Ruff runs with `select = ["ALL"]`; every disabled rule in
`pyproject.toml` carries a comment explaining why, and `# noqa` needs an
inline justification.

## Design conventions

The codebase is fully typed, and the types are the design rather than
decoration:

- **No `typing.Any`** (enforced by lint). Genuinely opaque JSON is
  `JsonValue` / `JsonDict`; values merely passed through are `object`.
- **Shared type vocabulary** (`atlas_tools.common.data`): values that cross
  package boundaries carry branded or validated types instead of bare
  primitives. `Sha256Hex` pattern-validates every digest field at model
  boundaries, `Fraction` pins proportions to [0, 1], and the `Dim`/`K`
  NewTypes keep dimensionalities and neighborhood sizes from silently
  swapping. Domain vocabulary stays in its package: `wikidata.model` brands
  property ids (`Pid`), item ids (`Qid`), and their union (`EntityId`), so
  a QID flowing into a PID slot is a type error. Brands are applied at
  genuine entry points (parsers, sidecar loads, CLI); wrapping deep inside
  arithmetic is noise, not safety.
- **Discriminated unions are the dispatch.** Polymorphic configuration is a
  pydantic union tagged by a `Literal` field; there are no registries and no
  string comparisons. See `battery/generators.py` (`Generator`, tag `shape`)
  and `battery/gates.py` (`GateConfig`, tag `type`); evaluation uses
  `match` with `assert_never`. Closed string sets are `Literal` or `StrEnum`.
- **Structured payloads are models.** Anything crossing a function or file
  boundary is a pydantic model (`extra="forbid"` for config-like models) or
  a frozen dataclass. Plain dataclasses carry numpy arrays and hot-path rows
  (for example `battery.datasets.Dataset` and `wikidata.dump.EntityRow`; the
  dump stream is deliberately not pydantic-validated).
- **Determinism.** Everything is seeded via `np.random.default_rng(seed)`;
  identical (config, seed) yields identical bytes. Tests make no network
  calls and read no wall clock. `created_at` is the only wall-clock field
  anywhere and is excluded from all hashes.
- **Python 3.14 idioms.** PEP 695 (`type X = ...`, `class C[T]`) and `Self`.
  Annotations evaluate lazily under PEP 649, so
  `from __future__ import annotations` is banned by lint. No bare
  `# type: ignore`. Names avoid abbreviations unless they are universally
  understood or mathematical.
- **Docs.** Comments and docstrings are ASCII (mathematical notation
  excepted), title-first (one-line summary, blank line, details), affirmative
  (state what something is and guarantees, in concrete terms), and
  self-contained (no citations of external design documents). Inline comments
  exist to carry intent, constraints, or tradeoffs; a comment that narrates
  the code should be deleted.

## Shared contracts (`atlas_tools/common`)

- **Raw f32 matrices** (`common.matrix`): headerless row-major little-endian
  float32 with a `<name>.meta.json` sidecar appended to the full filename
  (`X.f32` and `X.f32.meta.json`). Loaders validate that the file size equals
  `rows * dim * 4` and reject mismatches with an error naming the mismatch.
- **Layouts** (`common.layout`): `layout.npz` with `xy` (n, 2) float32 plus
  `row_id` (n,) int64, and a `layout.meta.json` sidecar. A missing sidecar is
  a hard error (`require_provenance=False` exists for ad-hoc inspection). The
  battery consumes only this format and never imports engine code.
- **Provenance envelopes** (`common.provenance`): every artifact sidecar is a
  `Provenance[TDetails, TConfig]` carrying producer, `created_at`, tool
  version, typed `config` with a `config_hash` that is validated on load (so
  tampering is detected), `input_hashes`, `seed`, and artifact-specific
  fields nested under `details`. Build with `SomeProvenance.make(...)`,
  persist with `.write(path)` and `.load(path)`. The nesting is deliberate:
  adding envelope fields never breaks existing loaders. Only `producer`,
  `created_at`, and `details` are required, so foreign producers (for
  example a Rust pipeline) can write minimal sidecars.

## CLIs

Console scripts are installed in the venv (`uv run <name> ...`).

### `audit`

```sh
uv run audit export-postgres --out X.f32 --strata-out strata.parquet
uv run audit run --embeddings X.f32 --dims 128,256,512,1024 --k 15,30,50 \
    --sample 20000 --strata strata.parquet --out report/
# Force a backend when needed; auto prefers Metal/CUDA/ROCm and falls back to CPU.
uv run audit run --embeddings X.f32 --dims 512 --k 50 --sample 1000 \
    --backend gpu --memory-cap-gb 4 --out report-smoke/
uv run audit synth-fixture --out X.f32   # synthetic acceptance fixture
```

`export-postgres` streams whole-entity rows (`property IS NULL`) directly from
the graph database. It writes the raw little-endian f32 matrix and provenance
sidecar required by `audit run` without holding the corpus in memory. With
`--strata-out`, the same cursor writes a row-aligned parquet containing `web_id`,
`entity_type_title`, and `entity_type_base_url`; missing type metadata is null.
Connection options read `HASH_GRAPH_PG_HOST`, `HASH_GRAPH_PG_PORT`,
`HASH_GRAPH_PG_USER`, `HASH_GRAPH_PG_PASSWORD`, and `HASH_GRAPH_PG_DATABASE`, with
the local development defaults available through `--help`.

`run` samples **queries**, not candidate corpus rows: every sampled query is still
compared exactly with every corpus row. The work is therefore proportional to
`sample × corpus rows × (full pass + prefix passes)`. The default sample is 20,000;
use 500–1,000 for a smoke run before starting the full audit.

Exact cosine kNN uses FAISS `IndexFlatIP` over L2-normalized vectors. Corpus blocks
are streamed through a flat index and FAISS merges their top-k results, so no full
query-by-corpus score matrix or normalized corpus is retained. `--backend auto` uses
Metal on supported Apple Silicon wheels, CUDA/ROCm where exposed by FAISS, and
otherwise FAISS's multithreaded CPU backend. FAISS 1.14.3 Metal retains each search's
distance buffer for the process lifetime, so Metal corpus blocks run in bounded
spawned workers; each worker exits before the next block, returning those allocations
to the OS. `--memory-cap-gb` sizes those worker blocks and the estimated audit-owned
arrays and FAISS workspace. It is not a hard process RSS cap because mapped input
pages and backend allocator bookkeeping are outside that estimate.

Progress is written to stderr for each full/prefix pass with completed exact
comparisons, throughput, and ETA. Use `--quiet` to suppress it. `run` writes
`report.json` (the source of truth; `report.md` and the returned `RunnerReport` are
both derived from the file on disk) plus a `report.meta.json` provenance envelope.

### `battery`

```sh
uv run battery run --suite suites/smoke.yaml --engines engines/default.yaml \
    --out runs/dev/ --jobs 4
uv run battery calibrate --layout layout.npz --manifest calibration.yaml
uv run battery generate --shape chains --n 800 --seed 0 --out dataset/
```

- Suites (`suites/*.yaml`) validate into `harness.Suite`; dataset entries are
  `{shape, n, params}` and validate directly into `Generator` union
  instances. `suites/smoke.yaml` runs in seconds; `suites/phase2.yaml` is the
  full release-gate suite.
- Engines (`engines/*.yaml`) are subprocess commands that read embeddings and
  edges and write `layout.npz`; the battery never imports engine code.
  `command_no_edges` is required to evaluate the noise differential, and an
  edges-consuming engine without it fails closed.
- A run writes `results.parquet` (tidy long format), `report.md` (every cell
  annotated with the rerun-noise spread), `gates.json` (typed `GatesReport`),
  and `manifest.json` (a provenance envelope with config hashes, dataset
  hashes, seeds, and library versions). Every reported number is reproducible
  from the manifest alone.

### `hash-cards`

```sh
uv run hash-cards extract-cards --out hash-cards/ \
    --tokenizer heuristic --sentence-splitter naive
```

`hash-cards` selects directly from the live HASH PostgreSQL database. In one
repeatable-read transaction it loads active entity-type versions, keeps the
latest version of each logical type, identifies SemType link types through
their resolved Link ancestor, and reverses every latest source type's resolved
`closed_schema.links` map into source and destination summaries. It writes
`link-types.jsonl`, `cards.jsonl`, and `cards.manifest.json`; source URLs and
database identities remain in JSONL metadata and never enter `card_text`.

Database settings read `HASH_GRAPH_PG_HOST`, `HASH_GRAPH_PG_PORT`,
`HASH_GRAPH_PG_USER`, `HASH_GRAPH_PG_PASSWORD`, and
`HASH_GRAPH_PG_DATABASE`. Native knowledge examples are disabled by default
because a direct SQL connection has no authorization-snapshot predicate. A
generation that has explicitly selected the spec's all-snapshot security mode
may add `--example-security-mode all-snapshot-links`; that choice and the live
transaction timestamp are recorded in the manifest.

When native examples are enabled, PostgreSQL builds a bounded, relation-seeded
pool of distinct endpoint pairs and returns each subject's direct and closed
SemType identities plus relation-local endpoint frequencies. The HASH adapter
assigns the nearest permitted source-type stratum by stable type URL, keeps
out-of-constraint candidates only as an all-strata-empty fallback, and then
uses the same recognizability ordering, subgroup interleave, fair slot
allocation, endpoint deduplication, and shortfall redistribution as Wikidata.
Exact duplicate rendered lines are rejected during selection without removing
alternates that may be needed after endpoint conflicts. Per-card stratum and
fallback diagnostics live in `link-types.jsonl` and are aggregated in the
manifest.

### `wikidata`

```sh
uv run wikidata taxonomy --config config.yaml --out taxonomy.parquet --checkpoint tax-ckpt/
uv run wikidata extract-properties --config config.yaml --out extract/ --cache-dir cache/ --taxonomy taxonomy.parquet
uv run wikidata render-cards --records extract/ --config config.yaml --out cards/
uv run wikidata entity-manifest --config config.yaml --input dump.json --out entities.parquet --checkpoint ckpt/
uv run wikidata sampling-plan --config config.yaml --input entities.parquet --out plan.parquet
```

`wikidata taxonomy` pages Wikidata's full P279 (subclass-of) edge list
(about 5.2M edges) from QLever into a two-column parquet, the local
subsumption oracle. It bypasses the response cache on purpose (each page is
about 48 MB of JSON and the checkpointed parquet is the persistence) and is
restartable like the dump extractor. `extract-properties` needs `--taxonomy`
while `extraction.filter_examples_by_subject_type` (default: on) is enabled.

Example selection (`atlas_tools/wikidata/examples.py`) is stratified by the
property's subject-type constraint classes and fully deterministic (no
randomness anywhere). Pool rows collapse into distinct (subject, object)
candidate pairs; each pair is assigned to the nearest constraint class
that subsumes any of its P31 types under the local P279 closure (minimum
hop distance first, so tangled local-government chains cannot steal
municipalities from the territorial branch; smallest downward closure
among equally near classes, so the broadest class cannot absorb its own
subclasses' members; declaration order last). The
example budget goes one slot per non-empty stratum, then round-robin with
a per-stratum cap of three; leftover budget relaxes the cap so lone strata
still fill their card. Within a stratum the most recognizable pair leads
(argmax of `log1p(subject sitelinks) + log1p(object sitelinks)`; selection
beats reweighting when villages outnumber countries ten-thousand to one),
the remainder interleaves distinct direct P31 classes before any repeats
(one country, one municipality, one commune), and each entity appears at
most once per card. Cards render each example prefixed with its stratum's
label (`municipality: Cluj-Napoca -> Emil Boc`); unconstrained properties
select from one unstratified pool and render bare pairs. Two log lines
surface ontology trouble per property: a stratum holding more than half of
the assigned candidates (the constraint ontology is coarser than the
extension; the scale-diverse interleave is what keeps such cards readable
anyway), and a stratum pair both subsuming more than 30% of the assigned
candidates (a class-graph tangle where the hop-distance tie-break is
load-bearing).

Stratification has three guard rails. The example query restricts
subjects to the item namespace (and the parser defensively re-filters
non-item endpoints), because property pages carry truthy statements of
their own: external-ID properties state their database's country, which
live-produced example subjects like "AllSides ID" on the P17 card, both
semantically wrong and a source watermark. Untyped candidates (no P31 at
all) are dropped, because live runs surfaced semantically reversed
statements in the long tail (a person with empty P31 appearing as the
subject of P6). Typed
candidates matching no constraint class land in a diagnostic `other` bucket
that reaches cards only when every declared stratum is empty: a stale
constraint list should not produce an example-less card, and it also should
not smuggle constraint-violating pairs onto cards. Per-property drop and
`other` counts land in the manifests' ladder flags, and extraction logs a
warning when `other` exceeds 25% of a property's typed candidates.

Config is a typed tree (`extraction:` plus `cards:`; see
`fixtures/wikidata/config.yaml`). The pipeline is layered so card-format
changes never re-run mining:

1. raw API responses land in the disk cache (a warm cache makes zero
   network calls);
2. `records.jsonl` plus `entity_labels.json` are the structured,
   format-independent intermediate (their config hash covers `extraction`
   only, so they are card-independent by construction);
3. `cards.jsonl` is the versioned text projection (never raw JSON), with
   token budgets, deterministic truncation, and pinned golden hashes.

The card schema, renderer, token counters, sentence splitters, and diverse
example allocator live in `atlas_tools/relation_cards/common`. Datasource
adapters resolve their own identifiers into that canonical, identifier-free
input; the final renderer also rejects URLs, adapter-supplied source
identifiers, and UUID-shaped database keys before hashing.

Identifier-freedom covers Wikidata _prose_, not just structural
references: property descriptions cross-reference other properties by PID
("use P276 for ...", 'inverse property of "has part" (P527)'). The
Wikidata adapter sanitizes description/alias text before rendering, and
detection is by _membership_, never token shape alone: the extraction
already enumerates the identifier universe (`entity_labels.json` plus the
exclusion table), so an id-shaped token is only a candidate until the
universe confirms it. Confirmed identifiers are rewritten
meaning-preservingly: deleted when redundant beside their own label,
replaced by their quoted label otherwise, and only a
confirmed-but-unlabeled identifier costs its whole sentence (deleting
just the token would leave nonsense). Unknown id-shaped tokens (a fiscal
"Q1", a cytochrome "P450") are never touched on a guess: they stay in the
text and are histogrammed for triage. Every decision is counted into
per-card and corpus `prose_sanitization` blocks in the cards manifest,
and `render_cards` fails with `ProseSanitizationBudgetError` when
sanitization empties more than `cards.max_prose_field_empty_fraction` of
the corpus's prose fields. Known identifiers surviving outside prose (in
a title or label, which are never rewritten) are added to the shared
linter's `forbidden_identifiers`, so leaks fail through the renderer's
one existing lint path.

Card descriptions are split into a lead sentence and truncatable detail by a
pluggable sentence splitter (`cards.sentence_splitter`): `punkt` (nltk, the
production default, which handles abbreviations like "Dr." and "p.m.") or
`naive` (offline regex, used by tests). punkt needs its tokenizer data once
per machine:

```sh
uv run python -m nltk.downloader punkt_tab
```

Without it, `punkt` fails fast at startup with a pointer to this command (or
set `cards.sentence_splitter: naive`).

The dump path streams (`download | bzip2 -dc | extractor`), checkpoints by
byte offset, and survives kill -9 with byte-identical output; the dump date
and SHA come from the mirror's checksum file, never from hashing the stream.
Throughput notes live in `atlas_tools/wikidata/BENCHMARK.md`.

## Repository layout

```
atlas_tools/
  common/       shared contracts (matrix, layout, provenance, knn)
  audit/        prefix representation audit
  battery/      generators, metrics, merge tree, harness, gates, engines
  relation_cards/
    common/     canonical card models, rendering, and budgets
    hash/       live HASH PostgreSQL / SemType adapter and emission
    wikidata/   Wikidata adapter and card-corpus emission
  wikidata/     miner: transport/cache/sparql/properties/taxonomy/dump
suites/         battery suite configs (smoke, phase2)
engines/        battery engine configs (default, adversarial for tests)
fixtures/       small committed fixtures (< 5 MB total)
tests/          pytest suites mirroring the package layout
```

Fixture caveat: `fixtures/wikidata/dump_excerpt.jsondump` is line-oriented
(one entity per line, exact dump format). It deliberately does not carry a
`.json` extension so format-on-save JSON formatters never reflow it;
regenerate fixtures with `uv run python fixtures/wikidata/generate_fixtures.py`.
