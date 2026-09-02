# Draft Mission 5 — Capture-backed review of an honest prebuilt pair

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

## Cold-start reads

A fresh builder must resolve the current repository and the deployment handoff rather than treating this draft as a specification:

- [`../../MISSION.md`](../../MISSION.md) — sole execution authority; consume the selected frozen Mission 4 workpiece, exact source Flue conversation, candidate instrument manifest, and comparative adjudication only after Mission 4 has actually produced and accepted them.
- [`../../MISSION.next.md`](../../MISSION.next.md) — compact future spine, FE-1476 product frame, shared proof obligations, standing locks, and any later evidence admitted after this draft was written.
- [`../mission-archive/2-mechanical-capture-sweep.md`](../mission-archive/2-mechanical-capture-sweep.md) — accepted mechanical capture throughline, exact close evidence, empty-payload boundary, conversation identity, and carried flags.
- [`../mission-archive/3-structurally-typed-runbook-to-headless-pn.md`](../mission-archive/3-structurally-typed-runbook-to-headless-pn.md) and [`../evidence/implementations/fe-1525-headless-runbook-pn.md`](../evidence/implementations/fe-1525-headless-runbook-pn.md) — accepted runbook/workpiece leg, falsified real-model construction leg, and the distinction between a hermetic non-empty fixture and vacuous empty-net parser success.
- [`../evidence/evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md`](../evidence/evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md) — frozen Mission 3 control and cold-reader evidence; do not substitute current source for its instrument revision.
- [`apps/brunch-agent/test/petrinaut-chat.test.ts`](../../../../../apps/brunch-agent/test/petrinaut-chat.test.ts), [`apps/brunch-agent/test/petrinaut-chat.integration.ts`](../../../../../apps/brunch-agent/test/petrinaut-chat.integration.ts), and [`apps/brunch-agent/src/capture/apply-sweep.ts`](../../../../../apps/brunch-agent/src/capture/apply-sweep.ts) — current production chat door and explicit harness-owned sweep.
- [`../../packages/core/src/evidence/capture-store.ts`](../../packages/core/src/evidence/capture-store.ts), [`../../packages/core/test/capture-store.test.ts`](../../packages/core/test/capture-store.test.ts), [`../../packages/binding-flue/src/local-capture-store.ts`](../../packages/binding-flue/src/local-capture-store.ts), and [`../../packages/binding-flue/test/local-capture-store.test.ts`](../../packages/binding-flue/test/local-capture-store.test.ts) — capture envelope, archived evidence, ownership, atomicity, parse, and local durability contracts. Their richer historical types are not permission to expose a typed capture ontology in this mission.
- [`apps/brunch-agent/src/http/petrinaut-chat.ts`](../../../../../apps/brunch-agent/src/http/petrinaut-chat.ts), [`apps/brunch-agent/src/conversation/client-tools.ts`](../../../../../apps/brunch-agent/src/conversation/client-tools.ts), and [`../../../petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx`](../../../petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx) — AI SDK transport, Flue client-tool suspension/resume, and the existing `useChat` / `onToolCall` browser execution boundary.
- Commit `157730cc5a214dd9c543e8d95c7193a219c48aef` on deployment branch `ln/fe-1569-brunch-agent-deployment`, read with `git show`, especially `libs/@hashintel/brunch-agent/docs/evidence/implementations/mission-8-deployment-handoff.md`, plus its `MISSION.md`, `MISSION.next.md`, Mission 4 archive, and archive README. That commit proves a local application artifact and stops at the application-to-infrastructure handoff; it does not prove remote deployment.
- On that branch, inspect `apps/brunch-agent/src/db.ts`, `src/postgres.ts`, `src/database-config.ts`, `test/postgres.test.ts`, `test/database-config.test.ts`, and `test/container-smoke.integration.ts`. Mission 5 activates capture as product data and therefore must use a durable implementation at the claimed replacement boundary; task-local JSON is not an admissible deployed capture store.
- [`../../../petrinaut/docs/ai-assistant.md`](../../../petrinaut/docs/ai-assistant.md) and the other Petrinaut user-guide pages that mention the affected panel flow. Any user-visible change requires same-change documentation and a prompt to replace screenshots if they become stale.

The selected workpiece, source conversation, prebuilt SDCPN, and derivation fixture do not yet have honest canonical paths. They are a Mission 4 exit join and Mission 5 preparation obligation, not names to invent here.

