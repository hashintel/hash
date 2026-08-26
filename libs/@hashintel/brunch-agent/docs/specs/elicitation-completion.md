# Spec: completion — the invariants `evaluateCompletion` must satisfy

Status: **provisional**, rewritten 2026-08-25 under
[ADR-0006](../adr/0006-plugins-per-target-formalism.md); FE-1402 owns it. The previous draft,
with its CPS `DemandTable` and `where`-scoped clause vocabulary, is archived at
[`elicitation-completion-2026-08-25-full-draft.md`](../archive/specs/elicitation-completion-2026-08-25-full-draft.md);
the FE-1402 [rehearsal](../evidence/proofs/design/elicitation-completion-rehearsal.md) is a
golden-fixture candidate once re-expressed at kind level, not authority.

## The function

```text
evaluateCompletion(model, mustKnowRows) -> CompletionReport
```

`model` is the register-2 derived model at one target-document revision
([ADR-0003](../adr/0003-three-register-ir.md)). `mustKnowRows` is the parsed `## Must know`
table of one plugin file at one plugin version, with the static floor stated under it
([`sdcpn-plugin.md`](sdcpn-plugin.md) is the exemplar). The function is pure and reads nothing
else: not the transcript, conversation fluency, turn count, delivery state, session state, or a
deferral report. Each numbered statement below is a test the implementation must pass; the
[plain rendering](../evidence/proofs/design/elicitation-completion-plain.md) explains the same
rules in a second register.

## Shape of the answer

1. **A derived boolean plus an evidence-bearing report; never a gate, never a lifecycle status.**
   `complete` is recomputed on every read (kernel §9.5). The report lists, per failing demand, the
   node, slot, requirement, actual state, diagnostic, and supporting capture ids reached through
   register-2 support links. Diagnostics explain the boolean; they are not a second public status
   vocabulary, and no `complete` value is ever persisted or locks the document.
2. **Version-bound.** The report carries the plugin version and the target-document revision it
   read. Model state from one revision is never evaluated against rows from another; the caller
   retries on mismatch (`version-mismatch`).

## The rule

3. **Static floor first, as counts only.** Before objective-relative depth counts at all, the
   model must contain the floor the plugin states (for SDCPN: ≥1 `objective`, ≥2 `entity-type`,
   ≥1 `activity`, ≥1 `ordering/flow` with order spelled out). A floor check is a count of nodes
   of a kind; it assigns no precision and manufactures no evidence. Failing the floor fails
   completion regardless of any slot's quality.
4. **Presence is separate from slot quality.** Whether a node exists and whether its slots meet
   their rows are two checks with two diagnostics (`below-minimum-count`, `below-required-
   precision`). Neither passes on the strength of the other.
5. **Question-relative over the floor.** Every node in the dependency slice of every active
   `objective` must satisfy every `Must know` row for its kind. Nodes outside every slice are
   recorded but not demanded; their open issues stay visible and do not block.
6. **Universal active-anchor check.** Every active `objective` must have a non-empty dependency
   slice (its "the nodes it depends on" row, precision `at least 1`). An objective that depends
   on nothing fails with `unsupported-active-objective`; no objective is silently ignored, and the
   floor cannot substitute for this check.
7. **An empty selection fails.** A row whose kind has a node in the slice, but whose slot
   selects nothing on that node, fails with `no-selected-slot`; a demand never passes through an
   empty selection.

## What counts as a value

8. **Status ≠ precision ≠ confidence; statuses unordered.** Epistemic status (`explicit`,
   `inferred`, `tentative`, `defaulted`, `external-lookup`) says how content relates to its
   source; precision says how narrow the value is; confidence says claim strength. No ordering
   is defined over statuses. Each row's accepted statuses are explicit on that row or in the
   plugin's stated default (SDCPN: stated by the expert, or inferred and confirmed); a value under
   any other status fails with `inadmissible-status`, however precise or numeric it is.
9. **`not-mentioned` never passes.** It is a computed fact, not evidence; an unaddressed slot
   fails with `unaddressed`.
10. **"Unknown" / "later" is not a value.** "I don't know", "we'll measure it", and a promised
    source leave the slot open (recorded with the pointer, per pattern P10) and failing.
11. **An explicit accepted absence is a value only where the row allows it.** "Never happens" or
    "not applicable" passes only on a row whose `"not applicable" allowed` cell is `yes`, only
    when the absence is an active, traceable capture under an accepted status; elsewhere it
    fails with `unaccepted-absence`.
12. **Precision is checked against the row's word, not the number's look.** `range` does not
    satisfy `spread`; a `number` does not satisfy `range`; `spelled out` needs the structure a
    second reader could apply. A value below the row's precision fails with
    `below-required-precision` and the report names the smallest delta (pattern P12).
13. **Conflict and divergence fail conservatively.** A slot with two or more competing active
    captures fails with `open-conflict` until an explicit, user-cited resolution closes it. A
    slot whose `prescribed` and `practiced` readings diverge unresolved fails with
    `unresolved-divergence`; the function never averages, picks a side, or scores the more
    precise side as the value.
14. **Evidence must be reachable.** A stated value whose supporting captures are not active and
    traceable through register-2 support links fails with `missing-evidence`.

## What leaves the boolean untouched

15. **Stop, delivery, quiet, budget, and no-progress are not inputs.** A user asking to stop or
    pause, a delivered projection, an exhausted turn/token/time budget, and a detector's
    no-progress advisory are session facts. None of them appears in `evaluateCompletion`'s
    arguments, and re-running it before and after any of them yields the same report for the
    same `(model, mustKnowRows)`. Session control may ask, deliver, or stop on reading the
    report; it cannot author or override it. "Best useful result within this session" is
    delivering the current projection with its loss report while `complete` stays `false`.
16. **A later capture can make a complete document incomplete.** Completion never locks.

## Deferral licensing

17. **A read-time projection over existing authorities.** Whether a session may quiet with a
    recoverable re-entry is a session-control computation over the completion report, the
    capture-store snapshot revision, the session-log archive pointer and swept high-water mark,
    the pending-affordance slot, and the delivered projection reference. It is recomputed, never
    stored, and writes no target-document or capture-store truth.
18. **An undelivered best result cannot license deferral.** No authoritative schema carries a
    durable undelivered-delivery obligation, and none may be invented here; absent a durable
    delivery of the best current projection for the evaluated revision, licensing is `false`.
19. **No new persistence surface.** Neither completion nor licensing adds a record type, a
    lifecycle enum, a third store, or a field on `CaptureIssue`.

## Fixtures

The seed golden set is the FE-1402 rehearsal's prefix verdicts over the two FE-1361 transcripts,
re-expressed as (model, rows) pairs at kind level: an objective with an empty slice, a
range-not-spread duration, an unknown-as-value refusal, an unresolved regime divergence, and an
explicit-never absence on an allowing row. The condition-3 frozen table is test-bed material.

## Out of scope

Runtime, detector, controller, and TypeScript implementation; capture-envelope, `CaptureIssue`,
session-state, or durability-contract changes; projection, realization, delivery validation; any
public lifecycle-status enum.
