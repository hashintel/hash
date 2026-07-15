# Relation policy pipeline cookbook

This cookbook is the command-by-command production path from source extraction
through the final report. It intentionally excludes running and analyzing the
factorial pilot.

Run every command from `tools/atlas-tools`. Output directories are provenance
artifacts: choose a new path for a new run, and never edit a published artifact
in place.

## Prerequisites

The production grid requires the completed pilot handoff even though this
cookbook does not recreate it:

- `runs/evaluate/`: completed pilot run;
- `runs/evaluate-analysis/decisions.json`: accepted pilot decisions;
- `runs/gold.jsonl`: swipe-tool gold export, required only by the final report.

Install the environment and the production sentence tokenizer once:

```sh
cd /Users/bmahmoud/projects/hash/hash/tools/atlas-tools
uv sync --extra dev
uv run python -m nltk.downloader punkt_tab
```

Set `OPENROUTER_API_KEY` before the grid or embedding stages. Ensure the HASH
graph PostgreSQL database is running before extracting HASH cards. Its defaults
are `localhost:5432`, user `graph`, database `graph`; override them with the
`HASH_GRAPH_PG_HOST`, `HASH_GRAPH_PG_PORT`, `HASH_GRAPH_PG_USER`,
`HASH_GRAPH_PG_PASSWORD`, and `HASH_GRAPH_PG_DATABASE` environment variables.

## 1. Build the source card and lineage artifacts

Fetch the Wikidata item taxonomy, then extract property records, rendered cards,
and schema-v1 relation lineage from one cache-pinned source snapshot:

```sh
uv run wikidata taxonomy \
  --config config/wikidata/config.yaml \
  --out runs/wikidata-taxonomy-v1.parquet \
  --checkpoint runs/wikidata-taxonomy-v1-checkpoint

uv run wikidata extract-properties \
  --config config/wikidata/config.yaml \
  --out runs/wikidata-cards-v1 \
  --cache-dir runs/wikidata-cache-v1 \
  --taxonomy runs/wikidata-taxonomy-v1.parquet
```

Extract HASH relation cards and direct SemType lineage from one repeatable-read
database snapshot:

```sh
uv run hash-cards extract-cards \
  --out runs/hash-cards-v1
```

Each leaf output must contain `cards.jsonl`, `cards.manifest.json`,
`lineage.jsonl`, and `lineage.manifest.json`. Keep the leaf directories: the
closure verifies them independently rather than trusting the combined deck.

## 2. Build the evaluated deck and family closure

Concat input order is part of the deck identity. The commands below establish
HASH-first order; use the same combined deck for every later stage.

```sh
uv run relation concat \
  runs/hash-cards-v1 \
  runs/wikidata-cards-v1 \
  --out runs/cards-v1

uv run relation closure \
  runs/cards-v1 \
  runs/hash-cards-v1 \
  runs/wikidata-cards-v1 \
  --out runs/family-closure-v1
```

`relation closure` is local and deterministic. It makes no provider, Wikidata,
or database request.

## 3. Run the production grid

This is the first paid stage. It imports every pilot vote whose complete request
identity still matches and buys the remaining production votes.

```sh
uv run relation evaluate \
  runs/cards-v1 \
  config/eval/grid.yaml \
  --pilot runs/evaluate \
  --out runs/grid-v1
```

Monitor it from another terminal without mutating the run:

```sh
uv run relation status runs/grid-v1
```

If evaluation stops, rerun the same `relation evaluate` command. The journals
and in-flight markers enforce deterministic resume.

## 4. Publish grid deliverables and soft labels

Run these only after the production grid completes:

```sh
uv run relation deliverables \
  runs/grid-v1 \
  runs/cards-v1 \
  config/eval/grid.yaml \
  --decisions runs/evaluate-analysis/decisions.json \
  --out runs/grid-deliverables-v1

uv run relation aggregate \
  runs/grid-v1 \
  runs/cards-v1 \
  config/eval/grid.yaml \
  --out runs/soft-labels-v1.parquet
```

`deliverables` exits nonzero if a blocking acceptance gate fails. Do not treat a
failed gate as permission to alter the evidence artifacts.

## 5. Acquire card embeddings

This is the second and final network-paid stage:

```sh
uv run relation embed \
  runs/cards-v1 \
  config/eval/grid.yaml \
  --out runs/embeddings-v1.parquet \
  --cache runs/embedding-cache-v1
```

The embedding cohort excludes the fourteen prompt few-shots. Rerunning the same
command reuses every complete cache entry and requests only misses. A recorded
failed or rejected response clears its in-flight marker, so the corrected
command can be retried; an unmatched in-flight marker blocks automatic reissue
because its billing outcome is unknown.

## 6. Resolve all-ambiguous placement targets

A soft label with only `unclear` or `ABSTAIN` responses has a uniform
Dirichlet(1,1,1) prior but no observed three-class placement weight. Review each
such card explicitly before fit:

```sh
uv run relation resolve-ambiguous \
  runs/soft-labels-v1.parquet \
  runs/cards-v1 \
  --reviewer <reviewer-name> \
  --out runs/target-resolutions-v1
```