## Visible product advance

Through deployed Brunch, a reviewer types the visible name or id of a consequential element in a selected, honestly prebuilt SDCPN and receives:

1. the current selected Markdown workpiece passage that supports the modelled meaning;
2. the prebuilder's explicit projection rationale, including consequential assumption, uncertainty, omission, default, or representational loss; and
3. exact mechanically retained excerpts from the source Flue conversation.

The response visibly identifies both the workpiece and SDCPN as prebuilt. It makes no claim that Brunch automatically projected the net, inferred a complete provenance graph, or observed and consolidated the conversation in the background. A deliberately broken provenance link returns a visible unsupported/unavailable result rather than a plausible reconstructed explanation.

This is FE-1476 beats 1–3 over one honest pair. The six-beat story is the integrated floor, not the product or demo ceiling; the broader scenario portfolio remains unenumerated and must be named when this draft is cut.

Typing a visible element name or id is the accepted first interaction. Click-to-chat and automatic canvas-selection context are deferred unless textual identification proves ambiguous or burdensome in observed review use.

## Contract stratum

Close the **capture-backed provenance stratum for the selected prebuilt workpiece/SDCPN pair**.

The accepted objects and minimum seam are:

- one frozen current Markdown workpiece revision selected by Mission 4;
- one exact source Flue conversation and explicit settled range;
- immutable mechanical capture envelopes containing exact evidence and source pointers;
- stable references from consequential workpiece passages to capture evidence;
- one honestly prebuilt non-empty SDCPN with stable element ids;
- a minimal derivation fixture from consequential net elements to current workpiece passages, projection rationale, and relevant uncertainty/assumption/loss; and
- one reviewer-facing resolution operation from a typed visible element name/id to that chain.

This stratum is narrower than automatic projection and broader than one green lookup. Every consequential element in the selected pair must have either resolvable provenance or an explicit unsupported/unlinked disposition before the visible pair can be trusted as capture-backed. The contract also covers duplicate, ambiguous, and stale identity; missing evidence; replay/idempotency; capture durability; cross-owner refusal; visible failure; and recovery at the replacement boundary the deployed product claims.

Capture remains domain-opaque evidence. The foreground Markdown workpiece owns semantic synthesis. The derivation fixture records what the human or explicitly identified prebuilder decided. No capture payload becomes the canonical workpiece, assertion card, SDCPN proposal, or semantic intermediate representation.

## Boundary crossings and current throughline hypothesis

```text
Mission 4 selected source Flue conversation
  → harness explicitly names the settled source range
  → Mission 2 mechanical sweep reads Flue history
  → durable capture store archives exact user evidence and immutable envelopes
  → prepared Markdown workpiece references the relevant capture ids/spans
  → identified prebuilder creates a non-empty SDCPN and minimal derivation fixture
  → durable product state preserves workpiece, derivation, captures, and owner binding
  → deployed Petrinaut reviewer sees the selected prebuilt net
  → reviewer types a visible element name or id in the existing AI panel
  → AI SDK transport sends the turn to the Brunch Flue ChatAgent
  → provenance capability resolves element → derivation → current workpiece → capture archive
  → client/server response returns exact excerpts plus attributed rationale
  → panel renders an evidence-grounded why answer or visible unsupported/unavailable refusal
```

Actor and authority crossings:

- **Flue conversation → Brunch harness:** history is the canonical conversation log; an explicit harness fact, never the interviewer model, schedules the sweep.
- **Harness → capture store:** only mechanical capture projection and evidence archiving occur. The store validates ownership, source pointers, idempotency, atomicity, and durable format.
- **Capture store → workpiece preparation:** a person or explicit preparation step writes narrow references. There is no automatic capture-to-workpiece reducer.
- **Workpiece → prebuilder:** the prebuilder interprets the selected Markdown meaning and records its rationale. The net is not represented as model-generated.
- **Brunch server → Petrinaut browser:** the Flue agent emits a client-tool request or uses another application-level host extension; the existing `useChat` / `onToolCall` path executes it. Petrinaut library code must not gain Brunch-specific business logic.
- **Element id/name → evidence:** deterministic stored links select the derivation and evidence. The model may explain linked material but may not invent links or substitute a transcript reread.
- **Application → deployment substrate:** active Flue and capture/workpiece/derivation state cross the actual Mission 8 persistence boundary. The application artifact exists on the deployment branch; infrastructure deployment and replacement proof remain open.

