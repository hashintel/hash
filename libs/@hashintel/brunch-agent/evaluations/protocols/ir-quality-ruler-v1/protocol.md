# IR-quality review procedure

## Purpose

Apply the calibrated graders to an explicitly supplied conversation and its IR. This procedure does not launch an interview, authorize paid evaluation, or establish a prospective baseline or CI gate.

The original two-run Mission 3 calibration is retired; its transcripts and first IR are no longer retained. Its [adjudication](../../../docs/evidence/evaluations/vestera-ir-quality-calibration-v1/calibration-adjudication.md) records the historical findings, not a runnable input bundle.

## Inputs

Before review, identify the actual paths for one run's opening request, situation pack, applicable truth ledger, transcript, and recovered IR. Confirm the transcript and IR belong to the same run and label simulated testimony and retrospective oracles accurately. Missing inputs stop the affected review; do not reconstruct testimony from the pack or substitute another run's IR.

The surviving `evaluations/cases/vestera-scheduling/filled-runbook.ir.md` is a headless-construction input, not a complete calibration bundle. It cannot support transcript-based grading without its original transcript. Local review output belongs under `apps/brunch-agent/.data-wipe-me/evaluations/`.

## Procedure

For each supplied run:

1. One independent evaluator follows `omniscient-grader.md` with situation pack, truth ledger,
   transcript, and IR.
2. A separate evaluator follows `cold-ir-reviewer.md` with opening request and IR only.
3. Write both raw reports under
   `apps/brunch-agent/.data-wipe-me/evaluations/vestera-ir-quality-calibration/`.
   Promote only a final adjudication if a named consumer requires it.
4. Compare score direction, reconstruction, assumptions, and smallest-next-question findings.
5. Human adjudication records agreements, explainable role differences, grader defects, and
   unresolved disagreements.
6. Revise the prompts/ledger only when the disagreement exposes an oracle defect rather than a
   legitimate difference between omniscient and cold roles.
7. Use the existing anchors and mistake ids in `evaluations/oracles/ir-quality-ruler-v1.md`; an ordinary review does not refreeze or overwrite that ruler.

## Interpretation

- The omniscient score measures acquisition plus conservation against grader-only case truth.
- The cold review measures downstream usability without transcript or hidden-case knowledge.
- Different scores are expected. A disagreement exists only when their claims about the same
  artifact property conflict, not merely because one role can see more evidence.
- A single review cannot establish variance or a repeatable baseline. Any prospective comparison needs its own authorized run selection and applicable oracle; it is not launched by this procedure.

## Stop conditions

Stop calibration and fix the oracle before more probes if:

- the grader cannot distinguish undisclosed pack truth from disclosed-but-omitted evidence;
- scores lack citations;
- the cold reviewer uses case facts absent from the IR;
- polished length consistently outranks semantic fidelity;
- hard failures disappear into the weighted total;
- two evaluators cannot apply the same score anchors in recognizably similar ways.
