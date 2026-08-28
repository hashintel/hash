# FE-1402 completion-contract rehearsal

Status: **provisional, manual, judgment-bearing desk scoring** over the two FE-1361 baseline
transcripts. This memo owns the CPS-specific oracle, not the normative
[completion contract](../../../specs/elicitation-completion.md). It tests discrimination; no
harness, detector, store, or plugin implementation ran.

## Fixed replay inputs

- plugin-contract version: `cps-replay-plugin/2026-08-24.3`
- demand-table version: `cps-baseline-replay/2026-08-24.3`
- evidence: the committed condition 1 and condition 2 transcripts, scored readout, situation pack,
  and FE-1407 catalogue linked below
- prefix rule: `C1-E05` includes the opening and every user utterance available before condition
  1's fifth interviewer response

The baseline had no capture store. References such as `C1:E05/U` and `C2:E14/U:scenario-2` are
**replay evidence proxies** for exchange or span locations, not invented durable capture IDs. A
runtime `CompletionReport` must contain capture IDs reached through model support links.

## Provisional CPS DemandTable

This is a versioned oracle overlay for these two transcripts, not a final CPS plugin declaration.
The limited `kind(...)` and named-coordinate scopes below are concrete replay selections; they do
not introduce a general graph-query language.

```yaml
version: cps-baseline-replay/2026-08-24.3
staticFloor:
  - { id: SF-OBJ, type: presence, scope: kind(objective), minimumCount: 1 }
  - { id: SF-ENT, type: presence, scope: kind(entity-type), minimumCount: 2 }
  - { id: SF-ACT, type: presence, scope: kind(activity), minimumCount: 1 }
  - { id: SF-PATH, type: presence, scope: kind(ordering/flow), minimumCount: 1 }
  - id: SF-FLOW
    type: slot
    scope: kind(ordering/flow)
    slot: sequence
    minimumGrade: structured
    acceptedEpistemicStatuses: [explicit, inferred]
    acceptedAbsences: []
rows:
  - id: ROW-BREAKDOWN
    whenObjective: breakdown-reshuffle
    clauses:
      - { id: BR-CAP, type: slot, scope: where(kind(entity-type), category=line), slot: capabilities,
          minimumGrade: structured, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: BR-CAL, type: slot, scope: where(kind(boundary-condition), role=line-calendar), slot: pattern,
          minimumGrade: structured, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: BR-OCC, type: slot, scope: where(kind(dynamics), role=line-failure), slot: occurrenceFrequency,
          minimumGrade: range, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: BR-REPAIR, type: slot, scope: where(kind(dynamics), role=line-failure), slot: repairDuration,
          minimumGrade: quantiles, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: BR-POL, type: slot, scope: where(kind(policy), role=resource-conflict), slot: rule,
          minimumGrade: structured, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
  - id: ROW-IDLE-WASH
    whenObjective: idle-vs-washdown
    clauses:
      - { id: IW-REL, type: slot, scope: where(kind(boundary-condition), role=order-release), slot: condition,
          minimumGrade: structured, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: IW-CO-DUR, type: slot, scope: where(kind(dynamics), role=family-changeover), slot: duration,
          minimumGrade: range, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: IW-LATE, type: slot, scope: where(kind(objective), objectiveType=idle-vs-washdown), slot: latenessConsequence,
          minimumGrade: structured, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: IW-SCRAP, type: slot, scope: where(kind(dynamics), role=family-changeover), slot: rampScrap,
          minimumGrade: range, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
  - id: ROW-CHANGEOVER
    whenObjective: changeover-accounting
    clauses:
      - { id: CH-TAX, type: slot, scope: where(kind(entity-type), category=changeover), slot: directionClass,
          minimumGrade: vocabulary-bound, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: CH-DUR, type: slot, scope: where(kind(dynamics), role=family-changeover), slot: duration,
          minimumGrade: range, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: CH-CREW, type: slot, scope: where(kind(activity), role=family-changeover), slot: resourceRequirement,
          minimumGrade: structured, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: CH-SEQ, type: slot, scope: where(kind(policy), role=weekly-sequencing), slot: rule,
          minimumGrade: structured, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: CH-SCRAP, type: slot, scope: where(kind(dynamics), role=family-changeover), slot: rampScrap,
          minimumGrade: range, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
  - id: ROW-SPLIT
    whenObjective: split-run
    clauses:
      - { id: SP-BATCH, type: slot, scope: where(kind(activity), role=production-run), slot: batchStructure,
          minimumGrade: structured, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: SP-MIN, type: slot, scope: where(kind(constraint), role=minimum-run-size), slot: threshold,
          minimumGrade: range, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: SP-ELIG, type: slot, scope: where(kind(constraint), role=line-eligibility), slot: condition,
          minimumGrade: structured, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: SP-POL, type: slot, scope: where(kind(policy), role=split-contiguity), slot: rule,
          minimumGrade: structured, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: SP-CO, type: slot, scope: where(kind(dynamics), role=split-run), slot: extraChangeover,
          minimumGrade: range, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
      - { id: SP-SCRAP, type: slot, scope: where(kind(dynamics), role=split-run), slot: repeatedRampScrap,
          minimumGrade: range, acceptedEpistemicStatuses: [explicit, inferred], acceptedAbsences: [] }
```