## Throughline proof floor

At the real deployed product boundary:

1. one consequential visible element in the honestly prebuilt SDCPN resolves from its stable id or unambiguous visible name to the current workpiece passage, prebuilder projection rationale, exact source excerpts, and at least one relevant uncertainty, assumption, omission, default, or loss; and
2. one deliberately broken or stale link visibly returns unsupported/unavailable without fabricated rationale or evidence.

This floor proves a real capture-backed why route for one element and its honest negative control. It does not close the selected pair's whole provenance stratum, prove automatic projection, establish an observer, type capture semantics, or enumerate the broader scenario portfolio.

## Readiness ratchet

```text
Mission 2 mechanical-capture throughline
+ Mission 3/4 accepted workpiece and selected frozen pair
+ Mission 8 landed application contract and still-open infrastructure handoff
→ inherited capture/workpiece/deployment closure required here
→ one deployed capture-backed why answer plus broken-link refusal
→ readiness gate
├─ close provenance breadth and durability for the selected prebuilt pair before Mission 5 ships
├─ admit the stable workpiece/derivation/element seam into Mission 6 automatic projection
└─ leave typed capture semantics, automatic observation, broad scenario coverage, and autonomous projection unearned
```

### Inherited stratum closure

Mission 5 consumes, but must not overstate:

- **Mission 2 throughline:** explicit settled Flue history ranges produce idempotent, source-linked envelopes with payload `{}` and no extraction model. Before use as product data, replay must preserve exact source evidence, owner refusal, format validity, and atomic all-or-nothing behavior.
- **Mission 3/4 workpiece throughline:** the selected workpiece must be cold-readable, epistemically honest, and frozen with the exact candidate instrument and conversation. If Mission 4 exits with a remaining workpiece gap, this mission must either close that named gap before preparing the pair or stop; it may not hide it in the derivation.
- **Prebuilt-pair honesty:** all net content used by the visible path must have an identified preparation route, stable ids, and explicit projection rationale. Parser validity alone and the Mission 3 empty paid document are ineligible.
- **Deployment application contract:** the pinned Mission 8 handoff has locally verified fail-closed Postgres Flue storage, TLS, image, health, content-free telemetry, and container smoke, but no remote infrastructure proof. Because this mission activates capture, its durable storage and replacement behavior become application and infrastructure obligations. Its inactive local JSON capture store is not inherited closure.
- **Product door:** panel → AI SDK → Flue `ChatAgent` and client-tool resume already work. The panel remains the real entrypoint and the stock assistant remains independent.

If any inherited item is unavailable at cut time, name it as open inherited closure with an owner and oracle; do not call the throughline a dependable base.

### Readiness gate after the new throughline

Before Mission 5 can ship its selected-pair claim, assess every consequential element and close:

- resolvable current provenance or an explicit unsupported/unlinked disposition;
- duplicate ids/names, ambiguous name lookup, stale workpiece revision, stale derivation, deleted/renamed element, missing capture, and mismatched owner;
- exact-evidence replay, sweep idempotency, capture/workpiece/derivation durability, atomic update/refusal, format/version refusal, and replacement recovery;
- cross-owner read/write refusal and absence of evidence leakage in errors, telemetry, or rendered answers;
- visible negative states for unsupported, unavailable, ambiguous, stale, and temporarily failed resolution;
- deterministic context source: stored current workpiece and derivation, never transcript fallback disguised as provenance;
- stock-assistant coexistence and a Brunch selection/routing posture sufficient for the selected deployed path;
- representative latency, model/tool usage, timeout, and failure behavior without reintroducing minute-scale foreground extraction/fold work; and
- compaction/stale-state risk: either cross a real compaction boundary and preserve the resolution chain, or state and visibly guard the accepted non-compaction limit.

Mission 6 may inherit the stable seam only after these leaves are enumerable and accepted: current workpiece revision identity, workpiece passage/reference identity, exact capture evidence references, stable net element ids, and projection rationale/derivation identity. **Owner:** Mission 6. **Re-entry gate:** its first automatic projection must write the same seam and Mission 5's why operation must resolve a generated element without fixture-only translation. **Oracle:** Mission 6's deployed generated-element why proof plus repeated/changed projection identity checks.

Do not carry selected-pair provenance breadth, capture durability, owner refusal, or broken-link visibility into Mission 6: Mission 5's visible claim already depends on them.

## Candidate evidence and oracles

