# Mission 4 architecture scoring v3 — invalid campaign adjudication

## Status

This campaign is retained as historical failure evidence and does not satisfy Mission 4's frozen architecture scoring proof. It produced no valid campaign member and no complete independent cold review. The prior owner acceptance is withdrawn; Mission 4 is live again.

The [owner-gate clarification](../../decisions/mission-4-owner-gates-2026-09-02.md) confirms that the paid calls were authorized under a US$10 ceiling and that the resulting campaign was initially accepted while the work was running. That authorization establishes that the calls were not unapproved spend. It does not make the builder the owner of freeze, adjudication, witness acceptance, handoff selection, or mission closure, and it does not authorize another paid call.

## Campaign validity

| Replication | Observed outcome | Mission 4 validity | Operational attribution |
| --- | --- | --- | --- |
| 1 | Completed after eight turns and emitted a recoverable workpiece | Invalid: created the workpiece without first reading `templates/workpiece.md` | Candidate path completed but violated the required routing order |
| 2 | Simulated expert returned no text with provider `stop_reason: refusal` | Invalid | Expert-simulator/provider boundary |
| 3 | Simulated expert returned no text after mixed refusal/end-turn responses | Invalid | Expert-simulator/provider boundary |

The runner recorded `violations: []` for replication 1 because `ordinaryElicitationViolationsFrom()` checked forbidden tools and resources but did not enforce required resource presence or ordering. The checker cannot narrow the mission contract. Replication 1 violated the explicit requirement that the workpiece template be read before first creation, so this campaign's valid completion rate is `0/3`, not `1/3`.

The campaign therefore supports no baseline-competitive, superiority, readiness, or Mission 5 selection claim. Its traces remain useful for diagnosing routing and acquisition failures.

## Arithmetic errata

The retained omniscient report supplied dimension scores `3, 4, 4, 4, 3, 3` with weights `20, 20, 20, 15, 15, 10`. Its listed contributions sum to `88.75`, which rounds under the frozen one-decimal rule to **88.8 / 100**, not `72.5 / 100`.

The retained cold attempt 2 supplied scores `4.0, 3.5, 3.0, 4.0, 3.5, 2.5`. Their mean is `20.5 / 6 = 3.4167`, which rounds to **3.4 / 4**, not `3.2 / 4`.

Those corrected values would place the observed workpiece above the flat-prompt omniscient range `66.3–80.0` and within its cold range `3.3–3.5`. They remain diagnostic only because the workpiece was produced by an oracle-invalid run and the cold reviewer did not complete its contract.

The model-authored `.omniscient.md`, `.cold.md`, and `.cold-attempt-2.md` files are retained as received and therefore still contain their arithmetic errors. This adjudication is their explicit erratum; no consumer may quote their headline totals without this correction.

## Incomplete independent oracle

Both cold-review calls ended with provider `stop_reason: refusal`. Attempt 1 stopped after the reconstructed model. Attempt 2 supplied the score vector and most requested sections but stopped during the final limitation. Agreement between two incomplete outputs does not complete the frozen reviewer contract. Mission 4 still requires one complete independent cold review or an owner-approved replacement oracle.

## Quality observations, not acceptance

The invalid replication 1 workpiece preserved hedges and uncertainty and deposited thirteen construction blockers without obvious fabrication, silent hardening, conflict collapse, unsupported completion, opening overload, or schema-shaped questioning. The omniscient grader also found major acquisition misses in shared changeover-crew contention, the VW-02 exception, family-specific bottlenecks, customer lateness practice, stage overlap, Line 2's family-dependent speed, and minimum-run constraints. Related facts were repeated or scattered, increasing cold-reader effort.

These observations may inform the routing repair and later adjudication. They are not a scored campaign result.

## Artifact integrity

The first commit's pre-commit hook normalized whitespace in the previously untracked replication-1 JSON. The emitted outer file hash was `8b47844cd690e13e468ad2aaef27eef0e86f40c23ca82357703931aaaf189de6`; the canonical committed hash is `2bfcf9e60a15e2014b17afede0258865b784cca205ca6a7709d4dbba20a86c66`. Parsed content and every embedded campaign, workpiece, source-message, instrument, snapshot, call, and transcript field are unchanged. This prevents a claim that the committed JSON is byte-for-byte runner output.

## Runtime and historical budget

Across the two observed campaigns, recorded interviewer cost is `$0.5829`. Simulated-expert usage totals 67,315 input and 5,194 output tokens. Grader usage totals 39,312 input and 9,779 output tokens. Expert, grader, and one-token preflight prices were not emitted by their SDK responses, so the artifact set cannot state exact total spend. These were historically authorized calls; no remaining budget or new authorization is implied.

## Required successor evidence

Before Mission 4 can claim this proof leaf, the parent must freeze the final repaired production instrument, explicitly authorize any paid call and ceiling, execute a campaign whose validity oracle enforces required disclosure and ordering, obtain one complete independent cold review, adjudicate the result, and select a Mission 5 handoff. Campaign and visible witness must exercise that same frozen instrument unless the owner explicitly amends the contract before either run.
