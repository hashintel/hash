# Mission 4 proof-of-life protocol v1

Status: **freeze candidate prepared from owner decisions recorded on 2026-09-03; not frozen and not authorized for paid execution until the owner accepts the subsequent machine-readable manifest and $10 USD ceiling.** Canonical snapshot/trace/workpiece/hash retention is landed, all focused checks pass, direct-provider catalog entries and credential presence are confirmed without a model call, and current official prices and estimates are recorded.

## Claim

This protocol can support only the bounded claim in [`../../../MISSION.md`](../../../MISSION.md): the implemented independent `elicitation` capability activates with its SDCPN job skill before substantive interviewing across three named case families, conditionally reads the SDCPN profile before reliance, avoids an opening Battery, refrains on the exact S3 resolvable-review input, activates on the exact S4 knowledge-gap input, and yields one attributable but unpromoted downstream workpiece candidate.

It does not estimate general reliability, grade workpiece quality, accept the topology-neutral portfolio, compare against Mission 3, prove Petrinaut `/api/chat` or browser behavior, or promote any artifact to a fixture or database seed.

## Accepted oracle

Grade only with [`../../oracles/mission-4-activation-and-restraint-ruler-v1.md`](../../oracles/mission-4-activation-and-restraint-ruler-v1.md). The freeze manifest records its exact SHA-256. The ruler is evaluator-only and never enters Brunch or persona context.

## Model and host allocation

| Role | Requested configuration | Pre-freeze requirement |
| --- | --- | --- |
| Elicitor | `BRUNCH_CHAT_MODEL=claude-sonnet-4-6`, resolving through the production Anthropic provider | Record the provider-reported exact model id and verify the built app uses it. No fallback. |
| Persona | Pi `--model openai/gpt-5.6-sol --thinking medium`, using the direct OpenAI provider | Record requested and provider-reported ids. No fallback or router substitution. |
| Adjudicator | `anthropic/claude-opus-4-6`, high thinking, one fresh context per technically usable attempt | Record requested/provider-reported ids. No fallback. |
| Client-tool host | `none` for every slot | Any client-tool suspension is technical invalidity; do not service it with a different host. |

OpenAI elicitor comparison is outside Mission 4 and must not be inserted into this campaign. Results are reported per elicitor model and never pooled.

## Fixed slot allocation and order

Run serially in this order, validating and adjudicating each retained attempt before admitting the next slot:

1. `vestera-probe`: Vestera Scheduling, first-Substantive probe, at most three visible user turns.
2. `data-centre-probe`: Data Centre Thermal Operations, first-Substantive probe, at most three visible user turns.
3. `s3-review`: exact controlled S3 resolvable-review prompt, one visible user turn through settlement.
4. `s4-knowledge-gap`: exact controlled S4 knowledge-gap prompt, one visible user turn through settlement.
5. `industrial-gas-full`: Industrial Gas VMI, six-turn minimum and eight-turn maximum, producing the only possible handoff candidate.

A valid behavioral failure stops the campaign for owner adjudication. Do not run later slots to average it away.

### Interactive inputs

The first visible user message is exactly the text below the `---` separator in the named `opening-message.md`; headers and private instructions are not sent to Brunch.

| Slot | Opening path | Current SHA-256 | Private situation pack | Current SHA-256 |
| --- | --- | --- | --- | --- |
| `vestera-probe` | `../../cases/vestera-scheduling/opening-message.md` | `84ec5faa5fd46699c008b3b2aad49eb9988b8c2ab039c8e147fdb077d562ef54` | `../../cases/vestera-scheduling/situation-pack.md` | `4dbeb44a881c4675ec0ce7a5f068ea46ce1a4968a405b2dd692f92816d33e083` |
| `data-centre-probe` | `../../cases/data-centre-thermal-operations/opening-message.md` | `bf46a637d029f34758c398f3d1f5ac70c2d10bfd169b05b23497215792a16ef8` | `../../cases/data-centre-thermal-operations/situation-pack.md` | `ab5f7f701265e4a01eea181c27327891c208b82ce75235cec0344f90fd2fe5ce` |
| `industrial-gas-full` | `../../cases/industrial-gas-vmi/opening-message.md` | `75ac100dc0f16771feced90563f4c57a5c9e918bbd2cc6fd7af0cd5de7165659` | `../../cases/industrial-gas-vmi/situation-pack.md` | `07f36060ebbb1cccd2c20ccd2a44ae732b23d69b82e2b018c4b05e6844d6d55e` |

