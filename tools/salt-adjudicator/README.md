# SALT swipe adjudicator

An offline-capable, keyboard-first tool for collecting and merging geometry labels.
The distributable is [`salt-adjudicator.html`](./salt-adjudicator.html): one
self-contained document with no runtime dependencies or external requests.

## Recommended distribution

1. Open `salt-adjudicator.html` and choose **Study builder**.
2. Load the full candidate card pool.
3. Select qualification anchors from that pool, assign each a reference
   C/P/O/U answer, and write the required rationale. SALT recommends about 20
   without inventing answers or forcing equal class counts.
4. Enter one opaque annotator ID per line and choose a planning mode. Review
   the exact sample, uniform coverage, load range, spare capacity, and
   10-seconds-per-card estimate.
5. Generate and download:
   - one study-specific HTML file;
   - the private annotator-code TSV;
   - the assignment manifest JSON.
6. Put the study HTML at one stable static HTTPS URL and send each annotator
   that URL plus only their code.

Emailing or otherwise sharing the HTML file directly also works. A stable URL
is preferable because browser storage is origin-scoped; moving or renaming a
local file can make an existing crash buffer harder to resume in some browsers.

The seed reproduces assignments and shuffle order. Annotators do not enter it:
their short code selects the assignment already embedded in the bundle. Codes
catch typos and reduce accidental identity collisions; they are not
authentication. The offline bundle also contains qualification answers, so the
reveal is a trust-based calibration aid rather than a secure exam.

Use opaque annotator IDs if the bundle will be hosted publicly. If the card data
is sensitive, distribute the file directly or use an access-controlled static
host.

## Qualification and sample planning

Qualification anchors are copied from the imported source pool and remain
read-only except for the coordinator-authored answer and rationale. They are
excluded from the production pool by both relation ID and card hash.

The planner offers three equivalent views of one uniform assignment model:

- **Budget first** sets `n` annotators, `m` production cards per annotator, and
  coverage `c`; SALT samples
  `M = min(eligible pool, floor(n × m / c))` cards.
- **Exact sample first** sets `M` and `m`; SALT reports the greatest feasible
  uniform coverage `c = min(n, floor(n × m / M))`.
- **Coverage first** sets `M` and `c`; SALT derives the smallest cap
  `m = ceil(M × c / n)`.

Three-fold coverage is the default. Two-fold coverage is allowed with a
caution because disagreement cannot produce a majority; coverage below two or
above the annotator count is rejected. SALT never spends spare slots by giving
only some cards extra reviews.

The final production subset is sampled deterministically from the study seed.
SALT preserves equivalence/normal prescreen proportions when those strata are
present and uses seeded uniform sampling for an all-normal atlas pool. Atlas
Wikidata corpora must carry `scope_filter: "main-value-only"`; qualifier- and
reference-only properties are excluded before SALT samples the requested deck
size. The study and verification manifest record that filter together with the
source-pool hash and count, eligible count, exact sample size, strategy version,
planner mode, assumptions, and unused capacity.

## Annotator flow

1. Open the study HTML and enter the assigned code.
2. Complete the qualification deck. Answers and rationales reveal only after
   the entire deck is labeled; these swipes are marked and excluded from gold
   aggregation.
3. Complete the production slice once. Independent annotator overlap supplies
   repeated evidence; later passes remain available for pilots.
4. Export `swipes-<study>-<annotator>.jsonl` and send it to the coordinator.

Primary shortcuts:

- `↑` or `C`: Same dot
- `→` or `P`: Nearby
- `←` or `O`: Just a line
- `↓` or `U`: Can't tell
- `D`: show or hide aliases, inverse name, ancestors, endpoint types, and
  constraints
- `F`: toggle flag
- `N`: open the one-line note field; its open time is excluded from latency
- `?`: open the geometry class guide; hover or focus a class control for the
  same explanation
- `Z`: append a retraction and re-queue the previous swipe
- `E`: export the full swipe log

Touch users can swipe horizontally for Just a line or Nearby. Vertical pans
scroll long relation documents; the four always-visible direction buttons
cover every class.

## Coordinator merge and adjudication

Open **Merge exports** in the matching study HTML and drop all received swipe
files. Stable swipe IDs collapse repeated full-log exports safely. The view
reports:

