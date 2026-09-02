# Mission 4 architecture scoring v3 — campaign adjudication

## Verdict

The single valid Mission 4 architecture workpiece scored `72.5 / 100` omniscient and `3.2 / 4` cold, with conditional downstream readiness and no hard-failure gate. Against the latest two valid flat-prompt controls, its omniscient score lies inside their `66.3–80.0` range while its cold score is `0.1` below their `3.3–3.5` range.

This is evidence that the new architecture can preserve meaning and epistemic state at least as well as the latest flat prompt on one observed workpiece. It is not evidence of general superiority: only one of three v3 invocations produced a workpiece, and that workpiece missed many load-bearing facts before the eight-turn stop.

## Quality comparison

| Dimension | Architecture v3 | Flat prompt A | Flat prompt B |
| --- | ---: | ---: | ---: |
| Objective-aligned acquisition | 3 | 3 | 2 |
| Semantic conservation | 4 | 3 | 3 |
| Epistemic and evidence fidelity | 4 | 4 | 3 |
| Gap and loss discipline | 4 | 3 | 3 |
| Cold IR utility, omniscient estimate | 3 | 3 | 2 |
| Conversation quality and burden | 3 | 3 | 3 |
| Weighted total | 72.5 | 80.0 | 66.3 |
| Independent cold utility | 3.2 | 3.5 | 3.3 |
| Readiness | conditional | conditional | conditional |
| Hard-failure gates | none | none | none |

Do not average the control members or turn the architecture point estimate into a range. The strongest observed architectural change is the `4` in semantic conservation and gap/loss discipline: the workpiece preserved hedges and uncertainty and deposited thirteen construction blockers without fabrication, silent hardening, conflict collapse, unsupported completion, opening overload, or schema-shaped questioning.

The principal weakness remains acquisition. The omniscient grader found major misses in shared changeover-crew contention, the VW-02 exception, family-specific bottlenecks, customer lateness practice, stage overlap, Line 2's family-dependent speed, and minimum-run constraints. Reader effort also remained weaker than both flat-prompt controls because related facts were repeated or scattered.

## Campaign membership and failure attribution

| Replication | Outcome | Quality use | Operational attribution |
| --- | --- | --- | --- |
| 1 | Completed after eight turns; recoverable workpiece | Omniscient and cold scored | Candidate path completed |
| 2 | Simulated expert returned no text with provider `stop_reason: refusal` | Excluded | Expert-simulator/provider boundary |
| 3 | Simulated expert returned no text after several mixed refusal/end-turn responses | Excluded | Expert-simulator/provider boundary |

The v3 completion rate is `1/3`, versus the flat-prompt control's `2/3`. Report that observation separately from workpiece quality. It does not establish that the candidate interviewer failed, because both invalid members stopped at the independent simulated-expert boundary; it does establish that this paid evaluation setup is not a robust source of gradeable samples.

The completed member read universal and SDCPN elicitation references but did not read `templates/workpiece.md` before producing its workpiece. That violates the accepted lifecycle instruction and Mission 4 routing oracle even though the v3 runner's declared ordinary-path checks did not classify it as invalid. Preserve it as an owner-visible architecture finding; do not retroactively alter member validity or the frozen instrument.

## Independent reports

The omniscient grader completed normally using requested model `claude-sonnet-4-5`, observed model `claude-sonnet-4-5-20250929`, and the frozen prompt, situation pack, ledger, exact transcript, and workpiece.

The cold reviewer was invoked twice in separate fresh contexts with the same frozen prompt, opening request, and workpiece. Both independently returned `3.2`, `conditional`, and high confidence, but the provider ended both with `stop_reason: refusal`. Attempt 1 stopped after the reconstructed model; attempt 2 supplied the complete score vector and almost all required sections before truncating in the final limitation. Treat `3.2` as a stable human-adjudicated score supported by two agreeing but formally incomplete provider reports, not as a fully completed cold-review oracle.

## Artifact integrity

The first commit's pre-commit hook normalized whitespace in the previously untracked replication-1 JSON. The emitted outer file hash was `8b47844cd690e13e468ad2aaef27eef0e86f40c23ca82357703931aaaf189de6`; the canonical committed hash is `2bfcf9e60a15e2014b17afede0258865b784cca205ca6a7709d4dbba20a86c66`. Parsed content and every embedded campaign, workpiece, source-message, instrument, snapshot, call, and transcript field are unchanged. This is a disclosed outer-byte-integrity defect and prevents a claim that the committed JSON is byte-for-byte runner output.

## Runtime and budget

Across the two observed campaigns, recorded interviewer cost is `$0.5829`. Simulated-expert usage totals 67,315 input and 5,194 output tokens. Grader usage totals 39,312 input and 9,779 output tokens. Expert, grader, and one-token preflight prices were not emitted by their SDK responses, so the artifact set cannot state exact total spend; observed usage remains comfortably below the owner-approved US$10 ceiling under the configured model's ordinary published rates.

## Human adjudication

The owner accepted this architecture as baseline-competitive with explicit limitations and directed Mission 4 to proceed to the visible witness and handoff without another paid scoring campaign.

- Accept the architecture workpiece as a pass with no hard-failure gate.
- Accept `72.5` as inside, not above, the latest flat-prompt omniscient range.
- Accept `3.2` as slightly below the latest flat-prompt cold range and formally qualified by reviewer truncation.
- Credit stronger observed conservation and gap discipline.
- Do not claim general quality improvement, robustness, or objective-credible readiness.
- Carry the template-disclosure miss and acquisition misses as explicit limitations requiring owner disposition before Mission 4 close.
- If selected for Mission 5, hand off replication 1 with its exact conversation, instrument manifest, reports, and this adjudication.
