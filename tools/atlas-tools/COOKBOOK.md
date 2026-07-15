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
- a current-schema `decisions.json` derived from that immutable handoff;
- `runs/gold.jsonl`: optional swipe-tool export for gold-dependent report metrics.

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

`deliverables` publishes its machine-readable evidence and exits nonzero if a
blocking acceptance gate fails. Do not treat a failed gate as permission to alter
the evidence artifacts or as a passing production acceptance result.

## 5. Review every Coincident queue row

Every card with any Coincident vote requires an explicit Coincident-evidence
confirmation, rejection, or exclusion. Review the immutable queue against the
exact evaluated deck:

```sh
uv run relation review-coincident \
  runs/grid-deliverables-v1 \
  runs/cards-v1 \
  --reviewer <reviewer-name> \
  --out runs/coincident-reviews-v1
```

The local TUI shows the exact card text, complete C/P/O/unclear/abstention tally,
Coincident-voting families, and every judge vote with its family, verdict, repeat
index, and reason. Use `c` to confirm the Coincident evidence, `r` to reject the C
votes, `x` to exclude the row from supervision, `u` to undo, and `q` to cancel.
Every queue row must be decided; cancel publishes nothing.

The resulting immutable schema-v2 artifact is bound to the exact `gates.json`,
`coincident-queue.jsonl`, `cards.jsonl`, and `cards.manifest.json` bytes.
Confirmation preserves the complete original smoothed target and vote weight.
Rejection removes C votes, recomputes the same smoothed posterior from the
remaining P/O counts, and uses their count as supervised weight. It fails closed
when no P/O evidence remains because that case requires full placement
adjudication. Exclusion remains in fold and prediction coverage with zero
supervised weight. Historical classifiers and reports remain immutable; applying
these decisions requires a new fit and report.

## 6. Acquire card embeddings

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

## 7. Resolve all-ambiguous placement targets

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

## 8. Fit the grouped classifier

Fit requires the family closure and binds every training row by exact
`(relation_id, card_hash)`. The closure may contain deck-only few-shot rows that
are absent from labels and embeddings. Pass both reviewed artifacts: resolutions
cover all zero-placement-weight labels, while Coincident reviews override the
corresponding positive-weight synthetic targets. The deliverables path revalidates
the exact queue and evaluated-grid provenance.

```sh
uv run relation fit \
  runs/soft-labels-v1.parquet \
  runs/embeddings-v1.parquet \
  runs/family-closure-v1 \
  config/eval/grid.yaml \
  --resolutions runs/target-resolutions-v1 \
  --coincident-reviews runs/coincident-reviews-v1 \
  --deliverables runs/grid-deliverables-v1 \
  --out runs/classifier-v1
```

## 9. Export the Atlas-native deployment classifier

The fit bundle retains cross-fit evidence for reporting, including evaluation-only
arrays that Atlas does not consume. Export the final deployment parameters into
Atlas's exact kind-1/version-1 `SALTMMAP` format:

```sh
uv run relation export-classifier \
  runs/classifier-v1 \
  runs/family-closure-v1 \
  --soft-labels runs/soft-labels-v1.parquet \
  --resolutions runs/target-resolutions-v1 \
  --coincident-reviews runs/coincident-reviews-v1 \
  --deliverables runs/grid-deliverables-v1 \
  --out runs/classifier-v1.salt
```

The exporter reopens and verifies the complete classifier provenance group before
writing anything. It emits no NPZ: `classifier-v1.salt` contains exactly the seven
64-byte-aligned sections consumed by the Rust Atlas classifier and is read back
through the strict Python SALTMMAP decoder before success is reported. The output
must not already exist. Export is offline and does not refit, re-embed, or contact a
provider. Point Atlas's relation-classifier model source at this `.salt` file.

## 10. Render the report

The report can run before the swipe-tool gold export exists:

```sh
uv run relation report \
  runs/grid-v1 \
  runs/cards-v1 \
  config/eval/grid.yaml \
  --classifier runs/classifier-v1 \
  --closure runs/family-closure-v1 \
  --soft-labels runs/soft-labels-v1.parquet \
  --resolutions runs/target-resolutions-v1 \
  --coincident-reviews runs/coincident-reviews-v1 \
  --deliverables runs/grid-deliverables-v1 \
  --out runs/report-v1

uv run relation visualize-report \
  runs/report-v1 \
  --out runs/report-v1-visuals
```

`visualize-report` consumes the already validated report artifact; it does not
reopen the grid, cards, classifier, closure, labels, resolutions, or gold. It
writes five deterministic PNGs (`classifier-applicability.png`,
`judge-health.png`, `vote-economics.png`, `gold-evaluation.png`, and
`results-overview.png`), plus `results-overview.md`, a self-contained
`results-report.html`, and a multipage `results-report.pdf`. Every output embeds
the validated `report.meta.json` metadata hash.

