# FE-1404 condition-3 pre-run review record

No external model call occurred before either review. No condition-3 transcript, raw trace, operator
trace, or result existed. The draft lock SHA-256
`d308db20c73debd4b0c30e592f73a0975569064c2dfc2ec95a43e15a733fb5c0` is rejected pre-run evidence,
not a historical experiment seal.

## Review A — experiment contract and trace integrity

| Finding | Disposition before reseal |
| --- | --- |
| No-progress could reset on operator regrading, row drift, quote order, or evidence-array length. | Replace with a set-based delta over demanded evidence quoted from the new expert frame; add onset, reset, advisory, hard-stop, equal-length replacement, duplicate, reorder, and row-drift tests. |
| The operator received no explicit result envelope, vocabularies, or template. | Send the runtime schema's complete vocabulary and a concrete full-clause JSON template in the constructed operator request; inspect that request in tests. |
| GEN-Q02 used question-mark counting as a semantic proxy. | Remove the proxy and record layer-2 activation as `unobservable` in this run; retain the reviewed batching guidance and score its layer-3 transcript behavior manually, including imperative questions and permitted cohesive five-item groups. |
| Resume and continuation were not seal-bound and could rewrite prior evidence. | Validate seal hash, instrument/DemandTable versions, and exact model config before an API call. Write recovery segments to new raw/transcript paths and retain truncation/continuation seams. |
| The three verdict layers lacked an operational scorer contract. | Freeze verdict domain, authority, procedure, component failure/retry/unobservable rules, aggregation, and result paths in `condition-3-scoring.md`. |
| Runner synopsis still described only two conditions. | Reconcile the synopsis and usage text while retaining C1/C2 behavior. |
| Draft chronology allowed independent pre-run timestamps. | Require sealedAt and finalized lock mtime to postdate every locked file; reject an early self-declared sealedAt. |

## Review B — TypeScript and runtime-boundary audit

| Finding | Disposition before reseal |
| --- | --- |
| Manifest verification accepted missing, extra, duplicate, and empty row sets. | Make one canonical path list authoritative and require exact one-to-one manifest identity before hashing files. |
| Projection types and validation had dual ownership and contradictory states were representable. | Make one Valibot discriminated schema the runtime/type owner. Infer TypeScript types and reject incoherent pass/failure/activation/status states before selection or no-progress. |
| Evidence citations were not checked against the supplied transcript. | Validate every quote against the exact opening or expert turn it names; invalid projections retry and then fail visibly. |
| Condition-3 stopping constants were duplicated in the runner. | Use the frozen instrument's values for condition 3 and explicitly named legacy constants for conditions 1 and 2. |
| Compatibility and failure-path coverage was too narrow. | Exercise C1 and C2, exact-manifest failures, seal mismatch on both recovery modes, malformed/contradictory operator output, quote provenance, phase-triggered impatience, operator-adjudicated quote-novelty stopping, and canonicalized evidence order. |

## Type source-of-truth disposition

1. **Operator projection** — canonical source: `Condition3ProjectionSchema` — action: **infer**.
   Runtime parsing and TypeScript state space share one discriminated Valibot owner.
2. **Instrument vocabularies and manifest paths** — canonical source: exported `as const` registries
   in `condition-3-instrument.ts` — action: **import/project**. The runner and tests do not restate
   their literal unions.
3. **Checkpoint and recovery segment** — canonical source: runner-local persistence boundary —
   action: **keep-local**. These types add experiment-specific durable semantics not owned by the
   provider SDK or plugin contract.

## Review C — second-register stopping and scoring audit

| Finding | Disposition before reseal |
| --- | --- |
| Forced wrap was being reclassified as expert evidence. | Route it only as a labelled runner stimulus after turn 20; prohibit expert/operator calls and no-progress updates on those turns. |
| Failure discriminants admitted contradictory evidence/status/grade combinations. | Add failure-specific semantic checks and retry/fail before a projection can affect selection. |
| Machine result rows omitted card/submeasure aggregates and FM-10. | Expand the exact frozen inventory to five CPS card aggregates, five interaction dimensions, seven coverage dimensions, three excavation dimensions, and all FM-01–FM-15 signatures. |
| Continuation and budget terminality had permissive fallbacks. | Continue only classified deliveries and turn an impossible pending-close budget exit into an explicit invariant failure. |
| Unsupported active objective anchors had no lossless projection. | Add a schema-owned, quote-validated cardless diagnostic envelope outside the frozen row set; do not infer an FE-1431 binding. |
| Runner stimuli and retry state were ambiguous in prose. | Forbid stimulus provenance in the operator contract and keep `retry-required` outside the final verdict domain. |

## Review D — fresh unsupported-anchor and result-coherence audit

| Finding | Disposition before reseal |
| --- | --- |
| Unsupported active anchors lacked unresolved liveness and could starve frozen diagnostics. | Give each anchor explicit demanded/failing state, diagnose each label once, preserve it in later projections, and return to frozen diagnostic priority without claiming a binding. |
| Compatible card activation could be silently omitted. | Require the failure-corresponding predicate whenever that predicate exists for the clause; reject before selection or no-progress. |
| GEN-Q02 layer 2 could receive a verdict other than the frozen `unobservable`. | Enforce that component-specific invariant in the machine result validator. |
| Quote novelty was described as semantic no-progress. | Describe it as an operator-adjudicated live stopping input and score semantic improvement only after observation. |

## Review E — resumed seal-gate semantic audit