The local TUI uses `c` for Coincident, `p` for Proximal, `o` for Overlay, `x`
for Excluded, `u` to undo, and `q` to cancel without publishing. Placement
choices become one-hot distributions with unit supervised weight. Excluded rows
remain in closure, fold, and prediction coverage but have zero supervised target
weight. The immutable artifact covers every and only all-ambiguous label and is
bound to the exact soft-label and deck bytes.

## 7. Fit the grouped classifier

Fit requires the family closure and binds every training row by exact
`(relation_id, card_hash)`. The closure may contain deck-only few-shot rows that
are absent from labels and embeddings. Pass the reviewed target artifact so fit
can prove that no uniform prior was silently treated as placement evidence.

```sh
uv run relation fit \
  runs/soft-labels-v1.parquet \
  runs/embeddings-v1.parquet \
  runs/family-closure-v1 \
  config/eval/grid.yaml \
  --resolutions runs/target-resolutions-v1 \
  --out runs/classifier-v1
```

## 8. Render the final report

Place the swipe-tool export at `runs/gold.jsonl`, then run:

```sh
uv run relation report \
  runs/grid-v1 \
  runs/cards-v1 \
  config/eval/grid.yaml \
  --gold runs/gold.jsonl \
  --classifier runs/classifier-v1 \
  --closure runs/family-closure-v1 \
  --soft-labels runs/soft-labels-v1.parquet \
  --resolutions runs/target-resolutions-v1 \
  --out runs/report-v1
```

A classifier report requires the exact closure recorded by the classifier. If
fit used reviewed resolutions, report also requires the exact soft-label and
resolution artifacts so it can revalidate every-and-only ambiguous coverage and
classifier provenance. Panel-only reporting may omit all four artifacts;
incomplete pairs fail closed.

## Historical lineage migration after evaluation

Use this path when paid evaluation already exists for an exact legacy deck. Do
not rerender labels or assign old judgments to new card hashes.

Replay the original Wikidata request cache without network fallback, then bind
its richer lineage to the exact evaluated Wikidata card bytes:

```sh
uv run wikidata extract-properties \
  --config config/wikidata/config.yaml \
  --out runs/wikidata-extract-lineage-v1 \
  --cache-dir <original-wikidata-cache> \
  --cache-only \
  --taxonomy <original-taxonomy.parquet>

uv run wikidata backfill-lineage \
  --records runs/wikidata-extract-lineage-v1 \
  --cards <exact-evaluated-wikidata-cards> \
  --out runs/wikidata-cards-lineage-v1
```

Replay HASH at the exact `details.snapshot_at` value in the evaluated HASH
manifest:

```sh
uv run hash-cards extract-cards \
  --out runs/hash-cards-lineage-v1 \
  --snapshot-at <evaluated-HASH-snapshot-at> \
  --tokenizer heuristic \
  --sentence-splitter naive
```

Rebuild the combined deck in its original source order and verify that its
`cards.jsonl` hash equals the deck hash recorded by the completed evaluation and
soft-label metadata before publishing the closure:

```sh
uv run relation concat \
  runs/hash-cards-lineage-v1 \
  runs/wikidata-cards-lineage-v1 \
  --out runs/cards-lineage-v1

uv run relation closure \
  runs/cards-lineage-v1 \
  runs/hash-cards-lineage-v1 \
  runs/wikidata-cards-lineage-v1 \
  --out runs/family-closure-v1
```

The old grid and soft labels remain valid when their exact relation/card hashes
match. Only embeddings missing for that cohort, the classifier, and the report
need to run afterward.

## Continuation for the current completed evaluation

The current migration already has its exact deck and closure. Continue with:

```sh
uv run relation embed \
  runs/cards-lineage-v1 \
  config/eval/grid.yaml \
  --out runs/embeddings.parquet \
  --cache runs/embedding-cache

uv run relation resolve-ambiguous \
  runs/soft-labels.parquet \
  runs/cards-lineage-v1 \
  --reviewer <reviewer-name> \
  --out runs/target-resolutions-lineage-v1

uv run relation fit \
  runs/soft-labels.parquet \
  runs/embeddings.parquet \
  runs/family-closure-v1 \
  config/eval/grid.yaml \
  --resolutions runs/target-resolutions-lineage-v1 \
  --out runs/classifier-lineage-v1

uv run relation report \
  runs/grid-v2 \
  runs/cards-lineage-v1 \
  config/eval/grid.yaml \
  --gold <path-to-gold.jsonl> \
  --classifier runs/classifier-lineage-v1 \
  --closure runs/family-closure-v1 \
  --soft-labels runs/soft-labels.parquet \
  --resolutions runs/target-resolutions-lineage-v1 \
  --out runs/report-lineage-v1
```

The embedding and classifier prediction cohort is 1,670 relations. Three
current soft labels have only unclear votes and therefore require review; any
reviewed exclusions carry zero supervised target weight. The closure has 1,684
rows because it also covers the fourteen prompt few-shots in the complete deck.

## Validation before merging code changes

```sh
uv run pytest -q
uv run ty check atlas_tools tests
uv run tach check
uv run ruff check
uv run ruff format --check
```