A classifier report requires the exact closure recorded by the classifier. If
fit used reviewed resolutions or Coincident decisions, report also requires the
exact soft labels and corresponding review artifacts; Coincident review additionally
requires the exact deliverables directory. This revalidates every-and-only queue
coverage and classifier provenance. Panel-only reporting may omit classifier
inputs; incomplete groups fail closed. Without `--gold`, schema-v2 output marks all
gold-dependent fields unavailable and does not claim `gold.jsonl` provenance.
After the swipe-tool export exists, rerun the report and visualization into new
artifact directories if retaining the pre-gold results:

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
  --coincident-reviews runs/coincident-reviews-v1 \
  --deliverables runs/grid-deliverables-v1 \
  --out runs/report-v1-gold

uv run relation visualize-report \
  runs/report-v1-gold \
  --out runs/report-v1-gold-visuals
```

A no-gold visualization labels gold agreement, calibration, judge gold
agreement, confusion evidence, and the Coincident gate as unavailable. It never
renders missing gold metrics as zero.

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
manifest, using the atlas-tools revision that emitted its recorded
`card_format_version`. Current HASH format v8 preserves source-to-target pairs and
omits the universal Link root from card ancestors, so it does not reproduce a
format-v6 or format-v7 evaluated deck:

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

The paid evaluation, lineage backfill, embeddings, and ambiguous-target review are
already complete. The following two commands have also already run locally and are
retained here for reproducibility; do not rerun them into their existing immutable
output directories:

```sh
uv run relation analyze \
  runs/evaluate-v2 \
  --out runs/evaluate-analysis-v2

uv run relation deliverables \
  runs/grid-v2 \
  runs/cards \
  config/eval/grid.yaml \
  --decisions runs/evaluate-analysis-v2/decisions.json \
  --out runs/grid-deliverables-lineage-v1
```

The deliverables command published a valid artifact and then exited with status 1
because the blocking `cost-envelope` gate found incomplete per-family cost evidence.
Do not alter that evidence or describe this run as accepted. Coincident review and
an exploratory refit may continue, but production acceptance remains blocked until
that gate is resolved.

Run the 26-row Coincident review interactively against the exact evaluated deck:

```sh
uv run relation review-coincident \
  runs/grid-deliverables-lineage-v1 \
  runs/cards \
  --reviewer <reviewer-name> \
  --out runs/coincident-reviews-lineage-v1
```

Then refit and report into new immutable directories. These are local operations
and reuse `runs/embeddings.parquet`; they do not issue evaluation or embedding
provider requests:

```sh
uv run relation fit \
  runs/soft-labels.parquet \
  runs/embeddings.parquet \
  runs/family-closure-v1 \
  config/eval/grid.yaml \
  --resolutions runs/target-resolutions-lineage-v1 \
  --coincident-reviews runs/coincident-reviews-lineage-v1 \
  --deliverables runs/grid-deliverables-lineage-v1 \
  --out runs/classifier-reviewed-lineage-v1

uv run relation export-classifier \
  runs/classifier-reviewed-lineage-v1 \
  runs/family-closure-v1 \
  --soft-labels runs/soft-labels.parquet \
  --resolutions runs/target-resolutions-lineage-v1 \
  --coincident-reviews runs/coincident-reviews-lineage-v1 \
  --deliverables runs/grid-deliverables-lineage-v1 \
  --out runs/classifier-reviewed-lineage-v1.salt

uv run relation report \
  runs/grid-v2 \
  runs/cards \
  config/eval/grid.yaml \
  --classifier runs/classifier-reviewed-lineage-v1 \
  --closure runs/family-closure-v1 \
  --soft-labels runs/soft-labels.parquet \
  --resolutions runs/target-resolutions-lineage-v1 \
  --coincident-reviews runs/coincident-reviews-lineage-v1 \
  --deliverables runs/grid-deliverables-lineage-v1 \
  --out runs/report-reviewed-lineage-v1

uv run relation visualize-report \
  runs/report-reviewed-lineage-v1 \
  --out runs/report-reviewed-lineage-v1-visuals
```

`grid-v2` records the manifest hash of `runs/cards`, so `deliverables`,
`review-coincident`, and `report` must reopen that exact evaluated deck artifact.
The lineage-aware closure independently records the `runs/cards-lineage-v1` concat
manifest. Their concat-manifest hashes are not interchangeable provenance, but the
classifier verifies that both chains bind the same exact `cards.jsonl` bytes and
relation/card hashes.

The Coincident decisions are classifier inputs, not a side ledger: confirmation
preserves the original soft target, rejection removes only C votes while retaining
P/O evidence, and exclusion retains fold and prediction coverage with zero
supervised weight. Therefore the existing `runs/classifier-lineage-v1` and
`runs/report-lineage-v1` remain immutable historical artifacts and must not be
reused as the reviewed result.

Add `--gold <path-to-gold.jsonl>` to `relation report` when the swipe-tool export is
available, and publish both report and visualization to new directories. The
pre-gold report remains explicit about unavailable gold metrics. Reports produced
while the cost gate is blocked are exploratory and must not be presented as an
accepted production result.

The embedding and classifier prediction cohort is 1,670 relations. Three current
soft labels had only unclear votes and are already covered by
`runs/target-resolutions-lineage-v1`; reviewed exclusions carry zero supervised
target weight. The closure has 1,684 rows because it also covers the fourteen
prompt few-shots in the complete deck.

## Validation before merging code changes

```sh
uv run pytest -q
uv run ty check atlas_tools tests
uv run tach check
uv run ruff check
uv run ruff format --check
```