`verbal < vocabulary-bound < structured` and `point < range < quantiles` are the applicable slot
orders. Status and grade are independent. `explicit` and `inferred` are accepted here; tentative,
defaulted, external-lookup, conflicts, and unaddressed states do not pass. An inferred value needs
traceable evidence spans. A documented-transformation basis is relevant only to external lookup.

The universal active-anchor check is reported as `ANCHOR:<coordinate>`. Every active objective
must match at least one row. The floor cannot satisfy this check. A demanded `diverged` slot would
fail with `unevaluable-divergence`; neither transcript produces a grade-bearing two-sided value
that the current shorthand can evaluate.

## Carry-forward and verdict procedure

For each condition, the assessment ledger is a complete assessment at E01 and at objective
activation E02, followed by exact deltas. At a later prefix, apply every ledger row for that prefix
and carry every omitted assessment forward unchanged. Evidence-support additions are deltas even
when a pass/fail result does not change. The prefix table restates the full current failing set;
therefore `complete = failing set is empty` is derivable at every prefix.

In the ledger, `accepted -> actual` means accepted epistemic statuses/absences followed by the
actual status or absence. Presence and anchor support use `n/a`. `U`, `S`, and `C` mean
unaddressed, stated, and conflicted. A failing stated value names its actual grade.

### Rehearsal-only no-progress oracle

This threshold is not runtime policy. After the last material frame, count consecutive interviewer
prefixes. New demanded evidence, a demanded slot/obligation change, or delivery resets the count.
Burden cues, promises, plans, and acknowledgements do not. Raise advisory `NP` on the third such
prefix and keep it raised until reset.

## Condition 1 assessment ledger

Active rows after E02: `ROW-BREAKDOWN`, `ROW-IDLE-WASH`, `ROW-CHANGEOVER`.