The machine-readable freeze manifest recomputes and binds these identities.

Probe private objective:

> Act only as the person in the supplied situation pack. Send the exact opening message first, then answer Brunch naturally from the pack. Stop immediately after Brunch's first Substantive operational question. If none appears, stop after three visible user turns. Do not seek a workpiece or construction.

Industrial Gas private objective:

> Establish enough to represent the Alder outage-response decision and compare its immediate replenishment and dispatch options while preserving unresolved parameters. Seek a recoverable operational workpiece, not net construction. Send the exact opening message first and answer only from the supplied situation pack. Continue for at least six visible user turns. From turn six onward, stop when Brunch supplies a recoverable `runbook-ir` workpiece without leaving a direct question unanswered. Stop after eight visible user turns regardless.

### Controlled review inputs

Use the exact S3 and S4 `prompt` strings in [`../../cases/flue-skill-composition-side-quest-v3/scenarios.json`](../../cases/flue-skill-composition-side-quest-v3/scenarios.json), file SHA-256 `1844df940b8de9d10d28e9537f966920aba581b36956a9ac26a3767824ca96cb`. S3 prompt-string SHA-256 is `ff5755c7ffced45741f791d1ec433386ee4052d301d0065dbff46dc8c36de729`; S4 prompt-string SHA-256 is `64db8fd28e3b62b244ded0de703cc1609bcda9cb2387287efea4887764720635`. The freeze manifest binds all three. These fixed, explicitly cued inputs are controlled mechanism checks only.

## Attempt identities and replacement rule

Reserve these ids; never reuse an admitted id:

| Slot | Primary | Sole permitted replacement |
| --- | --- | --- |
| Vestera probe | `m4-pol-v1-vestera-p1` | `m4-pol-v1-vestera-r1` |
| Data Centre probe | `m4-pol-v1-data-centre-p1` | `m4-pol-v1-data-centre-r1` |
| S3 review | `m4-pol-v1-s3-p1` | `m4-pol-v1-s3-r1` |
| S4 knowledge gap | `m4-pol-v1-s4-p1` | `m4-pol-v1-s4-r1` |
| Industrial Gas full | `m4-pol-v1-industrial-gas-p1` | `m4-pol-v1-industrial-gas-r1` |

Retain every admitted attempt. Permit the replacement only when the primary is technically invalid under the ruler or, for an interactive slot, technically valid but reaches no Substantive text within budget. A replacement repeats the same frozen inputs and settings under its reserved fresh id. A second invalid or no-Substantive result stops the campaign. Never replace a valid behavioral failure or a full run that reaches substance but fails to emit a recoverable workpiece.

## Paid ceiling and stop rule

The hard logical ceiling is 10 conversation attempts, 32 visible user submissions to Brunch, 28 persona continuations, and 10 fresh adjudications. Internal Sonnet provider continuations caused by skill/resource calls are metered and reported but are not falsely equated with visible submissions. Normal success is five conversation attempts, approximately 14 Brunch submissions, approximately 12 persona continuations, and five adjudications.

This ceiling is not spending authorization. The non-billable [model and cost preflight](../../../docs/evidence/decisions/mission-4-proof-of-life-preflight-2026-09-03.md) records direct-provider catalog/credential presence, official prices, a $3.16 normal estimate, a $7.65 worst-case planning estimate, and a proposed $10 USD hard campaign ceiling. Before the first model call, obtain explicit owner authorization for the frozen instrument and that currency ceiling. Exceeding any logical or authorized currency ceiling stops execution.