| Claim leaf | Existing evidence or candidate oracle |
| --- | --- |
| Explicit harness-owned sweep over real Flue history; no interviewer sweep tool; exact excerpt, `{}` payload, idempotent retry | Existing `apps/brunch-agent/test/petrinaut-chat.test.ts`, test `the committed /api/chat door streams a plain Flue agent through server and client tools`, driven by `apps/brunch-agent/test/petrinaut-chat.integration.ts`. Run `yarn workspace @apps/brunch-agent test:unit`. |
| Capture command closure, source evidence, all-or-nothing refusal, supersession/conflict guards, persisted parse | Existing `libs/@hashintel/brunch-agent/packages/core/test/capture-store.test.ts`, suite `capture-store contract`. Run `yarn workspace @hashintel/brunch-agent test:unit`. These tests are evidence for internal historical mechanics, not permission to expose typed payload semantics. |
| Owner refusal, tmp-and-rename persistence, serialization, invalid-format failure | Existing `libs/@hashintel/brunch-agent/packages/binding-flue/test/local-capture-store.test.ts`, suite `local capture store`. Run `yarn workspace @hashintel/brunch-agent-binding-flue test:unit`. This is local-file evidence only. |
| Panel executes client tools and resumes one turn through AI SDK | Existing `apps/brunch-agent/test/petrinaut-chat.test.ts` plus `libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.test.tsx`, test `adds one dynamic output and sends one automatic follow-up`. Run `yarn workspace @apps/brunch-agent test:unit` and `yarn workspace @hashintel/petrinaut test:unit --run`. |
| Mission 3 workpiece is recoverable and cold-readable; empty paid net is semantically false | Existing `docs/evidence/implementations/fe-1525-headless-runbook-pn.md` and `docs/evidence/evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md`; artifact inspection is the oracle. |
| Mission 8 application contract is locally verified but remote replacement remains open | `157730cc5a214dd9c543e8d95c7193a219c48aef:libs/@hashintel/brunch-agent/docs/evidence/implementations/mission-8-deployment-handoff.md`: exact recorded commands include `yarn workspace @apps/brunch-agent lint:tsc`, `lint:eslint`, `test:unit`, `build`, `build:docker`, and `turbo run test:unit --filter='@hashintel/brunch-agent...'`, plus native arm64, explicit `linux/amd64`, and Docker/Postgres/collector smoke. The handoff explicitly is not remote proof. |
| Selected Mission 4 workpiece, exact conversation, manifest, and adjudication are accepted | **ORACLE GAP:** Mission 4 is still live in this branch. Resolve by naming its frozen candidate paths and owner acceptance/adjudication before this draft can be cut. |
| Every consequential element in the selected prebuilt pair has a derivation or explicit unsupported disposition | **ORACLE GAP:** no selected pair or inventory exists. Resolve with a frozen element inventory mechanically compared with the derivation fixture and human inspection of every unsupported disposition. |
| One typed name/id yields an evidence-grounded answer and broken link yields visible refusal in deployed panel | **ORACLE GAP:** no existing test or deployed witness exercises this operation. At cut time bind it to the exact production-path test and a human panel witness; do not count a server-only fixture. |
| Capture/workpiece/derivation survive the actual claimed replacement boundary | **ORACLE GAP:** deployment branch stopped before remote task replacement and left capture inactive. Resolve with one immutable image, selected durable store, process restart and cross-host replacement inspection against the same ids. |
| Cross-owner provenance refusal | Existing local capture-store owner refusal is inner evidence only. **ORACLE GAP:** bind an outer deployed second-principal probe to the selected identity/access boundary. |
| Stock assistant works with Brunch unavailable | **ORACLE GAP:** current standing lock is not an observed Mission 5 witness. Resolve with the exact host-mode test and browser witness selected at cut time. |
| Latency, usage, transcript fallback, and stale-state behavior are visible | **ORACLE GAP:** define thresholds only from a representative deployed run and owner acceptance; instrument the selected operation without content export. |

## Verification approach