| Finding | Disposition before reseal |
| --- | --- |
| `inadmissible-status` could neither include nor omit its required predicate. | Reconcile the predicate/failure compatibility table and add a coherent-case regression test. |
| Static presence demands were assigned a manufactured grade requirement. | Preserve presence as cardinality-only: cited evidence is required, but `currentGrade=none` passes when the frozen demand declares no minimum grade. |
| CPS-Q03's reviewed `SP-SCRAP` target was absent from the activation matrix. | Restore the exact target without making a multiplicity or FE-1431 representation decision. |

## Review F — cardinality, turn-boundary, and continuity audit

| Finding | Disposition before reseal |
| --- | --- |
| Presence clauses lacked selected-node cardinality and mishandled truthful zero counts. | Add schema-owned `observedCount` and enforce cardinality, provenance, grade-none, and below-minimum failure invariants. |
| Turn-20 force wrap reached only turn 21. | Inject before the twentieth interviewer call and prevent every later expert/operator/no-progress frame. |
| Stitched non-final interviewer continuations were dropped from later semantic views. | Recompose all pieces at the provider boundary and in expert/operator views without rewriting stored source pieces. |
| Unsupported anchor labels lacked cross-projection continuity. | Require persistent active/retracted records, current-turn retraction evidence, and monotonic retraction. |
| Inadmissible evidence could retain status `none`. | Require a cited non-passing epistemic status. |

## Review G — clause-kind and anchor-materiality audit

| Finding | Disposition before reseal |
| --- | --- |
| Slot clauses accepted the presence-only `below-minimum-count` diagnostic. | Forbid it outside count demands and test the exact invalid state. |
| New support for a demanded unsupported anchor did not reset no-progress. | Include active-anchor evidence and current-turn retraction evidence in the frozen quote-novelty rule. |
| Unsupported-anchor evidence and rationale were mutable across projections. | Make original label/evidence/rationale append-only and separate durable resolution evidence/rationale. |

## Review H — result-vector, activation-provenance, and recovery audit

| Finding | Disposition before reseal |
| --- | --- |
| Independent completion/stopping/deferral results were absent. | Add distinct completion, user-stop, no-progress, budget, and deferral rows to the exact result inventory. |
| Retraction resolution provenance was mutable. | Preserve resolution evidence/rationale append-only after retraction. |
| Forced-wrap resume regenerated the completed prior turn. | Persist a dedicated resumable state and advance without popping or duplicating the prior turn/stimulus. |
| Objective-row activation was not evidence-bearing. | Add one exact quote/rationale record per active row and validate it before demand applicability. |
| Duplicate suppression looked back one projection only. | Build novelty against the entire prior projection history. |
| C1/C2 comparison evidence was not sealed/hash-bound. | Lock the prior readout/raw/transcript/model inputs and embed exact source hashes in comparison results. |

## Review I — exact row matching, global novelty, and result evidence audit

| Finding | Disposition before reseal |
| --- | --- |
| Objective rows cited transcript evidence but did not log or constrain the exact frozen `whenObjective` match. | Import the four FE-1402 labels into a closed row-discriminated registry. Require the exact row/predicate pair with quote/rationale, reject cross-row pairs in the runtime schema, and explicitly avoid choosing an FE-1431 binding representation. |
| Duplicate suppression excluded evidence once recorded on inactive assessments or retracted anchors. | Build novelty from every historical assessment quote and both original and resolution evidence for every historical unsupported anchor. Only new current-turn evidence on a currently demanded surface resets the streak. |
| Machine result validation admitted empty scored evidence, rationale, and comparison prose. | Make non-empty strings structural schema requirements and require at least one evidence citation for every pass/fail/mixed component. |

## Review J — objective cardinality, ladders, and recovery semantics audit

| Finding | Disposition before reseal |
| --- | --- |
| Unique active rows collapsed multiple active anchors and left the universal active-anchor count unreconciled. | Preserve every matched active objective as a stable anchor record, derive unique rows from those records, preserve explicit retractions, and reconcile `SF-OBJ` to matched plus unsupported active anchors. |
| The qualitative grade ladder was implemented as exact equality. | Execute both frozen qualitative and quantitative ladders and test that structured evidence satisfies a vocabulary-bound minimum. |
| Recovery trusted saved projection, selection, and no-progress state after checking only configuration binding. | Reparse and semantically replay the full operator history against the transcript before importing it; reject edited state before any resumed call. |
| C1/C2 result hashes were not exact literals. | Freeze the six reviewed source hashes in the instrument and require exact values in the machine result schema. |
| The runner-authored single-session correction was inside the admissible opening evidence string. | Preserve the common opening as expert evidence, label the correction as experiment stimulus, and exclude it from quote validation. |

## Fresh-context legibility review

The first second-register rendering graded the draft C− / not seal-ready. It found an invalid
operator template, incomplete semantic coherence checks, a no-progress close that never reached the
interviewer, missing recovery terminality/seams, and an underspecified result file. The complete
rendering, strain list, and evidence-backed dispositions are preserved in
`condition-3-legibility.md`. The draft remained unsealed and no condition-3 call occurred.

## Gate

The next seal is permitted only after every row above is implemented, formatting passes, focused
tests pass uncached, the full Brunch unit suite passes uncached, type/lint/build and documentation
checks pass, and the lock chronology verifier passes. The approved temporary dependency symlink is
removed after the final applicable post-run verification and before handoff.