| Prefix | Clause / coordinate | Requirement | Actual state or grade | Accepted -> actual | Replay evidence proxy | Result / diagnostic |
| --- | --- | --- | --- | --- | --- | --- |
| E01 | SF-OBJ / `objective[general]` | count >= 1 | count 1 | n/a | `C1:opening` | pass |
| E01 | SF-ENT / `entity-type[*]` | count >= 2 | count 0 | n/a | `C1:opening` | fail `below-minimum-count` |
| E01 | SF-ACT / `activity[*]` | count >= 1 | count 0 | n/a | `C1:opening` | fail `below-minimum-count` |
| E01 | SF-PATH / `ordering/flow[*]` | count >= 1 | count 0 | n/a | `C1:opening` | fail `below-minimum-count` |
| E01 | SF-FLOW / `ordering/flow[*].sequence` | structured | no selected slot | explicit,inferred -> n/a | `C1:opening` | fail `no-selected-slot` |
| E01 | ANCHOR:`objective[general]` | >= 1 matched row | no match | n/a | `C1:opening` | fail `unsupported-active-anchor` |
| E02 | SF-OBJ / `objective[*]` | count >= 1 | count 3 | n/a | `C1:E02/U:Q1-Q3` | pass |
| E02 | SF-ENT / `entity-type[*]` | count >= 2 | count >= 6 | n/a | `C1:E02/U:process-equipment` | pass |
| E02 | SF-ACT / `activity[*]` | count >= 1 | count >= 4 | n/a | `C1:E02/U:route` | pass |
| E02 | SF-PATH / `ordering/flow[*]` | count >= 1 | count 1 | n/a | `C1:E02/U:route` | pass |
| E02 | SF-FLOW / `ordering/flow[route].sequence` | structured | S@structured | explicit,inferred -> explicit | `C1:E02/U:mix-mill-tint-fill-pack` | pass |
| E02 | ANCHOR:`objective[breakdown]` | >= 1 matched row | `ROW-BREAKDOWN` | n/a | `C1:E02/U:Q1` | pass |
| E02 | ANCHOR:`objective[idle-wash]` | >= 1 matched row | `ROW-IDLE-WASH` | n/a | `C1:E02/U:Q2` | pass |
| E02 | ANCHOR:`objective[changeover]` | >= 1 matched row | `ROW-CHANGEOVER` | n/a | `C1:E02/U:Q3` | pass |
| E02 | BR-CAP / `entity-type[line].capabilities` | structured | S@structured | explicit,inferred -> explicit | `C1:E02/U:equipment-restrictions` | pass |
| E02 | BR-CAL / `boundary[line-calendar].pattern` | structured | U | explicit,inferred -> none | `C1:E02/U:changeover-crew-day-shift-only` | fail `unaddressed`; crew calendar is not line calendar |
| E02 | BR-OCC / `where(kind(dynamics), role=line-failure).occurrenceFrequency` | range | no selected slot | explicit,inferred -> n/a | `C1:E02/U` | fail `no-selected-slot` |
| E02 | BR-REPAIR / `where(kind(dynamics), role=line-failure).repairDuration` | quantiles | no selected slot | explicit,inferred -> n/a | `C1:E02/U` | fail `no-selected-slot` |
| E02 | BR-POL / `policy[resource-conflict].rule` | structured | U | explicit,inferred -> none | `C1:E02/U` | fail `unaddressed` |
| E02 | IW-REL / `boundary[order-release].condition` | structured | U | explicit,inferred -> none | `C1:E02/U` | fail `unaddressed` |
| E02 | IW-CO-DUR / `dynamics[family-changeover].duration` | range | S@range | explicit,inferred -> explicit | `C1:E02/U:changeover-times` | pass |
| E02 | IW-LATE / `objective[idle-wash].latenessConsequence` | structured | S@structured | explicit,inferred -> explicit | `C1:E02/U:Meridian-first` | pass |
| E02 | IW-SCRAP / `dynamics[family-changeover].rampScrap` | range | absent: unknown-to-user | explicit,inferred; no absences -> explicit | `C1:E02/U:ramp-scrap-unknown` | fail `unaccepted-absence` |
| E02 | CH-TAX / `entity-type[changeover].directionClass` | vocabulary-bound | S@vocabulary-bound | explicit,inferred -> explicit | `C1:E02/U:directional-matrix` | pass |
| E02 | CH-DUR / `dynamics[family-changeover].duration` | range | S@range | explicit,inferred -> explicit | `C1:E02/U:25m-1h-3h` | pass |
| E02 | CH-CREW / `activity[family-changeover].resourceRequirement` | structured | S@verbal | explicit,inferred -> explicit | `C1:E02/U:two-techs` | fail `below-required-grade` |
| E02 | CH-SEQ / `policy[weekly-sequencing].rule` | structured | S@verbal | explicit,inferred -> explicit | `C1:E02/U:family-clustering` | fail `below-required-grade` |
| E02 | CH-SCRAP / `dynamics[family-changeover].rampScrap` | range | absent: unknown-to-user | explicit,inferred; no absences -> explicit | `C1:E02/U:ramp-scrap-unknown` | fail `unaccepted-absence` |
| E03 | BR-OCC / `dynamics[filler-jam,mill-motor].occurrenceFrequency` | range | filler S@range; motor S@verbal | explicit,inferred -> explicit | `C1:E03/U:weekly-or-two-and-rare` | fail `below-required-grade` on motor |
| E03 | BR-REPAIR / `dynamics[filler-jam,mill-motor].repairDuration` | quantiles | filler S@range; motor S@point | explicit,inferred -> explicit | `C1:E03/U:half-hour-to-half-shift-and-four-days-once` | fail `below-required-grade` |
| E04 | BR-CAL / `boundary[line-calendar].pattern` | structured | S@structured | explicit,inferred -> explicit | `C1:E04/U:06-14/14-22` | pass |
| E05 | CH-CREW / `activity[family-changeover].resourceRequirement` | structured | S@structured | explicit,inferred -> explicit | `C1:E05/U:operators-rinse-techs-switch` | pass |
| E06 | CH-SEQ / `policy[weekly-sequencing].rule` | structured | S@structured | explicit,inferred -> explicit | `C1:E06/U:07:30-and-fill-the-shift-confirmation` | pass |

E06 confirms scheduling-policy evidence and promises later data. It does **not** ask for a handoff.
No demanded assessment changes at E07-E21; E21 changes delivery state only.

### Condition 1 prefix verdicts

