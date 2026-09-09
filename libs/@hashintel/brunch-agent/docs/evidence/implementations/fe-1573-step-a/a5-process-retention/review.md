# Independent scoped oracle review and correction

Read-only reviewer: `proof-review`, researcher profile, `openai-codex/gpt-5.6-terra`, medium thinking. Scope: new tests and actual original-store observations only; no production edits, commands, provider calls or upstream research. This is scoped test review, not Lu's mission/utility acceptance or parent inventory admission.

## First finding

The reviewer inspected the first pinned `/tmp/m7-a5-retention-final` packet and reported a blocker: the folded-context oracle excluded the exact original source literal and original revision/mutation calls, but did not explicitly exclude prior `brunch_workpiece`/`brunch_why` results or their call IDs. A source-redacted cached prior answer could therefore evade the check. It also required correction of the audit wording “original source and previous answer absent”: the normal construction-context signal deliberately still contained the current authoritative passage, source pointer and evidence relations.

The review otherwise found the observed boundary sound: distinct actual PIDs 12927/13428/13442, original DB path, no history-import route, actual loopback Chrome seed, overlapping validated/carry evidence, authorization, model-facing outputs and 31 independent completion/settlement pins. It retained synthetic/root-arc-only, non-power-loss, non-relocation, non-provider-fidelity, non-utility and non-acceptance limits.

The worker acknowledged the oracle deficiency without deleting or filtering the product's current state. A read-only in-memory mutation of the original observations reproduced the old audit's false acceptance. `logs/m7-a5-retention-review-blindspot.json.gz` pins the old audit hash, injected source-redacted tool result and erroneous pass. Original files and store were untouched. This is a test blind spot, not evidence that the actual original run contained the injected result.

## Correction and new actual run

Commit `c6c3d3fb63` adds two explicit folded-entry checks: no serialized prior query call ID, and no prior workpiece/why `toolResult`, even if source text was redacted. The companion audit mirrors both checks and adds the source-redacted cached-answer falsifier. The test explicitly states that the one current revision remains injected by the product and is not source-entry or governing-answer retention.

A fresh actual browser seed, two threshold folds and two separate replacement processes produced `/tmp/m7-a5-retention-reviewed`, preserved under `reviewed/`. All phases and all ten falsifiers pass. Source/build/runtime pins are unchanged throughout the three processes.

## Re-review finding

The reviewer inspected the correction and the new packet, then returned:

> PASS — prior blocker is discharged within the clarified bound. The integration test snapshots all prior `brunch_workpiece`/`brunch_why` IDs before the query, then at the first folded model request rejects both any serialized prior ID and any workpiece/why `toolResult`; it explicitly preserves authoritative current-workpiece state. The audit mirrors these checks. Its new source-redacted cached-answer falsifier injects a prior `brunch_why` result with sources removed and is rejected. The actual reopened first request has summary plus current-workpiece construction context but no prior workpiece/why result. Correct narrow wording: original true-user source entry and prior retrieved workpiece/why tool answers are absent; current authoritative revision/passage/evidence pointers deliberately remain. No concrete remaining blocker found in this correction. Existing synthetic/root-arc and non-power-loss/provider/utility limits remain.

The test worker acknowledged that scoped result and retained the distinction in the handoff; the integration owner still owns adoption and inventory insertion. Review does not assert empty model context, absence of the current workpiece, semantic relevance of evidence, fresh-browser reconciliation after restart or product/mission acceptance.
