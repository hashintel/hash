# Elicitation-to-IR quality ruler v1

Status: **frozen grader ruler v1; not a baseline by itself**
Frozen: 2026-08-28
Scope: conversation through emitted Markdown IR; excludes Petri-net construction.

Calibrated against the two historical Vestera Mission 3 runs and four independent reports under
`docs/evidence/evaluations/vestera-ir-quality-calibration-v1/`. Those runs are
anchors, not a baseline distribution.

## Governing judgment

The artifact succeeds when objective-relevant evidence is acquired and its active meaning survives
into an IR that another reader can use without silently inventing facts, resolving tensions, or
upgrading uncertainty. A polished, long, or structurally complete IR is not necessarily a safe IR.

Report the score vector, gates, mistake ids, and cited evidence. The total is secondary. Never let a
high cold-utility or acquisition score average away a conservation or grounding gate.

## Evidence precedence

1. Grade acquisition from what the expert actually disclosed in the transcript.
2. Use hidden-ledger truth to identify distinctions and discoverability, not to overwrite a
   transcript hedge, narrower example, correction, or nondisclosure.
3. A value supplied only in an interviewer question is not user evidence unless the expert adopts
   it explicitly.
4. An expert hard stop limits the available turn budget. Unanswered suitable questions are not
   ordinary acquisition misses unless an earlier focused opportunity existed.
5. A concrete example within a ledger range is partial evidence. It is not simulator
   nondisclosure by itself, and it must not be generalized beyond the example without a mark.
6. Relevant absences in the ledger are questions the case does not settle. Credit locating and
   preserving the gap; do not reward invented answers.

## Omniscient score vector

Use integer scores 0–4 and the fixed weights below.

| Dimension | Weight | 0–1 | 2 | 3 | 4 |
| --- | ---: | --- | --- | --- | --- |
| Objective-aligned acquisition | 20 | No useful objective slice, or major reachable material missed | Useful slice plus consequential reachable misses | Reliable for the available turns; misses are bounded by reachability or hard stop | Unusually complete and efficient for the objective and turn budget |
| Semantic conservation | 20 | Active meaning is absent or dangerous | Useful content plus consequential omission, distortion, or scope shift | Disclosed objective-relevant meaning survives with only bounded defects | No consequential loss, distortion, or scope error |
| Epistemic and evidence fidelity | 20 | Facts, beliefs, assumptions, and unknowns are materially conflated | Many labels are useful, but at least one material claim is unsupported or hardened | Material status and provenance are reliable with named minor gaps | Every consequential claim is grounded or explicitly marked; corrections and tensions remain legible |
| Gap and loss discipline | 15 | Fullness substitutes for unknowns/losses | Important gaps exist but are missing, misclassified, or not actionable | Consequential gaps, absences, omissions, and projection losses are distinct and actionable | Smallest next questions and evidence sources are precise without completionist sprawl |
| Cold IR utility | 15 | A downstream reader cannot recover a useful model | Coherent conceptual skeleton, not safe for the full objective | Reliably usable for the stated partial boundary with explicit limits | Economical, audit-ready, and sufficient for the stated objective |
| Conversation quality and burden | 10 | Mechanical schema survey or unusable burden | Useful expert-language turns mixed with opening batteries or repeated multi-part surveys | Focused deepening with bounded burden | Adaptive, economical dialogue with high-value discoveries and no material overload |

Weighted total = `sum(score / 4 × weight)`, reported to one decimal.

### Historical anchors

These are calibration anchors, not pass thresholds:

| Run | Vector | Total | Interpretation |
| --- | --- | ---: | --- |
| `2026-08-28T10-56-59-351Z` | `3,2,2,2,2,2` | 55.0 | A valuable short Line 1 slice with buffer discovery, but Meridian meaning was lost and an interviewer-supplied washdown interpretation entered the IR. |
| `2026-08-28T11-03-53-683Z` | `3,2,2,3,2,2` | 58.8 | Broader acquisition and better gap inventory, but contingent/hedged rules were hardened and unsupported expert-posture claims entered the IR. |

A future grader need not reproduce these totals exactly, but a materially different dimension score
requires cited evidence and an explanation relative to the anchor.

## Hard-failure gates

Any true gate yields `gated-failure`, independent of total:

- fabricated load-bearing fact;
- silent hardening of ambiguity, hedge, unknown, or policy into practiced precision;
- silent collapse of conflict or correction;
- material IR statement with neither user evidence nor explicit assumption marking;
- syntactically full IR with no objective-relative process slice;
- schema-shaped interviewing that mechanically reads the IR headings;
- terminal delivery or completion based on model self-report rather than evidence-bearing criteria.

Gate calibration:

- **Silent hardening:** fire when active IR meaning is stronger and no nearby qualification prevents
  downstream use as established fact. A caveat buried elsewhere can still be a `HARDEN` or
  `GAP-MISCLASS`; it avoids the gate only when it meaningfully protects use.