- active latest votes per annotator and relation;
- C/P/O/U distributions, entropy, majority, and disagreements;
- nominal Krippendorff's alpha overall and one-vs-rest for each class;
- assignment-manifest coverage;
- per-annotator agreement after binding adjudications exist.

**Resolve edge cases** opens an entropy-ranked queue. Binding decisions export
to a distinct `adjudications.jsonl`; they never mix with swipes. The markdown
edge-case export includes relation ID, entropy, label sequence, notes, binding
label, and rationale.

## Input contracts

Production `cards.jsonl` has one object per line:

```json
{
  "relation_id": "P6",
  "family_id": "P6-group",
  "card_text": "Relation: head of government\nExample one\nExample two",
  "card_hash": "sha256...",
  "prescreen": "equivalence"
}
```

The Study Builder also accepts atlas Wikidata extraction records directly:

```json
{
  "pid": "P6",
  "card_text": "Relation: head of government\nDescription: ...\n\nSource types:\n  - ...\n\nTarget types:\n  - ...\n\nConstraints:\n  - direction: source -> target\n\nExamples:\n  - country: Germany -> Friedrich Merz\n\nSlug: head-of-government\n",
  "card_hash": "sha256...",
  "retrieved_at": "Sat, 11 Jul 2026 21:49:16 GMT",
  "severely_truncated": false,
  "token_count": 559,
  "truncations": [],
  "scope_filter": "main-value-only"
}
```

These records are normalized to `relation_id = pid`, `family_id = pid`, and
`prescreen = normal`; extraction metadata remains attached to the study card.
The default card shows only the relation, description, and every example.
**Details** reveals aliases, inverse name, ancestors, source and target types,
and constraints in one tier; the slug is never shown. A strict reversible
parser falls back to the original raw `card_text` whenever the canonical
grammar is not recognized. Only bullet items inside `Examples:` are
deterministically re-ordered per annotator and pass.

Qualification JSONL parsing remains available for compatibility and tests. A
record uses the same fields plus:

```json
{
  "answer": "C",
  "rationale": "Both sides resolve to the same canonical target."
}
```

The coordinator UI now creates these records in place from the imported pool
rather than accepting a separate qualification upload. The parser rejects
malformed lines, missing fields, unsupported prescreen values, and duplicate
relation IDs or card hashes before a study is generated. The final study also
rejects any identifier or hash shared by qualification and production.

## Persistence and evidence

Every action synchronously writes an append-only event log to `localStorage`
under the study, deck hash, and annotator ID. If storage is unavailable or
full, labeling stops with an export action rather than silently collecting
unsafe evidence.

The exported JSONL contains one materialized line per swipe. Undo leaves the
swipe in place with `retracted: true` and a `retracted_at` timestamp. Each line
also includes stable swipe/session IDs, study/deck identity, family and
prescreen metadata, pass, label, active decision latency, flag/note, rubric
version, deterministic shuffle seed, and monotone timestamp.

Browser storage is a crash buffer, not the system of record. The downloaded
JSONL is the system of record, and the top rail always shows changes since the
last export.

Serving the artifact from a Cloudflare Worker gives every annotator a stable
HTTPS origin, which makes this crash buffer more dependable than `file://`.
The current bundle deliberately makes no network requests and does not upload
evidence. A Worker-backed store can be added later as an optional same-origin
sync layer without removing local persistence or changing the JSONL system of
record.

## Build and test

Annotators need only the committed HTML artifact. Maintainers use the isolated
tool package; it is intentionally not registered as a monorepo workspace.

```sh
cd tools/salt-adjudicator
yarn install --immutable

# Rebuild the committed single-file artifact
yarn build

# Write an artifact elsewhere
yarn build --out /tmp/salt-adjudicator.html

# Typecheck, test, and rebuild
yarn verify
```

The Preact/TypeScript source and Zod contracts live in [`src/`](./src/).
esbuild bundles the browser application and its dependencies, then the builder
inlines that bundle, CSS, and demo payload. The build fails if an external
script, stylesheet, or ES module remains.

The committed artifact targets current Chrome, Edge, Firefox, and Safari.
Direct `file://` use is supported, but browser handling of local-file storage
is not standardized; test the chosen distribution path before a live study.