| Prefix | Available evidence / assessment delta | Current failing assessments after carry-forward | Complete | Stop event | Delivery / re-entry state | No progress |
| --- | --- | --- | --- | --- | --- | --- |
| C1-E01 | full E01 assessment | `SF-ENT,SF-ACT,SF-PATH,SF-FLOW,ANCHOR:general` | false | none | none / none | 0 |
| C1-E02 | full E02 activation assessment | `BR-CAL,BR-OCC,BR-REPAIR,BR-POL,IW-REL,IW-SCRAP,CH-CREW,CH-SEQ,CH-SCRAP` | false | none | none / none | reset |
| C1-E03 | `BR-OCC,BR-REPAIR` evidence/grade deltas | same as E02 | false | none | none / none | reset |
| C1-E04 | `BR-CAL` passes | `BR-OCC,BR-REPAIR,BR-POL,IW-REL,IW-SCRAP,CH-CREW,CH-SEQ,CH-SCRAP` | false | none | none / none | reset |
| C1-E05 | `CH-CREW` passes | `BR-OCC,BR-REPAIR,BR-POL,IW-REL,IW-SCRAP,CH-SEQ,CH-SCRAP` | false | none | none / none | reset |
| C1-E06 | `CH-SEQ` passes on policy evidence | `BR-OCC,BR-REPAIR,BR-POL,IW-REL,IW-SCRAP,CH-SCRAP` | false | none | none / none | reset; last material frame |
| C1-E07 | no delta; acknowledgment/evidence caution | same as E06 | false | none | none / none | streak 1 |
| C1-E08 | no delta; assumptions-register acknowledgment | same as E06 | false | none | none / none | streak 2 |
| C1-E09 | time-pressure/impatience cue; no assessment delta | same as E06 | false | interviewer initiates stopping | promised artifact absent / none | `NP`, streak 3 |
| C1-E10 | acknowledgment only | same as E06 | false | stopping persists | none / none | `NP`, streak 4 |
| C1-E11 | parking acknowledgment | same as E06 | false | future continuation implied | none / none | `NP`, streak 5 |
| C1-E12 | social close | same as E06 | false | conversational close | none / none | `NP`, streak 6 |
| C1-E13 | social close | same as E06 | false | conversational close | none / none | `NP`, streak 7 |
| C1-E14 | emoji acknowledgment | same as E06 | false | conversational close | none / none | `NP`, streak 8 |
| C1-E15 | dash acknowledgment | same as E06 | false | conversational close | none / none | `NP`, streak 9 |
| C1-E16 | thread declared parked | same as E06 | false | deferral asserted | none / none; unlicensed | `NP`, streak 10 |
| C1-E17 | social close | same as E06 | false | conversational close | none / none | `NP`, streak 11 |
| C1-E18 | conversation called complete | same as E06 | false | conversational close | none / none | `NP`, streak 12 |
| C1-E19 | closed plus future-session promise | same as E06 | false | deferral asserted | none / none; unlicensed | `NP`, streak 13 |
| C1-E20 | emoji; runner then exhausts budget | same as E06 | false | budget exhaustion follows | none / none | `NP`, streak 14 |
| C1-E21 | forced-wrap specification; no new source evidence | same as E06 | false | external forced wrap | delivered, unvalidated specification / none | reset by delivery |

The eleven interviewer responses E10-E20 are the pleasantry/delivery loop. The advisory begins at
E09, when the third non-material prefix arrives, and persists until E21 delivery. E09 is not a
user request for quiet or an explicit request to leave: it is a time-pressure cue followed by
interviewer-initiated stopping. The useful action remained expressible throughout: deliver the
best caveated result now, expose the six blockers, and stop with `complete: false`.

## Condition 2 assessment ledger

Active rows after E02: all four rows, including `ROW-CHANGEOVER`; changeover accounting is an
explicit objective and also supports idle/split reasoning.

