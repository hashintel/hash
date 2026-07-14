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

### `relation`

`relation` verifies and combines card corpora, runs the factorial judge pilot,
analyzes its handoff, and executes the relation-policy pipeline: the
production grid run, soft-label aggregation, card embeddings, the policy
classifier, and the evaluation reports. A complete run starts by emitting
both leaf artifacts:

```sh
uv run wikidata taxonomy --config config.yaml --out taxonomy.parquet --checkpoint tax-ckpt/
uv run wikidata extract-properties --config config.yaml --out extract/ \
    --cache-dir cache/ --taxonomy taxonomy.parquet
uv run wikidata render-cards --records extract/ --config config.yaml \
    --out wikidata-cards/
uv run hash-cards extract-cards --out hash-cards/ \
    --tokenizer heuristic --sentence-splitter naive
uv run relation concat wikidata-cards/ hash-cards/ --out cards/
```

Each leaf directory must contain `cards.jsonl` and `cards.manifest.json`.
`concat` verifies each manifest-recorded content hash and source declaration,
rejects duplicate namespaces or relation IDs, and writes the combined
`cards/cards.jsonl` and `cards/cards.manifest.json`. Combined IDs stay qualified by
their leaf source, for example `wikidata:P47` and `hash:<stable-local-id>`.
Evaluation accepts only this verified schema-v2 `relation.concat` artifact.

Set `OPENROUTER_API_KEY` and use the checked-in
`config/eval/pilot.yaml`, which is the source of truth for the recovered nine-judge
roster. The schema is strict and rejects unknown keys. `request_timeout` is an
ISO-8601 duration; the optional cost cap is `max_cost_usd`.

A judge's analysis `family_id` is derived from its canonical `model` ID; it is
not duplicated in YAML. A route then separates three concepts that OpenRouter
exposes independently:

- `provider_slug` is a value from `/api/v1/providers` accepted by
  `provider.only`, such as `google-vertex` or `azure`. Endpoint tags such as
  `google-vertex/europe`, `azure/eu`, and `venice/fp8` are not provider slugs.
- `provider_name` is the display name expected in returned router metadata.
- `openrouter_region` selects the OpenRouter API base: `global` uses
  `https://openrouter.ai/api/v1`, while `eu` uses
  `https://eu.openrouter.ai/api/v1`. EU in-region routing must be enabled for the
  OpenRouter account.

`output_token_limit` is a discriminated route capability and sends exactly one
of `max_tokens` or `max_completion_tokens`. A null `temperature` or `seed` means
that parameter is omitted from the request; it is not serialized as JSON null.
The executor also requires every configured route to satisfy OpenRouter's ZDR
and data-denial filters.

One `evaluate` command runs either voting phase. The config's `mode` is the
discriminator: `pilot` (schema v3) derives the factorial-pilot sample and
auxiliary arms; `grid` (schema v4) executes the production run over the full
corpus — the pilot's successor.

From `tools/atlas-tools`, run and inspect the factorial pilot:

```sh
uv run relation evaluate runs/cards config/eval/pilot.yaml --out runs/evaluate
uv run relation analyze runs/evaluate --out runs/evaluate-analysis
cat runs/evaluate-analysis/report.md
uv run python -m json.tool runs/evaluate-analysis/decisions.json
```

Progress, throughput, and ETA are written to stderr. Add `--quiet` when a caller
needs silent operation.

#### The production grid (`mode: grid`, schema v4)

The grid executes the admitted configuration — bundle S1xF1 only, minimal
effort set explicitly per seat, decoding pinned — over the full relation-card
corpus. Its config is judges.yaml at its frozen hash (see
`config/eval/grid.yaml`): five seats carrying the pilot's route pins plus a
`pilot_cost_per_vote_usd` anchor, a `panel` section recording the freeze
state, any `manual_prunes` (a family removed above the qualification floor,
with its reason on the record), and the dormant Resolution-B
`reserve_topology` flag. The executor has no escalation feature: no shells,
templates, effort variation, or roster changes mid-run. An unfrozen panel
refuses to start, and a `prompt_pack_hash` differing from the pilot's is a
stop, not a logged drift: changed conditioning voids the qualification.

The pool is every deck card minus the fourteen few-shot PIDs; the six holdout
anchors are voted. Pilot votes are production votes: `--pilot` names the
factorial pilot's handoff directory, and any pilot vote whose identity tuple
(card, family pins, S1xF1, effort, decoding, prompt pack, repeat 0) matches a
planned baseline cell is imported, never re-bought — a drifted pin matches
nothing by construction. Phase A buys one fresh vote per remaining
(card × family) cell: per-family streams over cards in stable relation_id
order, parallel across families and serialized within each family, which is
what keeps each family's prefix cache hot. Phase B then refines every card
whose five baseline verdicts are not unanimous, that received any coincident
vote, or that carries any abstention: two repeats per (family × refined
card), identical configuration — refined cards end with 15 votes, unanimous
cards with 5.

