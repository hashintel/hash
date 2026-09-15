# Evaluation assets

`evaluations/` contains only reusable inputs and supported procedures. Local run output is
ephemeral and belongs under `apps/brunch-agent/.data-wipe-me/evaluations/`, not the tracked
tree. Retention of any durable conclusion follows the [evidence contract](../docs/evidence/README.md).

| Directory | Owns |
| --- | --- |
| `cases/` | Interviewee-visible case inputs. |
| `oracles/` | Hidden truth ledgers and reusable grading rulers. |
| `protocols/` | Supported procedures and their prompts. |

## Browser-visible persona runs

Use `yarn brunch:persona --case <name-or-directory>` from the repository root. `--list-cases` discovers available packs; `--help` lists launch, resume, and independent role model/effort flags without starting inference. Defaults are Brunch `openai/gpt-5.6-sol` low and persona `anthropic/claude-sonnet-4-6` low. The [operator guide](../../../../apps/brunch-agent/.pi/extensions/brunch-persona-testing/README.md) owns setup, recording, private context-pack inputs, stop/resume and run-data locations. Pi supplies ordinary utterances through the real panel; the browser executes Brunch's own tool calls against the visible document. There is no separate headless persona executor or spectator mode. Persona runs retain native usage without accounting cutoffs; they do not opt into the campaign reservation instrument.

Case selection does not authorize paid execution; follow the mission's allocation and [execution safety](#execution-safety). Persona records live under `apps/brunch-agent/.data-wipe-me/persona-runs/`, separate from other evaluation output. `yarn workspace @apps/brunch-agent test:persona` checks the browser mechanism with synthetic responses, not model fidelity or an accepted worked example.

## Reusable inputs

Current process-model-elicitation assets:

- `cases/inventory-purchasing/` — the current from-scratch flagship; its hand-built reference net remains evaluator-only.
- `cases/vestera-scheduling/` and `oracles/vestera-scheduling/` — the executed Vestera exemplar
  and its case-specific retrospective and prospective ledgers, plus the filled runbook IR used
  by the supported headless construction command.
- `cases/industrial-gas-vmi/`, `cases/truck-fleet-maintenance/`,
  `cases/semiconductor-fab-operations/`, `cases/data-centre-thermal-operations/`,
  and `cases/pharma-cold-chain/` — greenfield synthetic composites with matching prospective
  ledgers.
- `oracles/ir-quality-ruler-v1.md` and `protocols/ir-quality-ruler-v1/` — the independent
  omniscient and cold-review procedures.
- `oracles/mission-4-activation-and-restraint-ruler-v1.md` and `v2.md` — historical
  proof-of-life oracles. Do not treat them as a launch instruction.
- `protocols/network-guard/` — reusable hermetic network-denial profiles.
- `protocols/gherkin-shape-c-paper-v1/` — paper-comparison instrument.

For a 6–10-turn persona run, select one bounded incident objective rather than attempting
whole-pack acquisition: Alder outage response for industrial gas, the Monday pilot schedule for
truck fleet, the current technician/quarantine decision for semiconductor, the live
CH-2/CH-4/Aurora decision for data centre, or customs-delay recovery for pharma. A suitable
eight-turn instruction is:

> Establish enough to represent the named incident and compare its immediate options while
> preserving unresolved parameters; do not attempt exhaustive domain capture.

When an instrument ceases to be supported, archive a short retirement record under
`docs/archive/evaluations/` and remove its executable source. Do not retain raw observed output
in the repository.

## Execution safety

These are standing evaluation rules, not a mission's run allocation. Ordinary development follows [AGENTS.md](../AGENTS.md#development-and-evaluation-execution); the live mission supplies the selected model, budget, participants, retry bounds, ledger location and experiment-specific controls. A future mission carries those concrete decisions, not a copied campaign's harness or network profile.

### Isolation follows the claim

When a proof claims no external access, verify actual OS process-tree denial, including relevant descendants; package-manager offline flags alone are insufficient. Browser/listener proofs may allow the loopback traffic they require. Keep synthetic provider responses explicitly synthetic. A failed hermetic run cannot be silently retried online as equivalent evidence. Pin only the instrument needed to support the claim, rather than requiring every evaluation to inherit one mission's sibling-browser/TLS/freeze machinery.

### Authentication is not inference or accounting