- **Inner mechanism evidence:** run the existing core capture-store, binding local-store, and app sweep tests; add only tests required by the chosen narrow reference and durable-store representation. Mechanism checks must pin exact evidence, immutable captures, stable references, owner refusal, stale/ambiguous resolution, atomic failure, and format refusal. They do not establish the product claim.
- **Middle integration/contract evidence:** drive the production built Brunch application through AI SDK and Flue with the frozen pair, execute the actual provenance capability/client-tool boundary, and verify element → derivation → current workpiece → captures for positive and deliberately broken links. Exercise process restart and the selected durable implementation. Compare every consequential element to the frozen disposition inventory.
- **Outer deployed/user-visible evidence:** a human reviewer opens the selected prebuilt net through the deployed Petrinaut/Brunch boundary, types the visible element name/id, sees the attributed answer and prebuilt label, then exercises a broken link and a cross-owner attempt. Repeat after the claimed task replacement. Explicitly witness that stock mode still works. The mission owns this outer evidence; it may not defer it to Mission 6.
- **Semantic adjudication:** a cold reader checks that each answer distinguishes exact expert excerpts, current workpiece synthesis, and prebuilder rationale/assumption/loss. Plausible prose, source-path display, or link presence without semantic correspondence fails.

## Inputs and joins

- **Mission 4 exit join:** selected frozen Markdown workpiece, exact source Flue conversation/range, exact candidate instrument manifest, comparative evaluation/adjudication, and any smallest remaining workpiece gap. Join fails if these are merely branch-tip files without a frozen identity.
- **Mission 2 join:** explicit `applyCaptureSweep`-style harness operation, evidence archive, capture idempotency, owner key, and no interviewer scheduling. Reuse mechanics only after inspecting current contracts; do not revive generalized typed elicitation.
- **Prebuilt fixture join:** identified preparer, stable net element ids, current workpiece references, capture evidence references, projection rationale, and explicit unsupported dispositions. The pair must be non-empty and semantically inspectable.
- **Mission 8 join:** consume the landed application contract and the open infrastructure handoff accurately. Mission 5 must add durable capture/product-state scope before claiming replacement durability, then join to actual ECS/RDS/collector/ingress identity supplied by infrastructure.
- **Petrinaut host join:** use the existing generic panel tool-execution surface and canonical net identity. Any new UI or user behavior updates Petrinaut docs in the same change.
- **Mission 6 output join:** hand off the accepted seam and why operation so automatic projection can generate derivations that resolve without a fixture-specific adapter.

## Risks and assumptions

| Risk or assumption | Impact if false | Cheapest discriminating validation |
| --- | --- | --- |
| A selected Mission 4 workpiece can host stable passage/reference identity without becoming assertion cards | If false, links churn or a second semantic artifact is needed | Prepare references for the consequential prebuilt pair and revise a non-semantic line; observe whether meaning-bearing references remain unambiguous. Stop before choosing a new ontology. |
| Visible element name is unique enough for reviewer input, with id as escape hatch | If false, a name-only why request can resolve the wrong element | Inventory duplicate/renamed names and exercise an ambiguous query that must request/disclose the id rather than guess. |
| A minimal companion derivation fixture is sufficient for why review | If false, rationale or loss cannot be recovered without transcript reread | Cold-read one consequential and one unsupported element using only workpiece, derivation, and captures. |
| Exact excerpts plus workpiece context are enough for a useful why answer | If false, the UI may expose provenance yet fail the review task | Human reviewer judges whether the answer explains the modelling choice and its uncertainty, not merely lists ids or quotes. |
| The Mission 8 Postgres application boundary can durably host or coordinate activated capture/workpiece/derivation state | If false, task replacement breaks provenance or requires a different durable owner | Implement the least candidate behind existing storage boundaries and run process/cross-host replacement; do not infer from Flue-table durability. |
| The selected short path need not cross Flue compaction | If false, workpiece/evidence recovery may fail during the visible review | Measure the selected conversation against compaction behavior; if crossed, make compaction recovery part of this mission. If not, guard and disclose the limit. |
| A model can explain deterministic linked material without inventing provenance | If false, free-form generation can launder unsupported claims | Negative controls remove or stale one link and compare the answer; require structured unavailable state before explanatory prose. |
| One selected prebuilt pair makes the peer set enumerable | If false, stratum closure cannot be distinguished from one tracer | Freeze the pair and inventory all consequential elements before broadening. |

## Accepted constraints and guarded invariants

