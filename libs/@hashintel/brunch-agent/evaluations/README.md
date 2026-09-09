# Evaluation assets

`evaluations/` contains only reusable inputs and supported procedures. Observed outputs live in
[`docs/evidence/evaluations/`](../docs/evidence/evaluations/).

| Directory | Owns |
| --- | --- |
| `cases/` | Interviewee-visible case inputs. |
| `oracles/` | Hidden truth ledgers and reusable grading rulers. |
| `protocols/` | Runnable or review procedures and their prompts. |

Current process-model-elicitation assets:

- `cases/vestera-scheduling/` and `oracles/vestera-scheduling/` — the executed Vestera exemplar
  and its case-specific retrospective and prospective ledgers.
- `cases/industrial-gas-vmi/` and `oracles/industrial-gas-vmi/` — a greenfield synthetic
  composite based on model-design reference material for telemetry-driven bulk-gas replenishment.
- `cases/truck-fleet-maintenance/` and `oracles/truck-fleet-maintenance/` — a greenfield
  synthetic composite based on the fleet-maintenance use case and model-design references.
- `cases/semiconductor-fab-operations/` and `oracles/semiconductor-fab-operations/` — a
  greenfield synthetic composite based on the semiconductor model-design references.
- `cases/data-centre-thermal-operations/` and `oracles/data-centre-thermal-operations/` — a
  greenfield synthetic composite based on the data-centre model-design use case.
- `cases/pharma-cold-chain/` and `oracles/pharma-cold-chain/` — a greenfield, explicitly
  synthetic benchmark whose domain spine comes from the logistics/pharma use-case sketch.
- `oracles/ir-quality-ruler-v1.md` — frozen general IR-quality ruler.
- `oracles/mission-4-activation-and-restraint-ruler-v1.md` — owner-accepted v1 proof-of-life oracle, retained unchanged with the retired v1 campaign.
- `oracles/mission-4-activation-and-restraint-ruler-v2.md` — v2 freeze candidate preserving v1's semantic checks while moving first-Substantive detection from the isolated persona to post-settlement adjudication over fixed three-submission probes.
- `protocols/mission-4-proof-of-life-v1/` — owner-frozen Mission 4 instrument at `cc9a68497d`, retired after both Vestera attempts exposed an undefined persona-side semantic stop; retain unchanged and do not rerun.
- `protocols/mission-4-proof-of-life-v2/` — owner-frozen instrument whose fixed three-submission probes and S3 review passed; execution stopped on the technically valid S4 item 4e failure before Industrial Gas. Do not resume or use the reserved replacement.
- `protocols/prospective-runbook-v1/` — frozen executed Mission 3 control; its runner was retired after evidence capture.
- `protocols/prospective-runbook-v2/` and `protocols/prospective-runbook-v3/` — frozen failed/invalid Mission 4 attempts retained only because their hashes are part of observed evidence; do not rerun. On 2026-09-02 the owner discarded every campaign design and output after v3 (v4 protocol and evidence, v5 protocol, product-witness-v2); a new evaluation approach replaces them.
- `protocols/ir-quality-ruler-v1/` — the independent omniscient and cold-review procedures.
- `protocols/legacy-baseline/` — retained historical instrument; do not use it for new runs.

Vestera v1 has three paid invocations: one invalid runtime member and two complete, independently
graded members. The five additional cases have prospective ledgers frozen before their first run,
but they have not yet been validated under a frozen versioned protocol.

For a 6–10-turn persona run, select one bounded incident objective rather than attempting
whole-pack acquisition: Alder outage response for industrial gas, the Monday pilot schedule for
truck fleet, the current technician/quarantine decision for semiconductor, the live
CH-2/CH-4/Aurora decision for data centre, or customs-delay recovery for pharma. A suitable
eight-turn instruction is:

> Establish enough to represent the named incident and compare its immediate options while
> preserving unresolved parameters; do not attempt exhaustive domain capture.

When an instrument ceases to be supported, archive a short record under
`docs/archive/evaluations/`, retain its observed output, and remove its executable source rather
than leaving a live-looking compatibility copy.

## Execution safety

These are standing evaluation rules, not a mission's run allocation. Ordinary development follows [AGENTS.md](../AGENTS.md#development-and-evaluation-execution); the live mission supplies the selected model, budget, participants, retry bounds, ledger location and experiment-specific controls. A future mission carries those concrete decisions, not a copied campaign's harness or network profile.

### Isolation follows the claim

When a proof claims no external access, verify actual OS process-tree denial, including relevant descendants; package-manager offline flags alone are insufficient. Browser/listener proofs may allow the loopback traffic they require. Keep synthetic provider responses explicitly synthetic. A failed hermetic run cannot be silently retried online as equivalent evidence. Frozen instruments retain their declared controls; a later development-policy change does not rewrite historical failures or incidents. Pin only the instrument needed to support the claim, rather than requiring every evaluation to inherit one mission's sibling-browser/TLS/freeze machinery.

### Authentication is not inference or accounting

Configuration readiness must be checked through the actual application's loading/resolution path, without revealing credentials. The [interactive-work procedure](../docs/agents/interactive-work.md#provision-local-configuration) covers checkout provisioning, placeholder detection and safe preflight reporting; these checks also apply to direct runs without subagents.

An explicitly opted-in authentication check may send one fixed, non-sensitive message to Anthropic's `POST /v1/messages/count_tokens`, using the same resolved credential/model. Anthropic [documents token counting as free](https://platform.claude.com/docs/en/build-with-claude/token-counting). Confirm current endpoint pricing before use. Retain only safe status/request metadata; disable retries and do not send workpiece/case content. Distinguish authentication rejection, rate limiting, network failure and success. Success proves authentication for that operation, not generation credit, inference success or prior-request cost. Ordinary internet access and a free authentication check grant no paid inference and do not settle an unknown request.

### Paid work

Before invocation, require an owner-authorized bounded allocation, an explicit model with no silent fallback, a conservative per-request cost/token reservation, and accounting that covers all participants and underlying requests, including preparation, continuation, compaction, failures and retries. Task delegation does not multiply budgets. Keep one authoritative allocation/usage record with coordinated writer ownership; cloned worktree ledgers and synthetic fixture ledgers are not spend authority. Reuse the available accounting boundary rather than prescribing a new ledger service.

Record actual request identity and usage once, independently of whether product admission accepts the response. Distinguish completed, rejected, not-started and partial/unknown outcomes. Unknown spend or unresolved journal state blocks further paid dispatch until explicit disposition; normalized zeros do not prove zero cost. Catalogue estimates are not invoices. No automatic replay, guessed settlement or top-up follows a failure. The mission owns numeric ceilings, operation-attempt limits and any delegated allocation permission. Preserve unresolved accounting material until disposition, regardless of later evidence retirement.

## Evidence identity across restacks

A campaign's durable instrument identity is its manifest SHA-256 and ordered path/content hashes. Commit SHAs in manifests and run records are informational execution-time provenance, not primary keys or current-ancestry requirements. After a rebase or stack realignment, verify content against the accepted manifest and optionally record a patch-equivalent navigation map; do not refreeze solely because commit identities changed, and do not require historical Git objects to remain reachable. If permanent commit retention is genuinely required, name an explicit durable ref or archived bundle.
