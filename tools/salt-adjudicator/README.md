# SALT swipe adjudicator

An offline-capable, keyboard-first tool for collecting and merging geometry labels.
The distributable is [`salt-adjudicator.html`](./salt-adjudicator.html): one
self-contained document with no runtime dependencies or external requests.

## Recommended distribution

1. Open `salt-adjudicator.html` and choose **Study builder**.
2. Load the production cards and optional qualification deck.
3. Enter one opaque annotator ID per line, the coverage target, slice cap,
   rubric version, quota, and study seed.
4. Generate and download:
   - one study-specific HTML file;
   - the private annotator-code TSV;
   - the assignment manifest JSON.
5. Put the study HTML at one stable static HTTPS URL and send each annotator
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

## Annotator flow

1. Open the study HTML and enter the assigned code.
2. Complete the qualification deck. Answers and rationales reveal only after
   the entire deck is labeled; these swipes are marked and excluded from gold
   aggregation.
3. Complete the production slice once. Independent annotator overlap supplies
   repeated evidence; later passes remain available for pilots.
4. Export `swipes-<study>-<annotator>.jsonl` and send it to the coordinator.

Primary shortcuts:

- `↑` or `C`: Coincident
- `→` or `P`: Proximal
- `←` or `O`: Overlay
- `↓` or `U`: Unclear
- `F`: toggle flag
- `N`: open the one-line note field; its open time is excluded from latency
- `?`: open the geometry class guide; hover or focus a class control for the
  same explanation
- `Z`: append a retraction and re-queue the previous swipe
- `E`: export the full swipe log

Touch users can swipe the relation card or use the four always-visible
direction buttons.

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

The first line of `card_text` remains fixed. Its subsequent non-empty example
lines are deterministically re-ordered per annotator and pass.

Qualification JSONL uses the same fields plus:

```json
{
  "answer": "C",
  "rationale": "Both sides resolve to the same canonical target."
}
```

The parser rejects malformed lines, missing fields, unsupported prescreen
values, and duplicate relation IDs or card hashes before a study is generated.

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
npm ci

# Rebuild the committed single-file artifact
npm run build

# Write an artifact elsewhere
npm run build -- --out /tmp/salt-adjudicator.html

# Typecheck, test, and rebuild
npm run verify
```

The Preact/TypeScript source and Zod contracts live in [`src/`](./src/).
esbuild bundles the browser application and its dependencies, then the builder
inlines that bundle, CSS, and demo payload. The build fails if an external
script, stylesheet, or ES module remains.

The committed artifact targets current Chrome, Edge, Firefox, and Safari.
Direct `file://` use is supported, but browser handling of local-file storage
is not standardized; test the chosen distribution path before a live study.