- **One authority:** this file remains non-executable until converted into `MISSION.md`. Guard: exact warning and absence of live mission headings.
- **Flue history is canonical conversation log; capture is not a second transcript.** Guard: sweep reads named Flue entries and stores exact spans/excerpts only.
- **Harness owns sweep scheduling.** The foreground model receives no sweep tool and no scheduling instruction. Guard: existing app throughline test's tool-name assertions plus production manifest inspection.
- **Capture envelopes are immutable, exact-evidence, and domain-opaque.** Guard: capture-store parse/idempotency tests and schema inspection; stop if SDCPN fields enter capture payload contracts.
- **Foreground Markdown workpiece owns semantic synthesis.** Guard: cold-reader inspection and absence of an automatic capture reducer.
- **Prebuilt means prebuilt.** Guard: visible product label and frozen preparation manifest. Stop the line if the pair is described as automatically projected.
- **No observer.** No token threshold, `useAgentFinish` scheduler, asynchronous model fold, assertion consolidation queue, or automatic background update enters this mission. Guard: dependency/tool/state inventory.
- **No typed capture ontology or assertion-card default.** No closed kinds, slots, subject/predicate/value, per-capture SDCPN hints, or typed completion algebra. Guard: public-schema review.
- **No automatic projection.** The net and derivation are fixtures/prepared artifacts; no workpiece-to-mutation engine is mounted. Guard: tool manifest and preparation record.
- **No transcript fallback.** A missing stored link returns unsupported/unavailable. Guard: broken-link negative control.
- **Durability matches the claim.** Task-local JSON cannot support replacement durability. Guard: restart and cross-host replacement with the same ids and owner binding; startup refuses incompatible/missing durable configuration.
- **Ownership fails closed.** Guard: existing local owner refusal plus deployed second-principal probe.
- **Petrinaut remains contract owner and stock assistant remains independent.** Guard: no Brunch-specific logic in the published Petrinaut core, host coexistence test, and stock-mode browser witness.
- **No content-bearing telemetry by default.** Guard: trace/log inspection for excerpts, prompts, tool payloads, credentials, and owner material.

## Cross-cutting obligations

- Workpiece sufficiency: a cold reader can reconstruct the relevant objective/process meaning and distinguish evidence, inference, assumption, unknown, conflict, omission, and construction-opened loss.
- Evidence provenance: exact conversation evidence remains attributable; normalized workpiece or model prose is never presented as quotation.
- Projection fidelity for this prebuilt pair: every consequential prebuilt region names the workpiece material and preparer's rationale; no automatic generation claim is made.
- Failure visibility: ambiguity, missing/stale links, owner mismatch, durable-store refusal, and unavailable Brunch visibly stop/degrade the operation without advancing or fabricating state.
- Interaction quality: the why operation remains in reviewer language and does not expose construction schemas or block on semantic extraction/fold work.
- Security/privacy: consume Mission 8's restricted-boundary posture, trusted identity decision, durable state, and content-free operational visibility as actually accepted at cut time.
- Host continuity: preserve `useChat` / `onToolCall`, separate histories, and stock-assistant availability.
- User docs: update affected Petrinaut docs with what the reviewer types, what appears, and failure behavior; prompt for screenshot replacement if the UI changes.
- Architecture docs: if a new Petrinaut/Brunch folder forms a real architectural unit, add the required local declaration and run the Petrinaut architecture-doc lint.

## Expected touched paths

Tentative only; re-evaluate after the real boundary survey.

```text
libs/@hashintel/brunch-agent/
├── MISSION.md                                                     ~ cut-time authority only
├── docs/evidence/                                                 + selected-pair/provenance adjudication
├── packages/core/src/evidence/                                    ~ only if narrow reference/durable contracts belong in core
├── packages/core/test/                                            ~ corresponding contract guards
├── packages/binding-flue/src/                                     ~ durable capture adapter only if this remains the honest binding
└── packages/binding-flue/test/                                    ~ ownership/recovery/refusal guards

apps/brunch-agent/
├── src/capture/                                                    ~ explicit harness sweep and durable store composition
├── src/conversation/                                               ~ narrow provenance capability/client-tool signal if earned
├── src/agents/chat-agent/                                          ~ mount only the why capability, never automatic projection
├── src/http/                                                       ~ selected deployed route/identity composition if required
└── test/                                                           ~ production throughline and replacement integration

libs/@hashintel/petrinaut-core/                                     ? generic host contract only if an existing neutral extension is insufficient
libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/ ~ generic visible why/failure presentation if required
libs/@hashintel/petrinaut/docs/                                     ~ affected user-facing guidance
deployment/infrastructure source outside this checkout              ? actual durable restricted service resources and remote proof
```

Do not create a capture ontology package, observer package, projection engine, graph database, generalized provenance platform, second server, or TUI.

