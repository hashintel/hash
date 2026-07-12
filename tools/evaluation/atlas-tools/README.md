# atlas-tools

Python tooling for the Semantic Atlas pipeline (see
`libs/@local/graph/atlas/SPEC.md` and `tools/evaluation/PRD.md`):

- **`audit/` (W1)** — prefix representation audit. Measures the information
  ceiling of truncated-and-renormalized embedding prefixes against the full
  vectors (recall@k, intrusion rate, rank displacement, stratified by group).
- **`wikidata/` (W2)** — Wikidata miner. W2a extracts entity-valued property
  inventories via SPARQL/wbgetentities and emits relation cards (API path, no
  dump). W2b streams the JSON dump (never stored) into a P31-stratified
  entity sampling manifest for vec2slug.
- **`battery/` (W3)** — engine-agnostic layout gate battery. Planted-shape
  generators, structure metrics (merge-tree leaf persistence, kNN recall,
  trustworthiness/continuity, pendant diffusion, edge binding, contraction),
  baselines (PCA-2D, umap-learn), rerun-noise floors, and pass/fail gates
  including the no-structure-from-noise differential.
- **`common/`** — shared contracts: raw f32 matrix + layout artifact I/O,
  provenance envelopes, blockwise exact cosine kNN, the prefix transform.

## Setup and development