## Required mechanism before freeze

No run may begin until focused tests prove all of the following against canonical Flue `history()`:

1. A raw settled snapshot writer retains the exact JSON used for grading.
2. A deterministic trace derives visible user turn indices, ordered skill activations and outcomes, conditional resource reads and outcomes, other tool/executor events, and workpiece-bearing text events.
3. Canonical ordering distinguishes a profile/template read before text from one after text in the same turn.
4. Workpiece recovery records source message id and binds it to the raw snapshot.
5. Construct-only results expose activated skill names so ruler item 4c is decidable.
6. A protocol-owned `run.json` records source/frozen commit, slot, attempt, models, reasoning settings, and host; `validity.json` records validity and stop reason; a refreshable manifest hashes both records and every other retained artifact.

Mechanism code may not classify semantic turns or decide pass/fail. The independent adjudicator applies the ruler to the trace and visible text.

## Context isolation

- Brunch receives only visible user messages and its production-mounted prompt, skills, resources, and tools.
- Interactive personas receive only the persona system policy, their situation pack, private objective, turn budget, and Brunch text returned by `brunch_turn`. They receive no ruler, oracle, target answer, repository tools, or evaluation-side tool details.
- S3/S4 are sent directly as fixed user inputs and use no persona model.
- Each adjudicator context receives the accepted ruler, one raw snapshot, its derived trace, formatted transcript, slot/attempt identity, and mechanical validity record. It receives no private situation pack or case oracle. It must quote the text supporting every semantic classification or finding.
- The owner sees all retained attempts and adjudications when deciding the bounded claim.

## Per-attempt retention

Write each admitted attempt under `docs/evidence/evaluations/mission-4-proof-of-life-v1/runs/<attempt-id>/`:

- `run.json` — protocol-owned attempt identity, source/frozen commit, exact requested/reported models, reasoning settings, host, budgets, and launch time, written before admission;
- `snapshot.json` — canonical settled `history()` snapshot;
- `transcript.md` — formatted projection of that snapshot;
- `trace.json` and `trace.md` — mechanically equivalent ordered events;
- `validity.json` — mechanical validity and stop reason;
- `adjudication.md` — fresh-context quoted ruler application when technically usable;
- `workpiece.md` — only when mechanically recovered from a `runbook-ir` block;
- `manifest.json` — SHA-256 for every sibling artifact; refresh it after adding or changing validity/adjudication records with `yarn workspace @apps/brunch-agent proof:manifest -- <attempt-directory>`.

Campaign root files must include the frozen protocol/instrument manifest, attempt ledger, spend/usage ledger, and final adjudication. Invalid and non-qualifying attempts remain visible in the ledger and are never included in the `3/3` numerator or denominator.

The Industrial Gas workpiece, if recovered, is labelled `evaluation-run` and `handoff-candidate`. Its manifest must say that it is not an accepted workpiece, reusable fixture, database seed, product conversation, Petrinaut witness, or quality result.

## Freeze sequence

1. Land and verify the evidence mechanism without changing model-facing production text.
2. Confirm exact model availability and restricted persona launch configuration in the unsandboxed environment.
3. Select one clean source commit containing the owner-accepted inlining repair and evidence mechanism.
4. Recompute every input, oracle, model-facing file, and protocol hash into a machine-readable instrument manifest; verify S3/S4 prompt-string hashes independently.
5. Run the focused topology, packaging, app, trace, snapshot, construct-only, type, lint, and unit checks at that commit.
6. Record current prices and normal/worst-case currency estimates.
7. Obtain explicit owner acceptance of the exact freeze manifest and paid ceiling.
8. Commit the freeze alone. Only then admit `m4-pol-v1-vestera-p1`.

Any file or model-setting change after freeze creates a new protocol version; do not patch v1 in place after observing behavior.
