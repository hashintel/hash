# Review remediation — 2026-08-18

The consolidated queue from the cross-stack PR-thread review (2026-08-18): 24 unresolved inline
threads across 10 PRs were sampled; 9 were resolved at review time with evidence-backed upstack
replies (PRs #3, #6, #7, #9, #11), and FE-1432 has now adjudicated the remaining 15. Five
reusable lenses were induced, of which four were promoted. Owning ticket: **FE-1432** (sub-issue
of FE-1401, the sweep lineage). Exit rule as ever: rows leave this document by landing in a
commit, a ticket, or a decision — this file is a consolidation target, not a terminus.

Provenance note: several rows are FE-1419's deliberate deferrals coming due — its queue's
Out of Scope list named unused-dependency cleanup, expert-truncation handling, stale prose, and
advisory-loop tuning explicitly. Those return here with lens backing rather than as style nits.

## Ledger R — resolved findings, by lens

| #   | Lens                                                                 | What                                                                                                                | Resolution                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | 1 — accepted transitions preserve future closure + parse equivalence | Overlapping conflicts can strand one another                                                                        | `380411f`: open conflicts are pairwise disjoint at command admission and persisted parsing; an open conflict must still name active captures. Table-driven overlap cases and an adversarial review prove the closure argument. |
| R2  | 1                                                                    | Persisted parsing accepts duplicate terminal events the command API refuses                                         | `380411f`: the parser permits at most one `resolution` or `issue-closed` event per issue.                                                                                                                                      |
| R3  | 2 — completion metadata survives every sibling caller                | Expert truncation is discarded                                                                                      | `f71aa9e`: persist the partial reply and `truncated` fact, checkpoint as `expert-truncated`, stop before interviewer consumption, and regenerate the reply on resume.                                                          |
| R4  | 2                                                                    | A non-final interviewer response can remain truncated after the continuation cap                                    | `f71aa9e`: checkpoint as `interviewer-truncated` and stop before expert consumption; the existing resume path regenerates the trailing interviewer turn.                                                                       |
| R5  | 4 — declared capability matches actual imports                       | The dependency relation was checked in one direction only                                                           | Current-state correction: `plugin-gherkin` began importing Valibot in `b4b76f7`, so its declaration is no longer unused and was retained. `bb46941` makes the boundary gate bidirectional.                                     |
| R6  | 5 — a test proves its setup                                          | Capture-store setup could drift into non-null assertions; walking-skeleton inspection could throw on absent context | `380411f` asserts the local-store setup result and IDs. `bb46941` turns absent reply context into the intended strict-oracle `false`, not a child-process exception.                                                           |

Lens 3 (consumer grammar cannot be narrower than its producer): both sampled instances were
fixed upstack at review time (asset filenames, model-artifact extraction); no current instance.
Recorded here so the lens's clean state is on the record, not silent.

## Review threads — reconciled

All 15 remaining FE-1432 threads were replied to and resolved on 2026-08-18: 7 accepted fixes
(including the dependency-age policy and Valibot's upstack correction), 2 findings owned by
FE-1385/FE-1393, and 6 evidence-backed refusals. A live refresh after reconciliation found no
unresolved FE-1432 thread. The one repository-wide unresolved thread was on child PR #20 and
belongs to FE-1433.

## Below the lens gate — batch disposition

Findings that did not meet the recurrence/impact gate for lenses were disposed exactly as the
gate required: stale UI and IR prose are owned by FE-1385 and FE-1393; the dated absolute paths,
ambient Node assumption, static-regex warning, and advisory-loop optimization were refused with
their evidence on the review threads. None received a dedicated commit.

## Graduation proposals — tooling-side, not this repo's work

Three review-contract additions were proposed for graduation: (1) check command admission,
persisted parsing, and legal future closure as one state-machine contract; (2) search every
caller of APIs returning `truncated`/`hasMore`/`next`-shaped completion metadata; (3) compare
handcrafted consumer grammars directly against producer output contracts. Decision: accept
them as inputs to FE-1401 items 3–4, the tooling-side `ds-induct`/lens-registry work. They are
not repository changes and FE-1432 does not duplicate that ownership.

## Verification

The integrated branch passed OxLint, Oxfmt, TypeScript checking, all 138 tests, and the full
workspace build. The capture lifecycle received a separate read-only adversarial review, which
found no counterexample across duplicate terminal events, overlap, supersession, retraction,
resolution losers, or reuse of a still-active winner after a closed conflict.