Requires Python 3.14 (pinned in `.python-version`) and [uv](https://docs.astral.sh/uv/).

```sh
uv sync --extra dev          # create/refresh the venv
uv run pytest -q             # full test suite (offline, deterministic, ~90s)
uvx ty check atlas_tools tests   # type check — must report "All checks passed!"
```

Both gates are required before merging: **tests green** and **`ty` clean**.
There is no allowlist; new diagnostics are regressions.

## Design conventions

The codebase is fully typed, and the types are the design — not decoration:

- **No `typing.Any`.** Genuinely opaque JSON is `JsonValue` / `JsonDict`
  (from `atlas_tools.common.provenance`); values merely passed through are
  `object`. The current count of `Any` in `atlas_tools/` is zero; keep it
  there.
- **Discriminated unions are the dispatch.** Polymorphic configuration is a
  pydantic union tagged by a `Literal` field — no registries, no string
  comparisons. See `battery/generators.py` (`Generator`, tag `shape`) and
  `battery/gates.py` (`GateConfig`, tag `type`); evaluation uses
  `match`/`assert_never`. Closed string sets are `Literal` or `StrEnum`.
- **Structured payloads are models.** Anything crossing a function or file
  boundary is a pydantic model (`extra="forbid"` for config-like models) or
  a frozen dataclass. Plain dataclasses/NamedTuples carry numpy arrays and
  hot-path rows (e.g. `battery.datasets.Dataset`, `wikidata.dump.EntityRow`
  — the dump stream is deliberately not pydantic-validated).
- **Determinism.** Everything is seeded (`np.random.default_rng(seed)`);
  identical (config, seed) yields identical bytes. Tests make no network
  calls and read no wall clock. `created_at` is the only wall-clock field
  anywhere and is excluded from all hashes.
- **Python 3.14 idioms.** PEP 695 (`type X = ...`, `class C[T]`), `Self`,
  no bare `# type: ignore`, no non-math abbreviations in names.

## Shared contracts (`atlas_tools/common`)

- **Raw f32 matrices** (`common.matrix`): headerless row-major
  little-endian float32 with a `<name>.meta.json` sidecar appended to the
  full filename (`X.f32` → `X.f32.meta.json`). Loaders validate
  `file size == rows * dim * 4` and reject mismatches by name.
- **Layouts** (`common.layout`): `layout.npz` with `xy` (n, 2) float32 +
  `row_id` (n,) int64 and a `layout.meta.json` sidecar. A missing sidecar is
  a hard error (`require_provenance=False` for ad-hoc inspection). The
  battery consumes only this format and never imports engine code.
- **Provenance envelopes** (`common.provenance`): every artifact sidecar is
  a `Provenance[TDetails, TConfig]` — producer, `created_at`, tool version,
  typed `config` + `config_hash` (validated on load, so tampering is
  detected), `input_hashes`, `seed`, and artifact-specific fields nested
  under `details`. Build with `SomeProvenance.make(...)`, persist with
  `.write(path)` / `.load(path)`. The nesting is deliberate: adding envelope
  fields never breaks existing loaders. Only `producer`, `created_at`, and
  `details` are required, so foreign producers (e.g. the Rust pipeline) can
  write minimal sidecars.

## CLIs

Console scripts are installed in the venv (`uv run <name> ...`).

### `audit` (W1)

```sh
uv run audit run --embeddings X.f32 --dims 128,256,512,1024 --k 15,30,50 \
    --sample 20000 --strata strata.parquet --out report/
uv run audit synth-fixture --out X.f32   # synthetic acceptance fixture
```

Writes `report.json` (source of truth — `report.md` and the returned
`RunnerReport` are both derived from the file on disk) plus a
`report.meta.json` provenance envelope.

### `battery` (W3)

```sh
uv run battery run --suite suites/smoke.yaml --engines engines/default.yaml \
    --out runs/dev/ --jobs 4
uv run battery calibrate --layout layout.npz --manifest calibration.yaml
uv run battery generate --shape chains --n 800 --seed 0 --out dataset/
```

- Suites (`suites/*.yaml`) validate into `harness.Suite`; dataset entries
  are `{shape, n, params}` and validate directly into `Generator` union
  instances. `suites/smoke.yaml` runs in seconds; `suites/phase2.yaml` is
  the PRD-scale default suite.
- Engines (`engines/*.yaml`) are subprocess commands that read
  `embeddings/edges` and write `layout.npz` — the battery never imports
  engine code. `command_no_edges` is required to evaluate the noise
  differential; an edges-consuming engine without it **fails closed**.
- A run writes `results.parquet` (tidy long format), `report.md` (every
  cell annotated with the rerun-noise spread), `gates.json` (typed
  `GatesReport`), and `manifest.json` (provenance envelope: config hashes,
  dataset hashes, seeds, library versions) — every reported number is
  reproducible from the manifest alone.

### `wikidata` (W2)

```sh
uv run wikidata extract-properties --config config.yaml --out extract/ --cache-dir cache/
uv run wikidata render-cards --records extract/ --config config.yaml --out cards/
uv run wikidata entity-manifest --config config.yaml --input dump.json --out entities.parquet --checkpoint ckpt/
uv run wikidata sampling-plan --config config.yaml --input entities.parquet --out plan.parquet
```

Config is a typed tree (`extraction:` + `cards:` — see
`fixtures/wikidata/config.yaml`). The pipeline is layered so card-format
changes never re-run mining:

1. raw API responses → disk cache (a warm cache makes zero network calls);
2. `records.jsonl` + `entity_labels.json` — structured, format-independent
   (its config hash covers `extraction` only, so it is card-independent by
   construction);
3. `cards.jsonl` — the versioned text projection (never raw JSON), with
   token budgets, deterministic truncation, and pinned golden hashes.

Card descriptions are split into a lead sentence and truncatable detail by
a pluggable sentence splitter (`cards.sentence_splitter`): `punkt` (nltk,
the production default — handles abbreviations like "Dr." and "p.m.") or
`naive` (offline regex; used by tests). punkt needs its tokenizer data once
per machine:

```sh
uv run python -m nltk.downloader punkt_tab
```

Without it, `punkt` fails fast at startup with a pointer to this command
(or set `cards.sentence_splitter: naive`).

W2b streams the dump (`download | bzip2 -dc | extractor`), checkpoints by
byte offset, and survives kill -9 with byte-identical output; the dump date
and SHA come from the mirror's checksum file, never from hashing the stream.
Throughput notes: `atlas_tools/wikidata/BENCHMARK.md`.

## Repository layout

```
atlas_tools/
  common/       shared contracts (matrix, layout, provenance, knn)
  audit/        W1 prefix representation audit
  battery/      W3 generators, metrics, merge tree, harness, gates, engines
  wikidata/     W2 miner: transport/cache/sparql/properties/cards/dump
suites/         battery suite configs (smoke, phase2)
engines/        battery engine configs (default, adversarial for tests)
fixtures/       small committed fixtures (< 5 MB total)
tests/          pytest suites mirroring the package layout
```

Fixture caveat: `fixtures/wikidata/dump_excerpt.jsondump` is line-oriented
(one entity per line, exact dump format). It deliberately does not carry a
`.json` extension so format-on-save JSON formatters never reflow it;
regenerate fixtures with `uv run python fixtures/wikidata/generate_fixtures.py`.
