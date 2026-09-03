# FE-1404 condition-3 preregistration

> **Amendment, 2026-08-25 — retired, never run.** Condition 3 was superseded before its first model
> call by ADR-0007: the completion-and-guidance treatment it preregistered is now the shipped
> harness (keys, repertoire, plugin cells, fold, computed completion), which the baseline protocol
> exercises directly as condition 5 rather than through a hand-run operator projection. Nothing
> below this note is altered.
>
> **Amendment, 2026-08-26 — instrument deleted.** The instrument this document preregistered —
> `condition-3-instrument.ts`, its lock, `condition-3-operator.md`, `condition-3-scoring.md`,
> `condition-3-legibility.md`, `condition-3-pre-run-review.md`, the condition-3 paths in
> `run.ts`, and its unit test — was removed from the tree. Salvage was assessed and none taken:
> its projection schema and semantic validators encoded the domain-keyed DemandTable that S-007
> ruled the wrong level, and the kind-level fold and `evaluateCompletion` in `packages/core` now
> do that job on the production path. This document and `condition-3-prompt.md` remain as the
> record; the deleted files are in git history under this directory. The file paths named below
> therefore no longer resolve.

Status: **frozen before the first model call**. The lock file beside this document records hashes
for the complete treatment and instrument. Any later change requires an explicit amendment; the
original run and original lock remain immutable.

## Question and comparison

Does the reviewed FE-1402 completion contract plus the FE-1403 surviving guidance change the
interviewer's stopping, reprioritisation, and refusal of unproductive deferral, while improving
transcript evidence for known condition-1/condition-2 gaps? Condition 3 uses the same opening,
simulated expert, interviewer family, classifier, default sampling, and inherited scoring surfaces.
It adds the single-session correction, phase-triggered impatience probe, no-progress rule, reviewed
cards/fragments, and a test-only operator projection.

Compare condition 3 with both prior conditions. Treat n=1 as existence evidence, never a rate or
effect-size estimate. Attribute operator-triggered behavior to the whole treatment, not to the
interviewer alone.

## Frozen treatment and information wall

- Interviewer: `claude-opus-5`, adaptive thinking, default provider sampling, no seed parameter.
- Simulated expert: `claude-sonnet-5`, thinking disabled, the unchanged private situation pack.
- Classifier: `claude-haiku-4-5-20251001`, thinking disabled.
- Operator: `claude-opus-5`, thinking disabled, JSON-only judgment over transcript-visible evidence.
- The interviewer receives the condition-3 prompt plus the opening message. It never receives the
  situation pack, answer-key values, operator rationale/evidence, whole projection, activation
  trace, or prior baseline transcript.
- After each expert answer, the interviewer receives only the selected clause coordinate, current
  status, current grade, demand, and failure diagnostic.
- The operator receives the transcript, frozen DemandTable, and activation vocabulary. It never
  receives the situation pack or prior baseline transcript.
- The expert never receives operator diagnostics or interviewer system guidance.

The frozen DemandTable, diagnostic priority, activation matrix, card IDs, model configuration, and
stopping constants live in `condition-3-instrument.ts`. The reviewed card wording and two fragments
live in `condition-3-prompt.md`. The judgment protocol lives in `condition-3-operator.md`; the
verdict domain, scorer authority, failure rules, aggregation, and fixed output destinations live in
`condition-3-scoring.md`.

## Preregistered observations

1. `CPS-Q01`: occurrence and repair remain separate; motor-like weak evidence keeps its actual
   verbal/point grade until the expert supplies more.
2. `CPS-Q02`: the interviewer asks about ramp scrap even if its own inventory never named it;
   unknown or a future observation remains a failing non-value.
3. `CPS-Q03`: the run seeks split minimum/contiguity plus ordinary ranges for extra changeovers and
   repeated scrap.
4. `CPS-Q04`: the practiced release gate is elicited and the card deactivates after structured
   evidence passes.
5. `CPS-Q05`: the practiced shared-resource conflict rule is elicited rather than inferred from a
   schedule.
6. `GEN-Q02`: layer-2 activation/deactivation is `unobservable` because this experiment has no
   lossless independent-question and pending-large-batch adjudicator. Layer-3 behavior is scored
   manually and must preserve cohesive five-item frames and recognize imperative independent
   questions; punctuation is never a semantic proxy and four is not a universal optimum.
7. Respectful close keeps completion, user stopping, no progress, delivery, budget, and deferral
   distinct and makes no recoverable-re-entry or durable-delivery promise.

E19 quick-rinse provenance is residual only. It is not a DemandTable clause, activation predicate,
or card. GEN-Q01 is absent. The activation matrix is an experiment-only evaluator of frozen
design-time disjunctions, not a FE-1405 amendment or compilable manifest.

## Measures

Score diagnostic correctness for every selected diagnostic. Score activation/deactivation and
card-result behavior only when that selected clause has a frozen card/predicate match; otherwise
those card-specific components are `not-applicable` and generic prompt behavior is described
without attributing it to a card:

