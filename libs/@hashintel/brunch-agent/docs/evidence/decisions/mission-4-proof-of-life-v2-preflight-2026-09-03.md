# Mission 4 proof-of-life v2 model and cost preflight

Date: 2026-09-03

Status: **non-billable v2 preflight complete; manifest acceptance pending and currency gating subsequently suspended by the owner.** No model invocation was made while preparing v2.

## Unchanged allocation and prices

V2 keeps the direct-provider allocation accepted for v1: `anthropic/claude-sonnet-4-6` elicitor, `openai/gpt-5.6-sol` medium-thinking persona, and fresh-context `anthropic/claude-opus-4-6` high-thinking adjudicator, with no fallback and client-tool host `none`. The same-day credential/catalog and official-price evidence remains recorded in [`mission-4-proof-of-life-preflight-2026-09-03.md`](mission-4-proof-of-life-preflight-2026-09-03.md).

V2 changes no model-facing production file, case, full-run objective, adjudication input, or model allocation. Its only behavioral instrument change is that each of the two interactive probes always makes three visible submissions rather than asking the isolated persona to classify the first Substantive text. The accepted logical ceilings remain 10 conversation attempts, 32 Brunch submissions, 28 persona continuations, and 10 adjudications.

## V2 planning estimate

The fixed probes use the same maximum three visible submissions already budgeted by v1. Normal success therefore remains approximately 14 Brunch submissions, 12 persona continuations, and five adjudications. The same token allowances and published prices produce the same standalone estimate:

| Role | Normal cost | Worst-case cost |
| --- | ---: | ---: |
| Sonnet elicitor | $0.98 | $1.95 |
| GPT-5.6 persona | $1.20 | $3.20 |
| Opus adjudicator | $0.98 | $2.50 |
| **V2 total** | **$3.16** | **$7.65** |

## Cumulative ceiling

V1's retained Pi usage displays report $0.044 for the two persona sessions and $0.592 for the two adjudications, or **$0.636 known rounded spend**. Canonical Flue history and the local Flue database contain no provider usage for the two Sonnet elicitor submissions. The environment has a standard Anthropic API key but no Admin API key; a read-only request to the organization usage-report endpoint returned HTTP 401 with `The Admin API requires an Admin API key or an organization-scoped API key.` No credential value was printed or retained.

Let **S** be the actual v1 Sonnet spend. The exact remaining allowance under the original cumulative **$10 USD** Mission 4 ceiling is **$9.364 − S**. The standalone v2 worst-case estimate of $7.65 fits only if **S ≤ $1.714**. V2 does not create a second allowance, and this preflight does not replace the unknown with a planning reserve or treat it as zero.

This unresolved value initially blocked remaining-spend authorization. The owner subsequently suspended currency gating for v2; see [`mission-4-proof-of-life-v2-budget-suspension-2026-09-03.md`](mission-4-proof-of-life-v2-budget-suspension-2026-09-03.md). Reconciliation remains desirable accounting evidence but is no longer an execution gate. Exact manifest acceptance, logical ceilings, serial stop rules, and per-action usage retention remain mandatory.