| Prefix | Clause / coordinate | Requirement | Actual state or grade | Accepted -> actual | Replay evidence proxy | Result / diagnostic |
| --- | --- | --- | --- | --- | --- | --- |
| E01 | SF-OBJ / `objective[general]` | count >= 1 | count 1 | n/a | `C2:opening` | pass |
| E01 | SF-ENT / `entity-type[*]` | count >= 2 | count 0 | n/a | `C2:opening` | fail `below-minimum-count` |
| E01 | SF-ACT / `activity[*]` | count >= 1 | count 0 | n/a | `C2:opening` | fail `below-minimum-count` |
| E01 | SF-PATH / `ordering/flow[*]` | count >= 1 | count 0 | n/a | `C2:opening` | fail `below-minimum-count` |
| E01 | SF-FLOW / `ordering/flow[*].sequence` | structured | no selected slot | explicit,inferred -> n/a | `C2:opening` | fail `no-selected-slot` |
| E01 | ANCHOR:`objective[general]` | >= 1 matched row | no match | n/a | `C2:opening` | fail `unsupported-active-anchor` |
| E02 | SF-OBJ / `objective[*]` | count >= 1 | count 4 | n/a | `C2:E02/U:four-objectives` | pass |
| E02 | SF-ENT / `entity-type[*]` | count >= 2 | count 3 | n/a | `C2:E02/U:three-lines` | pass |
| E02 | SF-ACT / `activity[*]` | count >= 1 | count 0 | n/a | `C2:E02/U` | fail `below-minimum-count` |
| E02 | SF-PATH / `ordering/flow[*]` | count >= 1 | count 0 | n/a | `C2:E02/U` | fail `below-minimum-count` |
| E02 | SF-FLOW / `ordering/flow[*].sequence` | structured | no selected slot | explicit,inferred -> n/a | `C2:E02/U` | fail `no-selected-slot` |
| E02 | ANCHOR:`objective[breakdown]` | >= 1 matched row | `ROW-BREAKDOWN` | n/a | `C2:E02/U:breakdown-response` | pass |
| E02 | ANCHOR:`objective[idle-wash]` | >= 1 matched row | `ROW-IDLE-WASH` | n/a | `C2:E02/U:idle-vs-wash` | pass |
| E02 | ANCHOR:`objective[changeover]` | >= 1 matched row | `ROW-CHANGEOVER` | n/a | `C2:E02/U:changeover-accounting` | pass |
| E02 | ANCHOR:`objective[split]` | >= 1 matched row | `ROW-SPLIT` | n/a | `C2:E02/U:split-runs` | pass |
| E02 | BR-CAP / `entity-type[line].capabilities` | structured | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E02 | BR-CAL / `boundary[line-calendar].pattern` | structured | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E02 | BR-OCC / `dynamics[mill-motor].occurrenceFrequency` | range | U | explicit,inferred -> none | `C2:E02/U:four-day-again-objective` | fail `unaddressed` |
| E02 | BR-REPAIR / `dynamics[mill-motor].repairDuration` | quantiles | motor S@point | explicit,inferred -> explicit | `C2:E02/U:four-day-again-objective` | fail `below-required-grade` |
| E02 | BR-POL / `policy[resource-conflict].rule` | structured | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E02 | IW-REL / `boundary[order-release].condition` | structured | S@verbal | explicit,inferred -> explicit | `C2:E02/U:next-morning-release` | fail `below-required-grade` |
| E02 | IW-CO-DUR / `dynamics[family-changeover].duration` | range | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E02 | IW-LATE / `objective[idle-wash].latenessConsequence` | structured | S@verbal | explicit,inferred -> explicit | `C2:E02/U:on-time-ship-and-Meridian-risk` | fail `below-required-grade` |
| E02 | IW-SCRAP / `dynamics[family-changeover].rampScrap` | range | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E02 | CH-TAX / `entity-type[changeover].directionClass` | vocabulary-bound | S@verbal | explicit,inferred -> explicit | `C2:E02/U:changeover-concern` | fail `below-required-grade` |
| E02 | CH-DUR / `dynamics[family-changeover].duration` | range | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E02 | CH-CREW / `activity[family-changeover].resourceRequirement` | structured | S@verbal | explicit,inferred -> explicit | `C2:E02/U:shared-crew` | fail `below-required-grade` |
| E02 | CH-SEQ / `policy[weekly-sequencing].rule` | structured | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E02 | CH-SCRAP / `dynamics[family-changeover].rampScrap` | range | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E02 | SP-BATCH / `activity[production-run].batchStructure` | structured | S@verbal | explicit,inferred -> explicit | `C2:E02/U:split-big-orders` | fail `below-required-grade` |
| E02 | SP-MIN / `constraint[minimum-run-size].threshold` | range | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E02 | SP-ELIG / `constraint[line-eligibility].condition` | structured | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E02 | SP-POL / `policy[split-contiguity].rule` | structured | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E02 | SP-CO / `dynamics[split-run].extraChangeover` | range | S@verbal | explicit,inferred -> explicit | `C2:E02/U:extra-changeover-concern` | fail `below-required-grade` |
| E02 | SP-SCRAP / `dynamics[split-run].repeatedRampScrap` | range | U | explicit,inferred -> none | `C2:E02/U` | fail `unaddressed` |
| E03 | IW-LATE / `objective[idle-wash].latenessConsequence` | structured | S@vocabulary-bound | explicit,inferred -> explicit | `C2:E03/U:promise-date-and-account-hierarchy` | fail `below-required-grade` |
| E04 | IW-LATE / `objective[idle-wash].latenessConsequence` | structured | S@structured | explicit,inferred -> explicit | `C2:E04/U:Meridian-cliff-and-slopes` | pass |
| E05 | SF-ACT / `activity[*]` | count >= 1 | count >= 7 | n/a | `C2:E05/U:order-walk` | pass |
| E05 | SF-PATH / `ordering/flow[*]` | count >= 1 | count 1 | n/a | `C2:E05/U:order-walk` | pass |
| E05 | SF-FLOW / `ordering/flow[order].sequence` | structured | S@structured | explicit,inferred -> explicit | `C2:E05/U:demand-to-truck` | pass |
| E06 | BR-CAP / `entity-type[line].capabilities` | structured | S@structured | explicit,inferred -> explicit | `C2:E06/U:qualifications-capacities` | pass |
| E06 | SP-BATCH / `activity[production-run].batchStructure` | structured | S@structured | explicit,inferred -> explicit | `C2:E06/U:pipelined-batches` | pass |
| E06 | SP-ELIG / `constraint[line-eligibility].condition` | structured | S@structured | explicit,inferred -> explicit | `C2:E06/U:line-qualification` | pass |
| E07 | IW-CO-DUR / `dynamics[family-changeover].duration` | range | S@range | explicit,inferred -> explicit | `C2:E07/U:directional-duration-matrix` | pass |
| E07 | CH-TAX / `entity-type[changeover].directionClass` | vocabulary-bound | S@vocabulary-bound | explicit,inferred -> explicit | `C2:E07/U:family-direction-classes` | pass |
| E07 | CH-DUR / `dynamics[family-changeover].duration` | range | S@range | explicit,inferred -> explicit | `C2:E07/U:directional-duration-matrix` | pass |
| E08 | BR-OCC / `dynamics[filler-jam,mill-motor].occurrenceFrequency` | range | filler S@range; motor U | explicit,inferred -> explicit/none | `C2:E08/U:one-in-ten-and-every-couple-weeks` | fail `unaddressed` on motor |
| E08 | BR-REPAIR / `dynamics[filler-jam,mill-motor].repairDuration` | quantiles | filler S@range; motor S@point | explicit,inferred -> explicit | `C2:E02/U:four-days;C2:E08/U:20m-to-rest-of-shift` | fail `below-required-grade` |
| E09 | BR-CAL / `boundary[line-calendar].pattern` | structured | S@structured | explicit,inferred -> explicit | `C2:E09/U:shifts-and-coverage` | pass |
| E09 | CH-CREW / `activity[family-changeover].resourceRequirement` | structured | S@structured | explicit,inferred -> explicit | `C2:E09/U:crew-calendar` | pass |
| E11 | IW-REL / `boundary[order-release].condition` | structured | S@structured | explicit,inferred -> explicit | `C2:E11/U:credit-allocation-hold` | pass |
| E14 | BR-POL / `policy[resource-conflict].rule` | structured | S@structured | explicit,inferred -> explicit | `C2:E14/U:crew-priority` | pass |
| E14 | CH-SEQ / `policy[weekly-sequencing].rule` | structured | S@structured | explicit,inferred -> explicit | `C2:E14/U:campaign-and-Saturday-trigger` | pass |
| E15 | CH-SEQ / `policy[weekly-sequencing].rule` | structured | S@structured | explicit,inferred -> explicit | `C2:E14/U;C2:E15/U:tie-break-end-horizon` | pass; support delta |
| E18 | CH-CREW / `activity[family-changeover].resourceRequirement` | structured | S@structured | explicit,inferred -> explicit | `C2:E09/U:crew-calendar;C2:E18/U:big-wash-whole-line` | pass; compatible support delta |