1. **Diagnostic correctness:** clause/coordinate selection, transcript-visible status, actual grade,
   demand, failure, and evidence quote are correct under the frozen FE-1402 oracle.
2. **Activation/deactivation correctness:** every matrix match is lossless; the selected card and
   predicate match; cards do not fire before a coordinate exists or after its demanded state passes.
3. **Evidence/stopping behavior:** the next interviewer move seeks the card's smallest evidence
   delta, later evidence improves or honestly remains absent, and stop/delivery behavior follows the
   frozen distinctions.

Also score the inherited Bano/Ferrari dimensions, seven-category asked/probed/output coverage,
silent assumptions, excavation of tacit/belief/unknown facts, output target sanity, and stopping
discipline. Keep interaction quality, semantic coverage, stopping, delivery/deposit, provenance,
and target validity separate.

Applicable FE-1407 signatures: FM-01 through FM-15. For each, report observed,
not observed, or unobservable. Machinery-owned prevention is unobservable when this
evaluation-runner protocol lacks production store, sweep, support-link, persistence, projection
validation, compilation, simulation, affordance, or controller authority.

## Stopping rules

- The single-session constraint is stated before the first interviewer call.
- The impatience line is appended to the first expert reply after all static-floor clauses pass and
  at least one objective row is active. It is phase-triggered, not exchange-number-triggered.
- The live operator-adjudicated quote-novelty rule treats an expert frame as material when it
  supplies at least one new or replacement exact quote, attributed to that new expert turn, for a
  clause demanded in the new projection. This is a stopping input, not proof of semantic
  improvement; semantic correctness is scored after observation. Regrading, active-row drift,
  reordered or duplicate quotes, and evidence-array length alone never reset the streak. A new
  demanded quote—including new support or current-turn retraction evidence for an unsupported
  objective anchor—resets it even when it replaces an old quote at equal array length. Delivery is a
  separate terminal event, not an expert-frame reset. Plans, promises, burden cues,
  acknowledgements, and operator-only changes are non-material.
- Static-floor presence is cardinality-only: the projection records `observedCount`, requires cited
  transcript evidence for positive counts, assigns no grade, and passes exactly at the frozen
  minimum. Unsupported objective anchors persist under one label until a current-turn explicit
  retraction is recorded; they never disappear or become an FE-1431 binding implicitly.
- Every active objective anchor has its own stable label, transcript quote/rationale record, and
  exact FE-1402 `whenObjective` label as `matchingPredicate`; multiple anchors may project to one
  unique active row. The operator reconciles `SF-OBJ.observedCount` to matched plus unsupported
  active anchors and preserves explicit retractions durably. The row/predicate pair is
  discriminated and closed; a mismatch is invalid before it can demand clauses or activate
  guidance. The operator adjudicates the predicate from a transcript-visible objective rather than
  incidental topic similarity. This experiment log does not choose an FE-1431 binding
  representation.
- Raise `NP` at three consecutive non-material expert frames. Keep it raised until material expert
  evidence resets it. At five consecutive non-material expert frames, end questioning and require
  exactly one closing interviewer response containing the best useful result and explicit gaps.
  Whether that response is a delivery is recorded separately; this changes no completion assessment
  and does not retroactively reset the streak.
- Force a delivery request at interviewer turn 20 and hard-stop at turn 24, preserving inherited
  budget comparability. At and after turn 20 the runner supplies only a labeled experiment stimulus;
  it must not call the expert or operator and must not update no-progress. Delivery never asserts
  completion.
- The interviewer prompt instructs it to honor a user stop regardless of completion or licensing;
  the runner has no independent semantic user-stop detector, so compliance is scored behavior, not
  a machinery guarantee. Terminal precedence is: classified delivery; the one response after a
  no-progress hard stop; forced-wrap request at turn 20; hard budget at turn 24. This protocol cannot
  license deferral or prove durable delivery.

## Recovery binding and raw-evidence preservation

Before a resume or final continuation can call any model, the runner must match the checkpoint's
exact preregistration seal hash, instrument version, DemandTable version, and complete model
configuration to the current frozen values. It then reparses every saved projection through the
runtime schema and revalidates exact clause inventory, semantics, quote provenance, anchor
continuity, activation/card choice, and the complete no-progress history before importing any
checkpoint state. Condition-3 recovery writes a new numbered raw,
transcript, operator, and model segment. It hashes and names the source checkpoint, records the
truncation seam (expert regeneration, interviewer regeneration, or final continuation), leaves the
source file unchanged, and retains the original truncation marker. Only `in-progress`,
`forced-wrap-in-progress`, either truncation state, and `no-progress-hard-stop-pending-delivery` are
resumable; the forced-wrap state advances to the next interviewer turn without regenerating the
completed prior turn. Instrumentation exhaustion and terminal stops are not.

## Amendment rule

Do not change treatment, scoring, predicates, measures, or stopping after observing the run. If a
defect makes the run uninterpretable, preserve the failed run, add a dated amendment naming the
defect and expected consequence, seal a new lock, and label all later analysis exploratory or a new
preregistered run. Do not retroactively edit a transcript or raw trace.