Configuration readiness must be checked through the actual application's loading/resolution path, without revealing credentials. The [interactive-work procedure](../docs/agents/interactive-work.md#provision-local-configuration) covers checkout provisioning, placeholder detection and safe preflight reporting; these checks also apply to direct runs without subagents.

Free, non-sensitive authentication checks are owner-preauthorized for this project; a fresh confirmation is not required for each check. Verify that the operation is currently free, use the intended configuration, retain minimal safe status and stop rather than automatically retrying an unexplained failure. For Anthropic, send one fixed, non-sensitive message to `POST /v1/messages/count_tokens`, using the same resolved credential/model. Anthropic [documents token counting as free](https://platform.claude.com/docs/en/build-with-claude/token-counting). Confirm current endpoint pricing before use. Retain only safe status/request metadata; disable retries and do not send workpiece/case content. Distinguish authentication rejection, rate limiting, network failure and success. Success proves authentication for that operation, not generation credit, inference success or prior-request cost. Ordinary internet access and a free authentication check grant no paid inference and do not settle an unknown request.

### Tool-schema acceptance

When adding or changing Brunch tools, their schemas, mounts or provider adapters, run the native schema oracle and the opt-in Anthropic preflight before paid observation. From the HASH root:

```sh
yarn workspace @apps/brunch-agent test:anthropic-tools
```

This builds the current app and dependencies, then runs `test/integration/native-schema-carriage.integration.ts` in a separate process with forbidden network transports. That oracle captures the actual native SDK requests for both entrypoints across ordinary batched construction, the conversation-construction candidate, the prepared-fixture tracer and headless construction. It checks faithful serialization, object-root compatibility and native argument validation. Newly mounted tools enter the capture automatically; add a capture when introducing a new mode. `test:native-schema` remains independently runnable without credentials after a build.

The live phase sends each distinct complete captured tool catalogue, unchanged, to the free count-tokens endpoint using the same development credential resolution and pinned Sonnet model as the persona launcher. It first verifies that a known-invalid top-level union receives the specific schema rejection. Only synthetic message text and tool definitions leave the process: no case pack, workpiece, conversation history or paid generation. HTTP errors and timeouts fail the command without retries; safe configuration/status/request IDs and synthetic capture records are retained in the printed temporary directory. This command is deliberately separate from offline unit tests and unauthenticated CI.

Passing proves Anthropic count-tokens acceptance of those client-tool definitions, not generation quality, Messages API parity in every feature, or compatibility with another provider's schema subset or strict mode. Keep local parser/executor tests and provider-specific checks; do not weaken canonical schemas merely to guess a universal intersection.

### Paid work

Paid inference requires an owner-authorized bounded allocation and an explicit model with no silent fallback. Record actual request identity and catalogue usage for every participant, including preparation, continuation, compaction, failures and retries. Catalogue estimates are not invoices. Do not invent settlement, silently retry, or treat a cloned or synthetic ledger as spend authority.

Unknown or unresolved usage stays recorded until explicit disposition; normalized zeros do not prove zero cost. That honesty is not, by itself, an execution gate. Stop only on a budget the owner named, or when a mission has opted into a campaign accounting instrument whose historical hold, unknown-stop and lock contract then applies. Worst-case full-window dollar holds and lock-poison are that instrument, not standing local-use law. Task delegation does not multiply budgets. Reuse the available accounting boundary when a mission opts into it, rather than prescribing a new ledger service.

## Evidence economy

Read the source and evidence relevant to the reached boundary, not every historical packet as a universal cold-start gate. Reference unchanged artifacts by durable commit/path or accepted content identity rather than copying packets. Do not track run output unless it has a named consumer under the [retention contract](../docs/evidence/README.md).

Retain a fixture only when a named test or supported benchmark will load its exact bytes. Material created only to establish a now-settled contract should be discarded. Move a still-binding reason into `MISSION.md` or an ADR; otherwise intentionally discard the workbench. Unresolved accounting stays in the one authoritative ledger until disposed.

## Evidence identity across restacks

A campaign's durable instrument identity is its manifest SHA-256 and ordered path/content hashes. Commit SHAs in manifests and run records are informational execution-time provenance, not primary keys or current-ancestry requirements. After a rebase or stack realignment, verify content against the accepted manifest and optionally record a patch-equivalent navigation map; do not refreeze solely because commit identities changed, and do not require historical Git objects to remain reachable. If permanent commit retention is genuinely required, name an explicit durable ref or archived bundle.