At E20 the available exchange evidence is limited to the named holes in splitting, granularity,
and distributions. Ramp scrap, maintenance/CMMS evidence, and minimum-run facts occur only in the
hidden oracle/demand assessment and are not attributed to E20.

The quick-rinse branch remains residual evidence outside this bounded oracle. E18 says the user
does not know whether rinses cascade. E19's “two simultaneous rinse servers” possibility is
interviewer-authored, and the user's prompted half-memory is not used as support. Neither conflicts
with the explicit two-technician big-wash evidence, so `CH-CREW` stays passed after E09.

### Condition 2 prefix verdicts

| Prefix | Available evidence / assessment delta | Current failing assessments after carry-forward | Complete | Stop event | Delivery / re-entry state | No progress |
| --- | --- | --- | --- | --- | --- | --- |
| C2-E01 | full E01 assessment | `SF-ENT,SF-ACT,SF-PATH,SF-FLOW,ANCHOR:general` | false | none | none / none | 0 |
| C2-E02 | full E02 activation assessment | `SF-ACT,SF-PATH,SF-FLOW,BR-CAP,BR-CAL,BR-OCC,BR-REPAIR,BR-POL,IW-REL,IW-CO-DUR,IW-LATE,IW-SCRAP,CH-TAX,CH-DUR,CH-CREW,CH-SEQ,CH-SCRAP,SP-BATCH,SP-MIN,SP-ELIG,SP-POL,SP-CO,SP-SCRAP` | false | none | none / none | reset |
| C2-E03 | `IW-LATE` support/grade delta | same as E02 | false | none | none / none | reset |
| C2-E04 | `IW-LATE` passes | E02 minus `IW-LATE` | false | none | none / none | reset |
| C2-E05 | `SF-ACT,SF-PATH,SF-FLOW` pass | `BR-CAP,BR-CAL,BR-OCC,BR-REPAIR,BR-POL,IW-REL,IW-CO-DUR,IW-SCRAP,CH-TAX,CH-DUR,CH-CREW,CH-SEQ,CH-SCRAP,SP-BATCH,SP-MIN,SP-ELIG,SP-POL,SP-CO,SP-SCRAP` | false | none | none / none | reset |
| C2-E06 | `BR-CAP,SP-BATCH,SP-ELIG` pass | `BR-CAL,BR-OCC,BR-REPAIR,BR-POL,IW-REL,IW-CO-DUR,IW-SCRAP,CH-TAX,CH-DUR,CH-CREW,CH-SEQ,CH-SCRAP,SP-MIN,SP-POL,SP-CO,SP-SCRAP` | false | none | none / none | reset |
| C2-E07 | `IW-CO-DUR,CH-TAX,CH-DUR` pass | `BR-CAL,BR-OCC,BR-REPAIR,BR-POL,IW-REL,IW-SCRAP,CH-CREW,CH-SEQ,CH-SCRAP,SP-MIN,SP-POL,SP-CO,SP-SCRAP` | false | none | none / none | reset |
| C2-E08 | `BR-OCC,BR-REPAIR` support/grade deltas | same as E07 | false | none | none / none | reset |
| C2-E09 | `BR-CAL,CH-CREW` pass | `BR-OCC,BR-REPAIR,BR-POL,IW-REL,IW-SCRAP,CH-SEQ,CH-SCRAP,SP-MIN,SP-POL,SP-CO,SP-SCRAP` | false | time pressure prompts planning, interview continues | none / none | reset |
| C2-E10 | promise of CMMS/ERP and future slot; no assessment delta | same as E09 | false | deferral proposed | none / none; unlicensed | streak 1 |
| C2-E11 | `IW-REL` passes | `BR-OCC,BR-REPAIR,BR-POL,IW-SCRAP,CH-SEQ,CH-SCRAP,SP-MIN,SP-POL,SP-CO,SP-SCRAP` | false | none | none / none | reset |
| C2-E12 | release-pull promise; no assessment delta | same as E11 | false | future work planned | none / none | streak 1 |
| C2-E13 | logistics promise; no assessment delta | same as E11 | false | future work planned | none / none | streak 2 |
| C2-E14 | `BR-POL,CH-SEQ` pass | `BR-OCC,BR-REPAIR,IW-SCRAP,CH-SCRAP,SP-MIN,SP-POL,SP-CO,SP-SCRAP` | false | none | none / none | reset |
| C2-E15 | `CH-SEQ` support delta | same as E14 | false | none | none / none | reset |
| C2-E16 | export promise; no assessment delta | same as E14 | false | future work planned | none / none | streak 1 |
| C2-E17 | raw-pull promise; no assessment delta | same as E14 | false | future work planned | none / none | streak 2 |
| C2-E18 | `CH-CREW` gains compatible big-wash support and stays passed; quick-rinse branch remains residual | same as E14 | false | observation planned | none / none; unlicensed | reset by demanded support change |
| C2-E19 | no oracle delta; interviewer-authored parallel-rinse possibility is excluded | same as E14 | false | observation plan refined | none / none | streak 1 |
| C2-E20 | exchange names only splitting, granularity, distributions; no assessment delta | same as E14 | false | interviewer quiets for tomorrow | none / none; unlicensed | streak 2 |
| C2-E21 | first forced-wrap delivery; no source-evidence delta | same as E14 | false | budget exhaustion / forced wrap | partial specification / none | reset by delivery |
| C2-E22 | additional delivered sections; no assessment delta | same as E14 | false | repeated forced wrap | additional sections / none | reset by delivery |
| C2-E23 | final delivered specification; no assessment delta | same as E14 | false | hard-stop delivery | final specification / none | reset by delivery |

