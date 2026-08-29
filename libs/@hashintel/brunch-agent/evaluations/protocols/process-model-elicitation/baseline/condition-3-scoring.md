# FE-1404 condition-3 frozen scoring contract

Status: preregistered before observation. This contract scores one qualitative run; it does not
estimate an effect size or reliability rate.

## Fixed destinations

- Narrative comparison and signature verdicts:
  `docs/evidence/evaluations/process-model-elicitation/baseline/condition-3-readout.md`
- Machine-readable component and aggregate results:
  `docs/evidence/evaluations/process-model-elicitation/baseline/condition-3-result.json`
- Provisional active checkpoints and immutable completed source segments, transcript, operator
  projections/attempts, and delivered model:
  `docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-3*`

## Verdict domain

Every scored component receives exactly one verdict:

- `pass`: all frozen checks for the component are supported by the named evidence.
- `fail`: at least one frozen check is contradicted and no retry rule applies.
- `mixed`: separately named subchecks contain both pass and fail results; never average them away.
- `unobservable`: the protocol lacks the authority or signal needed to judge the claim.
- `not-applicable`: the triggering state never occurs, so no behavior was demanded.

`retry-required` is an intermediate operator-attempt disposition, not a final result verdict.
Preserve the failed attempt and apply the preregistered retry rule. A later valid projection makes
the diagnostic-instrumentation component `mixed`; three failed attempts make it `fail`.

## Scorer and authority

The FE-1404 experiment producer performs the first fixed scoring pass from the immutable transcript,
raw trace, operator trace, frozen DemandTable, prior condition transcripts/readout, and FE-1407
catalogue. The producer may not use the situation pack to repair operator diagnostics. The situation
pack is used only for the inherited excavation checks after the transcript is fixed.

The coordinator's independent experiment/replay review is the acceptance authority. A disagreement
is recorded per component and adjudicated against quoted evidence; it is not resolved by changing
the scoring contract or transcript. The producer's first-pass result remains visible.

## Layer procedures

### Layer 1 — diagnostic correctness

For every operator projection, check the selected clause and all changed demanded assessments:

1. the objective row is active from transcript-visible objectives;
2. the coordinate and demand exactly match the frozen table;
3. status and grade describe the cited expert evidence independently;
4. failure diagnostic follows the FE-1402 evaluation rule;
5. every quote is verbatim at its named opening/expert turn; and
6. no interviewer-authored, operator-authored, situation-pack, or prior-run value supplies evidence.

Any invalid projection has the intermediate disposition `retry-required` until the third failed
attempt. Exhaustion is `fail` for
instrumentation and stops the run before the projection influences selection or no-progress. Later
valid retry output does not erase the failed attempt: the diagnostic-instrumentation component is
`mixed`, while the validated projection proceeds to ordinary layer scoring.

### Layer 2 — activation/deactivation correctness

For each frozen CPS binding, evaluate every declared predicate against the validated projection.
`pass` requires lossless clause and predicate match, correct deactivation after the demand passes,
and no pre-coordinate fire on `no-selected-slot`. A mismatch is `fail`. No card activation verdict
is derived from topical relevance.

GEN-Q02 has no lossless independent-question/pending-large-batch adjudicator in this experiment.
Its layer-2 semantic activation is therefore always `unobservable`; question-mark punctuation is
not a substitute. Its reviewed batching guidance remains part of the treatment and is scored only
at layer 3. E19 quick-rinse provenance and GEN-Q01 remain outside the matrix.

### Layer 3 — resulting evidence and stopping behavior

For each selected CPS diagnostic, compare the next interviewer move and later expert evidence with
the card's smallest expected delta. Score whether the question applies the reviewed card without
inventing evidence, whether the demanded status/grade changes, and whether the card deactivates.
An honest `unknown-to-user` may be a behavioral pass while the DemandTable clause remains failing.

Score GEN-Q02 manually from semantic independent questions, response-frame cohesion, and expert
burden. Requests are independent when each can be answered without the others; imperative or
colon-led requests count without `?`. A frame is cohesive when one shared scope and answer shape
lets the expert answer it as one artifact. A cohesive five-item frame may pass. More than five is
not automatically a failure, and two-to-four is not a universal optimum. Mark burden observed only
from an explicit expert cue or a clear abandoned/partial response; otherwise say not observed.

Score no-progress from the live operator-adjudicated quote-novelty rule over demanded evidence in
each new expert frame. Quote novelty has stopping consequences but does not itself prove semantic
improvement. Regrading, row drift, quote reorder/duplication, plans, promises, acknowledgements, and
burden cues do not reset it. New support for a demanded unsupported objective anchor, or
current-turn evidence explicitly retracting it, is material; anchor labels, original evidence, and
original rationale remain append-only across projections.
Delivery terminates the session and never retroactively resets the expert-frame streak or changes
completion. Score user stopping, no-progress, budget, delivery, deposit, and deferral separately.

From interviewer turn 20 onward, force-wrap content is a labeled runner-authored experiment
stimulus, not an expert frame. It cannot be submitted to the operator or update no-progress. This
reserves turns 20–24 for delivery; a fifth non-material expert frame can arise no later than turn 19,
so its one required closing interviewer response remains inside the frozen budget.

## Failure, unobservable, and aggregation rules

- Operator parse/schema/provenance failure: retry up to three attempts; then stop with preserved raw
  attempts. Do not select a diagnostic or update no-progress from invalid output.
- Classifier or provider truncation: preserve the original marker. Resume or continuation must use a
  new seal-bound segment; otherwise `fail` instrumentation and make no call.
- Store, sweep, support-link, durable delivery, re-entry, deferral licensing, production projection
  validation, compilation, simulation, and production affordance claims are `unobservable` here.
- A frozen CPS card's aggregate is `pass` only when layers 1, 2, and 3 pass. It is `fail` if layer 1 or 2 fails,
  or layer 3 contradicts the card. It is `mixed` when valid activations have different layer-3
  results. `unobservable` does not convert to pass. GEN-Q02 has no three-layer card aggregate: report
  its frozen layer-2 `unobservable` and manual layer-3 verdict separately.
- The run aggregate is a vector, never one numeric score: diagnostic layer, activation layer,
  evidence/stopping layer, completion, user-requested stopping, no-progress stopping, budget
  stopping, inherited interaction, semantic coverage, delivery, deposit, deferral, provenance, and
  target validity. The exact verdict vocabulary, result schema, and exhaustive component IDs
  (including each applicable FE-1407 signature) are owned by `Condition3ResultSchema` and
  `CONDITION_3_RESULT_COMPONENT_IDS` in `condition-3-instrument.ts`;
  `assertCompleteCondition3Result` rejects missing or duplicate rows. Report every component plus
  comparison with C1 and C2. Each comparison embeds the exact prior raw, transcript, and model
  SHA-256 values frozen as literal schema inputs; a merely well-shaped placeholder is invalid.
  Those prior artifacts and the reviewed readout are sealed inputs. Signature rows
  also carry their required observational label:
  `observed` maps to verdict `fail`, `not-observed` maps to `pass`, and `unobservable` maps to
  `unobservable`; non-signature rows forbid that label.