Three family-stream guards run over fresh calls and stop the run immediately
(resumably, with the operator paged through the terminal error) when they
fire: the first-vote check (a stream's opening request must succeed on the
pinned model and parse to a verdict — a 429 or auth failure there is a roster
problem, not a retry problem), the cache assertion (from the configured call
index every completion must report cached prompt tokens), and the rolling
cost tripwire (mean $/vote over the window must stay under the configured
multiple of the seat's pilot-measured cost). Everything else follows the
pilot's fail-closed executor: durable journals, in-flight markers,
deterministic resume in batches until 100% coverage, and the central
`max_cost_usd` gate as the hard envelope ceiling. A completed run publishes
`votes.jsonl` (fresh journal), `imported-votes.jsonl` /
`imported-attempts.jsonl` (the pilot import, hash-bound), `corpus.jsonl` (the
full-deck eligibility record including `is_shot_excluded`), `run-state.json`,
and a `manifest.json` reporting imported vs fresh counts per family and the
realized refinement trigger rate.

```sh
uv run relation evaluate runs/cards config/eval/grid.yaml \
    --pilot runs/evaluate --out runs/grid

# Deliverables and blocking acceptance gates (exits nonzero on any failure):
# per-card Dirichlet posteriors (alpha = 1), the obligatory coincident review
# queue (every card with any C vote, full vote record attached), the
# nomination queue (top posterior-entropy decile), the dissent ledger carried
# forward from pilot decisions, and gates.json covering coverage, routing,
# the holdout drift canary (every family must still pass >= 5/6 plus both
# probes), per-family abstention < 5%, and the cost envelope.
uv run relation deliverables runs/grid runs/cards config/eval/grid.yaml \
    --decisions runs/evaluate-analysis/decisions.json --out runs/grid-deliverables

# Downstream policy pipeline over the grid votes:
uv run relation aggregate runs/grid runs/cards config/eval/grid.yaml \
    --out runs/soft-labels.parquet
uv run relation embed runs/cards config/eval/grid.yaml \
    --out runs/embeddings.parquet --cache runs/embedding-cache
uv run relation fit runs/soft-labels.parquet runs/embeddings.parquet \
    config/eval/grid.yaml --out runs/classifier
uv run relation report runs/grid runs/cards config/eval/grid.yaml \
    --gold gold.jsonl --classifier runs/classifier --out runs/report
```

`aggregate` emits soft labels (Dirichlet(1,1,1) posterior means over
{C, P, O}, unclear votes in the ambiguity column, n_votes, entropy, the
refinement flag, and the coincident-review flag); `embed` caches one
embedding per (model, card_hash) forever under `--cache` — the embedding
endpoint is the pipeline's only network surface besides OpenRouter; `fit`
trains the multinomial logistic policy classifier against the soft labels
(soft-target cross-entropy weighted by n_votes, every card included, grouped
CV by the card's relation `family_id`, temperature scaling, embedding-space
applicability) into one versioned bundle; `report` renders gold agreement,
per-class precision/recall, confusion matrices, the Coincident Wilson-LCB
gate with its feedability line, calibration and applicability sections,
per-judge health, and vote economics.

`gold.jsonl` is the swipe-tool export: one row per relation with the majority
`verdict`, `pass_count`, label `entropy`, and an optional `post_exposure` flag
for rulings made after the adjudicator saw panel outputs. Classifier fitting
requires a `family_id` on every card (a relation and its inverse/siblings
share one), so sibling relations can never straddle a train/test split. If the
C-predicted gold stratum is too small for the precision bound to ever clear
its target, the report says `UNPASSABLE BY SAMPLE SIZE` rather than reporting
a failure.

The pilot slice is not a separately maintained or hand-authored file. `evaluate`
verifies the concatenated cards, excludes the fixed `FEW_SHOT` prompt examples,
adds the fixed qualification holdouts, and derives the remaining sample from the
verified `cards.jsonl` hash, the sampling-config hash, and `sampling.seed` with
`stratified-hash-v1`. Strata cover producer, prescreen class, card-length
quartile, and card trouble tags. `slice.jsonl` records every selected card hash,
seed, selection key, stratum, and the resulting selection hash, so the same
cards and config derive the same pilot.

The baseline pilot is every configured judge family across all nine bundles: the
three system-prompt shells (`S1`-`S3`) crossed with the three user framings
(`F1`-`F3`). It also runs these typed auxiliary arms:

- the six fixed holdouts participate in the complete 3x3 baseline grid and judge
  qualification;
- `repeat_count` adds that many repeats of non-holdout cards at `S1xF1` and the
  baseline effort, providing a self-flip noise floor;
- each judge with `higher_effort` gets an `S1xF1` effort arm across the whole
  pilot slice, including holdouts.

`analyze` cross-validates the manifest, slice, logical votes, and physical
attempts before writing byte-deterministic `decisions.json` and `report.md`.
Inspect data-health/routing warnings, pruned families, admitted shells and
framings, selected per-family effort, and projected cost before freezing the
grid's judges.yaml from those decisions.

The fixed `FEW_SHOT` cards remain in the prompt pack but are excluded from
pilot sampling, analysis, and grid votes to prevent contamination. Other
verified cards remain eligible, including severely truncated cards; truncation
is recorded for analysis rather than silently changing the population. Grid
baseline votes carry `repeat_index` 0; refinement repeats carry 1 and 2.

Execution is deliberately fail-closed:

- Requests require ZDR and `data_collection: deny`, pin exactly one
  `provider_slug`, require the configured parameters, disallow fallback, disable
  the OpenRouter response cache, and disable SDK retries. Returned model,
  requested model, direct-route metadata, selected endpoint, and `provider_name`
  must match the pin. If OpenRouter includes detailed attempt metadata, it must
  contain exactly one HTTP-200 provider attempt.
- A syntactically malformed judge response receives one conversational parser
  repair. If that response is also malformed, the logical vote is `ABSTAIN`.
  A schema-valid but semantically wrong verdict is evidence and is never
  retried. Malformed-output repair is independent of physical failure retries:
  `parse_retries` remains `0` or `1` regardless of transport attempts.
- SDK retries stay disabled because they neither cover all observed failures nor
  expose per-attempt durability hooks. The executor instead applies the explicit
  `transient_retries` policy independently to the initial and repair stages.
  `maximum_attempts` is the total physical-attempt budget per stage. Retryable
  transport failures and configured HTTP or embedded provider status codes are
  journaled before deterministic exponential backoff. A provider `Retry-After`
  value can lengthen, but never shorten, that delay. Backoff is interrupted if a
  peer terminal failure closes the run. Exhaustion and permanent routing,
  response-envelope, or accounting failures stop the run; none become
  abstentions.
- Every physical request, including failed and repair calls, is appended and
  `fsync`ed to `attempts.jsonl`; every completed logical vote is durably appended
  to `votes.jsonl`. Before each call, `inflight/<attempt-id>.json` is durably
  written and is deleted only after that exact outcome is journaled.
- Trio workers share a bounded work channel. Execution starts at
  `concurrency.initial`, doubles after a full current-limit cohort of successful
  logical votes, and stops at `concurrency.maximum`. Judge task streams are
  round-robin interleaved, so a concurrency window spreads across pinned routes
  instead of hammering one family. Physical attempts may be journaled in
  completion order, but logical votes are committed strictly in deterministic
  plan order.
- A terminal worker failure stops new dispatch and atomically closes the
  physical-request boundary. Calls whose durable in-flight marker already exists
  are not cancelled: they finish and journal before workers retire. Peer workers
  do not start a retry or malformed-output repair after the stop; any successful
  partial stage is reused by a later explicit resume rather than paid for again.
- Re-running the identical command against the same output directory resumes a
  journal prefix only when its source hashes, plan, request contract, and run
  state still match. Output created by an older run-state or plan schema must use
  a fresh directory; it is intentionally not migrated across paid-call journal
  contracts. A failed attempt with a known outcome may be retried as the
  next numbered physical attempt. An in-flight marker without a corresponding
  journaled outcome has unknown billing state and blocks automatic retry. A run
  lock also prevents concurrent evaluators from sharing an output directory.
- `max_cost_usd` is checked by a thread-safe central gate before every physical
  request, including parser repair. Reaching the cap stops with all prior work
  resumable; raising the operational cap and rerunning continues the same plan.
  Because request cost is known only after the response, already-authorized
  concurrent calls can carry the total past the cap. The overshoot is bounded by
  the active concurrency window. If any physical attempt lacks usable cost data,
  a configured cap cannot be enforced; the run stops before another request,
  including a transient retry, rather than silently weakening the budget.

Artifacts are append-only journals plus hash-bound manifests. `pilot/` contains
`slice.jsonl`, `votes.jsonl`, `attempts.jsonl`, `run-state.json`, and the finalized
schema-v2 `manifest.json`; `pilot-analysis/` contains schema-v3 `decisions.json` and
`report.md`. A grid run contains `votes.jsonl` (fresh journal),
`imported-votes.jsonl` / `imported-attempts.jsonl` (the pilot import),
`corpus.jsonl`, `attempts.jsonl`, `run-state.json`, and a production
`manifest.json` binding the frozen panel (judge pins, manual prunes, dormant
reserve flag), card artifact, prompt pack, request-policy hashes, per-family
imported/fresh/refinement counts, the realized trigger rate, SDK versions, and
run dates. `deliverables/` adds `posteriors.jsonl`, `coincident-queue.jsonl`,
`nomination-queue.jsonl`, `dissent-ledger.jsonl`, `gates.json`, and
`report.md`; downstream stages add `soft-labels.parquet`,
`embeddings.parquet`, the classifier bundle (`classifier.json`, `arrays.npz`,
`predictions.parquet`), and `report.json`/`report.md`, each with a provenance
sidecar. `.run.lock` and the `inflight/` marker directory are operational
state rather than handoff artifacts.

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

Mining pace is governed by three independent levers, none of which can
change mined content:

- one request per property per endpoint rung: since example-query v6 the
  whole geometric offset ladder travels as UNIONed inner slices of a
  single query, so a cold-cache re-mine costs a quarter of the requests
  it used to;
- `extraction.politeness.rate_limit_per_sec` is enforced _per host_
  (politeness is a property of the server being asked), so the WDQS
  fallback rung and the wikibase API never queue behind QLever's
  schedule;
- `extraction.example_workers` (default 1) overlaps request latency with
  a worker pool. The shared per-host limiter keeps the request rate
  against each endpoint unchanged, fetches land in the same keyed
  response cache, and selection/diagnostics assemble in numeric-PID
  order afterwards, so every artifact is byte-identical at any worker
  count. Pacing knobs (politeness, workers) are deliberately excluded
  from the extraction checkpoint guard hash: retuning them never
  discards recorded ladder outcomes.

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

Property retention is scope-aware. Beyond the configurable
datatype/maintenance/deprecated exclusions (`properties.py` holds the
authoritative rule list), a property whose property-scope constraint
(Q53869507, qualifier P5314) omits "as main value" (Q54828448) is
excluded as `qualifier-scoped`: properties like "object has role",
"mapping relation type", or "in work" are statement metadata, not
entity-to-entity link types, so their truthy main-value statements are
property misuse and mining them yields inherently garbled example pairs.
Properties declaring no scope constraint are retained; absent evidence
is not treated as misuse. Records mined before this rule are format v2
and must be re-extracted (the records format version gates loading).

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
("use P276 for ...", 'inverse property of "has part" (P527)') or link out
to a source ontology by URL (P1060: "equivalent to ... in the relation
ontology http://purl.obolibrary.org/obo/..."). URLs are stripped from
prose first and unconditionally (a `scheme://` span is never ambiguously
prose; deleting the span keeps the surrounding gloss, and each removal is
reported in `removed_urls`); the strip precedes identifier handling so a
Wikidata entity URL's embedded QID is not mistaken for a reference.
Beyond that, detection is by _membership_, never token shape alone:
detection is by _membership_, never token shape alone: the extraction
already enumerates the identifier universe (`entity_labels.json`, the
exclusion table, and each record's own resolved ids with their
example-row labels), so an id-shaped token is only a candidate until the
universe confirms it. Confirmed identifiers are rewritten
meaning-preservingly: deleted when redundant beside their own label,
replaced by their quoted label otherwise, and only a
confirmed-but-unlabeled identifier costs its whole sentence (deleting
just the token would leave nonsense). Unknown id-shaped tokens (a fiscal
"Q1", a cytochrome "P450") are never touched on a guess: they stay in the
text and are histogrammed for triage.

Names are the boundary of both rewriting and enforcement. Titles,
labels, and example names render as-is, and an id-shaped fragment inside
a name is part of the name, not a reference: "space group P4" collides
with the property P4 (P690's Hermann-Mauguin example names live-hit
this), so tokens surviving in name surfaces are reported
(`known_tokens_retained` / `unknown_tokens`), never fatal, and the token
boundary itself disqualifies notation-like continuations ("P6/mmm",
"P2\u2081/n"). Only a record's _own_ resolved ids are lint-fatal through the
shared linter's `forbidden_identifiers`: one of those appearing as text
means the rendering leaked something it resolved, and the error names
the failing card. Every decision is counted into per-card and corpus
`prose_sanitization` blocks in the cards manifest (substituted, dropped,
retained, unknown histograms), and `render_cards` fails with
`ProseSanitizationBudgetError` when sanitization empties more than
`cards.max_prose_field_empty_fraction` of the corpus's prose fields.

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
  relation/     verified card concat, judge pilot/full-grid execution, and analysis
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