## Fog-line

- The exact selected Mission 4 workpiece and whether stable references can be embedded in Markdown without changing its accepted semantics.
- The exact source conversation/range and capture replay needed for the pair.
- The smallest honest derivation representation and whether it travels with the workpiece, net, or as a companion manifest.
- The consequential-element inventory and what counts as consequential for the selected pair.
- Whether visible names are unique, ids are discoverable, or the existing panel needs a generic element-reference affordance.
- The exact durable owner for capture, workpiece, and derivation data at the Mission 8 replacement boundary. Flue Postgres durability does not automatically include these objects.
- The deployed host selection and trusted identity/access boundary; deployment branch evidence stops before these exist.
- Whether the selected review crosses Flue compaction and, if so, how current workpiece and evidence references survive it.
- Representative latency/usage and the smallest non-content operational signals needed to diagnose why-resolution failure.
- The accepted broader scenario portfolio. Do not infer it from Vestera or from the one prebuilt pair.

## Stop or reorient

Stop and surface the smallest blocker if:

- Mission 4 has not frozen the selected workpiece, source conversation, instrument manifest, and adjudication;
- a selected pair cannot be prepared without inventing unsupported operational meaning or hiding material workpiece gaps;
- product language or UI implies the prebuilt net was automatically projected;
- why resolution depends on rereading the transcript, model-generated plausible links, or source-path proximity rather than stored references;
- a missing/stale/broken link produces an answer instead of unsupported/unavailable;
- task-local JSON is retained while the product claims survival across task replacement;
- capture payloads acquire SDCPN types, assertion-card semantics, closed kinds/slots, mapping hints, or completion state;
- the foreground model gains a sweep tool, schedules capture, or ordinary turns wait for extraction/fold work;
- an observer, automatic projector, graph database, or one-artifact capture/workpiece merger appears to tidy the route;
- one green element is treated as closure without inventorying every consequential element in the selected pair;
- the published Petrinaut library gains Brunch-specific product logic or the stock assistant becomes dependent on Brunch;
- remote deployment, trusted identity, owner refusal, telemetry, or replacement recovery cannot be observed at the boundary being claimed; or
- the scenario portfolio must be invented rather than named honestly at cut time.

## Carried evidence and rejected alternatives

- Mission 2 established the least capture pipe: explicit harness range, one exact envelope per user utterance, payload `{}`, stable ids on replay, no model extraction, no sweep tool. It did not establish typed semantics, a workpiece join, or durable remote product data.
- Mission 3 accepted one Flue runbook/workpiece path and falsified real-model construction on the exercised provider-visible schema bridge. The hermetic non-empty callback fixture proves packaging and canonical validation; the paid empty net is not a candidate prebuilt pair.
- Mission 4 is expected to supply the selected workpiece and exact conversation. Its owner-led semantic choices remain upstream; this mission may not silently redesign them while adding references.
- The pinned Mission 8 handoff supplies a locally verified application contract and explicit handoff: fail-closed Postgres Flue state, IAM/static-password paths, TLS, image, health, content-free OTel, and container smoke landed; ECS/RDS/collector/ingress credentials, real IAM/provider turn, replacement recovery, rollback, and acceptance did not. Capture remained inactive and local JSON. That distinction is load-bearing.
- The full capture/workpiece A–D alternatives, shadow-join probe, measurements, and re-entry conditions live in [`MISSION.next.md`](../../MISSION.next.md#captureworkpiece-seam-history-and-rejected-mechanisms). **Mission 5 selects support links only for the prepared pair:** immutable evidence stays separate from editable Markdown synthesis and joins through stable references plus derivation. Complete independence loses only as a sufficient FE-1476 delivery posture; capture-fold and one-artifact shapes remain rejected here.
- Versioned assertion cards remain a possible future response only if the selected Markdown reference seam fails under observed revision strain. They are not the Mission 5 default.
- Typed capture payloads, per-capture loss categories, closed kind/slot catalogs, precision ladders, completion algebra, `firesWhen`, plugin/repertoire runtime, graph storage, and a target-document ontology remain rejected until a real consumer and failure require them.
- An asynchronous inferential observer remains absent. It may re-enter only under later foreground revision strain with its own evidence for ordering, failure, flush, prior-meaning preservation, and latency.
- Automatic projection belongs to Mission 6. Mission 5's prepared net and derivation make the provenance contract testable without pretending the provider-schema and repeated-projection risks are solved.