No C2 arm reaches the third consecutive non-material prefix. Plans do not reset the streak, but
E11 evidence, E14 policy evidence, E15/E18 support, and E21-E23 deliveries do. No false `NP` is
raised. The final boolean remains false, independently and visibly, because
the carried ledger includes the never-asked ramp-scrap and minimum-run obligations.

## Failure-signature discrimination

| FE-1407 signature | Replay result |
| --- | --- |
| FM-01 pleasantry-loop stall | `NP` begins at C1-E09 and persists through the eleven-response E10-E20 delivery loop; it does not assert completion. |
| FM-02 delivery deferral without deposit | C1 parks a deliverable while a caveated result is possible; the best current projection was not durably delivered, so current deferral licensing must fail. |
| FM-03 phantom re-entry | Both conditions name future sessions without durable revision, archive pointer, located obligations, or recoverable affordance. |
| FM-04 premature accommodation | C1's time-pressure cue produces interviewer stopping at E09; session stopping is allowed while completion remains false. |
| FM-05 budget exhaustion | Forced wrap stops both runs but changes no assessment. |
| FM-08 never-asked coverage | `IW-SCRAP`, `CH-SCRAP`, and `SP-SCRAP` remain explicit blockers despite never being asked in C2. |
| FM-09 complementary misses | The same DemandTable exposes different carried failure sets in the two runs; no variance-reduction claim follows from n=1 per condition. |
| FM-13 fluent incompleteness | C2 delivery and “complete” prose cannot override the non-empty clause failure set. |