- **Unsupported material statement:** includes objectives, boundaries, parameters, practiced
  policies, evidence status, and claims about the expert's willingness to assume or expected
  accuracy. It need not be a physical plant fact.
- **Terminal completion:** a local “IR sufficiency” claim can be an `UNSUPPORTED-COMPLETE` mistake
  without firing the gate when final delivery remains explicitly partial. Fire the gate when the
  claim or terminal act would stop needed elicitation.
- **Construction is out of scope:** PN schema, executability, and semantic correctness never affect
  these gates.

Historical gate anchors:

- Run 1: unsupported material statement **true**; the directional three-hour washdown value came
  from an unanswered interviewer proposal. Silent hardening **false** because the IR visibly named
  a clarification/conflict, though `HARDEN` still applies.
- Run 2: silent hardening **true** for hedged Line 3 exclusions and contingent Meridian policy;
  unsupported material statement **true** for unmarked claims about assumption tolerance and
  expected predictive accuracy.

## Stable mistake taxonomy

Do not rename these ids after v1:

| Id | Meaning |
| --- | --- |
| `ACQ-MISS` | Load-bearing, discoverable, realistically reachable material not elicited |
| `CONS-MISS` | Disclosed relevant material absent from the IR |
| `CONS-DISTORT` | Disclosed material changed materially in the IR |
| `INVENT` | Unsupported material presented as fact |
| `HARDEN` | Hedge, unknown, belief, or contingent policy made more certain or precise |
| `CONFLICT-COLLAPSE` | Correction, disagreement, or tension silently resolved |
| `SCOPE` | Claim generalized beyond its actor, family, line, time, or scenario |
| `GAP-MISCLASS` | Unknown, not-yet-asked, absence, omission, conflict, or loss classified incorrectly |
| `UNSUPPORTED-COMPLETE` | Readiness or terminal delivery not supported by evidence-bearing criteria |
| `OPENING-OVERLOAD` | Opening battery rather than a bounded conversational entry |
| `SCHEMA-QUESTIONING` | Interview follows output fields/headings rather than the expert's thread |
| `BURDEN` | Redundant, multi-part, or low-value questioning |
| `SIM-NONDISCLOSURE` | Suitable question asked but simulated expert did not disclose expected material |

Use provisional `NEW-*` only when no stable id fits, and surface it for human adjudication before
adding it to the ruler.

## Cold-review vector

The cold reviewer sees only the opening objective and IR. Score each 0–4:

1. objective and decision legibility;
2. process and relationship reconstructability;
3. constraints, variation, and policy/practice legibility;
4. epistemic legibility;
5. gap actionability;
6. reader effort and navigability.

Report the arithmetic mean to one decimal, never only a rounded integer. Also report downstream
semantic readiness independently:

- `unsafe`: downstream modeling would have to invent or silently resolve a load-bearing relation;
- `conditional`: a bounded conceptual or parameterized scaffold can proceed with named assumptions;
- `objective-credible`: the IR supports the stated decision within its declared boundary.

This is semantic readiness, not PN construction quality.

Historical cold anchors:

| Run | Vector | Mean | Readiness adjudication |
| --- | --- | ---: | --- |
| `2026-08-28T10-56-59-351Z` | `3,2,3,3,2,3` | 2.7 | `conditional`: conceptual scaffold only; topology, line-family matrix, calendars, due-date event, and validation remain unresolved. |
| `2026-08-28T11-03-53-683Z` | `3,2,3,3,3,3` | 2.8 | `conditional`: stronger scaffold; processing matrix, priority input, QA/deadline semantics, and Meridian outage rule remain unresolved. |

The historical cold reports used rounded `3 / 4`; v1 retains their vectors but fixes the reporting
rule. A mean near 3 does not imply objective-credible readiness when reconstructability is 2 or a
load-bearing contradiction remains.

## Adjudication rules

Expected role differences are not grader disagreements:

- the cold reviewer may find an IR clear while the omniscient grader proves a clear statement is
  unsupported;
- the cold reviewer can expose internal contradiction but cannot know transcript conservation;
- the omniscient grader's cold-utility estimate may be lower because it knows apparent clarity is
  unsafe.

Record a disagreement only when graders make incompatible claims about the same visible artifact
property or apply an anchor inconsistently. Human review is mandatory for all hard failures, all
`NEW-*` classes, and genuine disagreements.

## Prospective baseline use

Use the frozen prospective ledger
`../vestera-baseline/truth-ledger-v1-prospective.yaml`; also freeze the case, prompts,
model/configuration, and hard stop before running the unchanged current elicitation path. Use at
least three independent runs per case. Retain transcripts,
IRs, grader reports, model/config, turn/token/latency measures, and any simulator disclosure side
channel. Compare variants by dimension deltas and gate rates; never treat these two historical runs
as the baseline distribution.
