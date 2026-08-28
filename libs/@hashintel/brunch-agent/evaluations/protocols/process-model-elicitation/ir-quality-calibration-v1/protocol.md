# IR-quality grader calibration v1

## Purpose

Calibrate repeatable elicitation-to-IR graders against the two existing Mission 3 real-model runs.
This is retrospective calibration, not the prospective baseline and not a CI gate.

## Inputs

Shared case:

- opening request: `evaluations/cases/process-model-elicitation/baseline/opening-message.md`
- situation pack: `evaluations/cases/process-model-elicitation/baseline/situation-pack.md`
- retrospective oracle: `evaluations/oracles/process-model-elicitation/vestera-baseline/truth-ledger-v0-retrospective.yaml`

Runs:

- `runbook-headless-2026-08-28T10-56-59-351Z` (empty-interviewer stop)
- `runbook-headless-2026-08-28T11-03-53-683Z` (hard-stop after five interview turns)

Run transcript and recovered IR artifacts live under
`docs/evidence/evaluations/process-model-elicitation/runbook-headless/`.

## Procedure

For each run:

1. One independent evaluator follows `omniscient-grader.md` with situation pack, truth ledger,
   transcript, and IR.
2. A separate evaluator follows `cold-ir-reviewer.md` with opening request and IR only.
3. Retain both raw reports under
   `docs/evidence/evaluations/process-model-elicitation/ir-quality-calibration-v1/`.
4. Compare score direction, reconstruction, assumptions, and smallest-next-question findings.
5. Human adjudication records agreements, explainable role differences, grader defects, and
   unresolved disagreements.
6. Revise the prompts/ledger only when the disagreement exposes an oracle defect rather than a
   legitimate difference between omniscient and cold roles.
7. Freeze reviewed anchors and mistake ids as `evaluations/oracles/process-model-elicitation/ir-quality/ruler-v1.md`.

## Interpretation

- The omniscient score measures acquisition plus conservation against grader-only case truth.
- The cold review measures downstream usability without transcript or hidden-case knowledge.
- Different scores are expected. A disagreement exists only when their claims about the same
  artifact property conflict, not merely because one role can see more evidence.
- Existing runs cannot establish variance or a repeatable baseline. After the ruler freezes, rerun
  the unchanged current agent at least three times against
  `evaluations/oracles/process-model-elicitation/vestera-baseline/truth-ledger-v1-prospective.yaml`.

## Stop conditions

Stop calibration and fix the oracle before more probes if:

- the grader cannot distinguish undisclosed pack truth from disclosed-but-omitted evidence;
- scores lack citations;
- the cold reviewer uses case facts absent from the IR;
- polished length consistently outranks semantic fidelity;
- hard failures disappear into the weighted total;
- two evaluators cannot apply the same score anchors in recognizably similar ways.