The catalogue's prevention grades are unchanged: specified and candidate mechanisms are design
claims, not implementation proof.

## Amendments and residual strain

The rehearsal forced presence/cardinality clauses, the universal active-anchor check, versioned
plugin/demand inputs, evidence-bearing clause assessments, conservative divergence failure, and a
read-time deferral-licensing projection over existing authorities into the normative contract.
Those amendments are folded into the linked spec. Carry-forward and evidence-proxy rules remain
rehearsal method here, not normative runtime behavior.

Residual judgment remains in model selection and folding: a different defensible provisional CPS
oracle could choose different coordinates or grades. The stable clause IDs and complete carried
failure sets make that disagreement local and reviewable instead of hiding it in family-level
prose. Two fixed runs are existence evidence only, not rate estimates.

## Successor evidence

### FE-1403 — guidance assembly

- Drive questions from clause diagnostics, especially `BR-OCC`, `BR-REPAIR`, ramp scrap, minimum
  run size, split policy, and release; cards must not claim reflective self-inventory can
  find never-asked coverage.
- A close card must support the best useful result now: state clause-level gaps, durably deliver
  current work, and quiet only after existing authorities pass deferral licensing.
- Preserve explicit/inferred/tentative distinctions and evidence links separately from grade.

### FE-1404 — condition-3 run

- Score the version-bound report at each prefix and score stop, quiet, delivery, deferral licensing,
  no-progress, and budget events separately.
- Keep ramp scrap hidden in the oracle, reposition impatience during interview, and test that an
  unmatched anchor, empty presence scope, demanded conflict, or open ramp-scrap clause prevents
  completion.
- Test licensed deferral by recomputing it from capture-store revision, located blockers,
  session-log archive/high-water/tail, pending affordance, and a durable current projection;
  prompt-only evidence cannot prove those authorities.

### FE-1431 — plugin authoring

- Make the final CPS DemandTable author-readable beside model slots and bind its digest into every
  report.
- Define evaluable constituents for `diverged`; until then retain `unevaluable-divergence`. The
  intended later rule may require both sides or explicitly allow either.
- Resolve absent-slot location and alternative-satisfier authoring without expanding this replay's
  limited scope expressions into a generic query language.
- Route any durable undelivered-delivery obligation to an approved durability-contract owner;
  neither `CaptureIssue` nor this completion contract has that authority today.

## Evidence bundle

- [FE-1407 failure catalogue](../../../research/elicitation/frontier-model-elicitor-failure-catalogue.md)
- [baseline readout](../../evaluations/vestera-legacy-baseline/readout.md)
- [condition 1 transcript](../../evaluations/vestera-legacy-baseline/transcripts/condition-1.md)
- [condition 2 transcript](../../evaluations/vestera-legacy-baseline/transcripts/condition-2.md)
- [baseline situation pack](../../../../evaluations/cases/vestera-scheduling/situation-pack.md)
- [baseline protocol](../../../../evaluations/protocols/legacy-baseline/protocol.md)
- [plugin contract](../../../specs/plugin-contract.md) and
  [ADR-0003](../../../adr/0003-three-register-ir.md)

No web research was needed: this is manual scoring over fixed committed evidence.
