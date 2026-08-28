# Elicitation-to-IR calibration adjudication v1

Date: 2026-08-28
Scope: two historical Vestera Mission 3 conversations through recovered Markdown IR only.
Petri-net construction did not influence any judgment.

## Inputs retained

| Run | Omniscient report | Cold report |
| --- | --- | --- |
| `2026-08-28T10-56-59-351Z` | `runbook-headless-2026-08-28T10-56-59-351Z.omniscient.md` | `runbook-headless-2026-08-28T10-56-59-351Z.cold.md` |
| `2026-08-28T11-03-53-683Z` | `runbook-headless-2026-08-28T11-03-53-683Z.omniscient.md` | `runbook-headless-2026-08-28T11-03-53-683Z.cold.md` |

The omniscient evaluators saw the situation pack, retrospective truth ledger, transcript, and IR.
The cold evaluators saw only the opening objective and assigned IR. Each review ran in a separate
context.

## Results

### Omniscient

| Run | Acquisition | Conservation | Epistemic fidelity | Gaps/loss | Cold estimate | Burden | Total | Gates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Run 1 | 3 | 2 | 2 | 2 | 2 | 2 | 55.0 | unsupported material statement |
| Run 2 | 3 | 2 | 2 | 3 | 2 | 2 | 58.8 | silent hardening; unsupported material statement |

Run 2 is directionally stronger, but not by enough to change its safety status. It acquired the
idle-hold decision, line capabilities, directional washdowns, shared crew, VW-02 exception,
customer hierarchy, and more calendars. Its IR also made assumptions and losses more visible. It
still omitted part of the scheduling objective, left objective-critical run-size and outage
relations unresolved, and converted hedged/contingent evidence into hard rules.

Run 1's shorter path acquired one unusually useful concrete slice, including the Line 1
mill-to-fill blockage. It then lost the disclosed Meridian priority and presented an arithmetic
interpretation from an unanswered interviewer question as directional washdown evidence.

### Cold

| Run | Objective | Reconstruction | Constraints/policy | Epistemics | Gap actionability | Navigability | Mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Run 1 | 3 | 2 | 3 | 3 | 2 | 3 | 2.7 |
| Run 2 | 3 | 2 | 3 | 3 | 3 | 3 | 2.8 |

Both original cold reports rounded their means to `3 / 4`. That obscured the difference and could
be misread as construction readiness. The vectors show the useful result: both are clear conceptual
scaffolds, Run 2 has more actionable gaps, and neither is objective-credible without inventing or
resolving load-bearing relations. The frozen prompt now reports one decimal and a separate semantic
readiness judgment.

## Cross-role adjudication

### Agreements

Both roles independently found:

- a coherent objective-relative scheduling skeleton rather than empty heading completion;
- strong navigability and explicit unsettled-state vocabulary;
- process reconstructability capped at `2` by missing topology, parameter, and completion semantics;
- the Run 1 contradiction between “no assumptions” and a generalized tint-letdown assumption;
- the Run 1 washdown-direction ambiguity;
- the Run 2 Meridian-on-Line-2 versus outage-to-Line-1 tension;
- the Run 2 QA-boundary versus QA-completion ambiguity;
- actionable value in line/SKU capability, timing, crew, run-size, and validation follow-ups.

### Expected role differences

The cold reviewers scored visible utility `3` on the old rounded scale while omniscient graders
estimated cold utility `2`. This is not a factual disagreement. Cold reviewers could see an
organized and explicit partial artifact; omniscient graders knew that some apparently clear claims
were unsupported or hardened. Version 1 keeps both judgments: cold usability is reported as a
vector/decimal, while hidden-evidence safety remains governed by conservation, grounding, and gates.

The cold reviewers discovered relevant absences not explicit in the retrospective ledger:

- which resource each stage reserves and whether orders overlap across stages;
- the event that satisfies a due date;
- the demand-book field that identifies customer priority;
- Monday initial line-family state;
- Friday-horizon carryover;
- whether changeovers must start or finish inside the crew window.

These are grader-only additions in
`evaluations/oracles/process-model-elicitation/vestera-baseline/truth-ledger-v1-prospective.yaml`.
The v0 ledger used by the four historical graders remains retrospective and unchanged in meaning;
the interviewee-visible situation pack was not enlarged.

### Genuine calibration issue

The old cold prompt's integer mean hid `2.67` versus `2.83` and suggested more readiness than the
reconstruction score supported. This was a ruler defect, not a run defect. The prompt and ruler now:

- retain the six-dimensional vector;
- report the mean to one decimal;
- report semantic readiness separately;
- state that a mean near 3 does not imply objective-credible readiness when reconstructability is 2
  or a load-bearing tension remains.

## Comparison with existing human review

The earlier implementation proof reported:

- both runs stayed in expert vocabulary;
- both produced recoverable IRs with unknown/assumption/omission structure;
- Run 2 named useful losses;
- both conversations used opening batteries of roughly 4–10 questions;
- construction-gap return was not exercised, and construction delivered
  `partial-with-named-gaps` rather than asking the smallest next question.

The calibrated graders agree with those observations. They sharpen them in three ways:

1. **Opening overload is not merely stylistic.** Both omniscient graders score conversation burden
   `2` and identify broad batteries as displacing focused pursuit of evidence already disclosed.
2. **Recoverable is not conserved.** Both IRs are readable, but each contains a load-bearing
   grounding defect that the structural proof did not test.
3. **Partial delivery does not erase a premature local check.** The terminal-completion hard gate
   remains false because final status was partial and the expert explicitly requested construction.
   Run 2's local `IR sufficiency: ✅` is still an `UNSUPPORTED-COMPLETE` mistake because required
   objective relations were unresolved.

The proof's phrase “construction-ready IR” should therefore be read as “fileable scaffold from which
construction was attempted,” not as evidence of semantic readiness for the scheduling objective.
No change to the historical proof was made.

## Ruler decisions

Accepted without change:

- six omniscient dimensions and weights;
- 0–4 integer anchors;
- score vector and gates as primary;
- acquisition/conservation/simulator separation;
- stable mistake ids;
- cold reconstruction with cited passages;
- no PN-construction grading.

Clarified after calibration:

- transcript evidence takes precedence over ledger certainty;
- interviewer proposals require explicit expert adoption;
- hard stops constrain acquisition blame;
- a concrete in-range example is partial disclosure, not automatically simulator failure;
- unsupported expert-posture claims can be material hard failures;
- visible caveats distinguish a non-gating `HARDEN` from silent-hardening gate failure;
- local sufficiency can be a mistake without firing the terminal gate;
- cold means use one decimal and semantic readiness is separate.

Frozen artifacts for the next prospective runs:

- `evaluations/oracles/process-model-elicitation/ir-quality/ruler-v1.md`
- `evaluations/oracles/process-model-elicitation/vestera-baseline/truth-ledger-v1-prospective.yaml`

## What this calibration does not prove

- The two runs do not estimate baseline variance.
- Their 3.8-point total difference is not a statistically meaningful treatment effect.
- No grader agreement rate is established from one report per role/run.
- The retrospectively authored ledger is not an unbiased historical oracle.
- No claim is made about Petri-net schema, execution, or semantic construction quality.

The next valid comparison is a prospective baseline: freeze the case, ledger, grader prompts,
model/configuration, and hard stop, then run the unchanged current elicitation path at least three
times before testing hand-authored variants.
