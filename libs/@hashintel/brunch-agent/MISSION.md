# Mission 7c — Record an Inventory worked example from scratch (FE-1573 / FE-1478)

## Status

Live, not accepted, on `ln/fe-1573-mission-7c`, [PR #9667](https://github.com/hashintel/hash/pull/9667). Advances [FE-1478](https://linear.app/hash/issue/FE-1478/provide-provenance-from-a-generated-net-back-to-the-requirements-graph) without closing it.

This file owns the contract and current progress dispositions. The PR holds detailed verification results and residuals; native run records hold execution evidence. Update the state below in place, not as a running log.

- **Established base:** mutation/compiler/layout/provenance infrastructure and the Pi persona launcher exist; see [mechanism coverage](#throughline-proof-floor). The existing Inventory opening assumes a preloaded reference net and needs alignment with this from-scratch cut before use.
- **Acceptance open:** one retained run must connect ordinary-language elicitation to an agent-built net, explanation, correction and original-session reopen, followed by Lu's review. Distribution and portfolio breadth are [next-mission work](docs/mission-drafts/worked-example-distribution-and-breadth.md), not blockers on this run.
- **Next observation — builder:** use the existing persona/product route with a fresh session and empty net to learn whether Brunch can construct Inventory from elicited meaning. First align the input and verify the empty starting state. Lu must supply the bounded model/run allocation under [execution safety](evaluations/README.md#execution-safety) before paid inference. Discriminator: native records show model-originated construction and its correspondence to the saved account, or the first concrete failure that prevents it.

### Owner decisions

- **2026-09-13 — Lu:** close this branch on a recorded persona-driven worked example starting from scratch. Defer fixture distribution and portfolio breadth to the next mission; the later reusable demo depends on first producing this example. This cut changes scope, not acceptance of the unrun example or authorization of a paid allocation.

## Imperative

Produce one recorded Inventory purchasing worked example through the local Pi persona setup and the actual Brunch/Petrinaut product route. Start with a fresh conversation, no prior workpiece and an empty net. The persona supplies operational knowledge in ordinary language; Brunch elicits and records it, constructs a connected compiler-clean SDCPN, explains consequential content and makes one bounded correction from a changed operational fact. Close and reopen that same local document/session and demonstrate continuity.

Retain the conversation, workpiece revisions, mutation/provenance records and final net in the original run for Lu's semantic review and the next mission's input. Recording a useful example does not require packaging, seeding, copying or exporting its session. Local-only evidence remains valid within that stated limit.

The established Inventory reference SDCPN was built by hand and has no associated workpiece or session. Brunch can interpret its visible structure, but cannot recover a recorded construction basis that does not exist. Keep it as an evaluator-side comparator, not a seed, an elicitor input or a source of prewritten mutations. The result need not copy its IDs or layout; it must faithfully represent the elicited operation. Reusable guidance and construction architecture must remain independent of Inventory-specific nouns and IDs.

This proves one worked example, not portfolio breadth, repeatability across runs, simulation correctness or fixture distribution. An unsupported request must refuse visibly and specifically rather than silently omit meaning or claim success.

## Throughline

The full acceptance path is below. The next authorized action is in [Status](#status); the full path is not an execution schedule.

```text
fresh browser/session + empty local net; no preloaded reference or workpiece
→ persona speaks in ordinary language; workpiece revisions settle
→ Brunch recognizes explanation, construction or correction intent
→ read_petrinaut_net supplies a fresh, verified base
→ mutate_petrinaut_net adds, edits or removes admitted root-net parts by ID
→ website applies the committed prefix and records complete verified effects
→ read_petrinaut_diagnostics returns clean | errors | pending for that version
→ Brunch repairs against a fresh observation when errors remain
→ layout_petrinaut_net records its pre/post hashes and position-only effects
→ query_workpiece maps selected Petrinaut elements to their recorded mutation
  revisions, workpiece passages and session turns, or reports absence
→ an ordinary-language correction changes the workpiece and bounded net region
→ close/reopen resumes the original local document and conversation
→ Lu reviews the retained run, operational account and agent-constructed net
```

Assistant selection is host-owned. Each mode has its own transport, tool manifest and conversation history; no history or tool result is spliced across modes.

### Cold-start reads

- [`evaluations/cases/inventory-purchasing/`](evaluations/cases/inventory-purchasing/) — private persona situation pack and shared opening; `reference-sdcpn.json` is evaluator-only.
- [`../../../apps/brunch-agent/src/evaluations/persona/launch.ts`](../../../apps/brunch-agent/src/evaluations/persona/launch.ts) — Pi persona entrypoint. Select an ordinary empty-document route explicitly, omit `--initial-net`, and verify actual initial state rather than infer it from flags. Read [execution safety](evaluations/README.md#execution-safety) before provider checks or paid runs.
- [`docs/mission-archive/7b-ordinary-batched-construction-provenance.md`](docs/mission-archive/7b-ordinary-batched-construction-provenance.md) — accepted ordinary batch and provenance base.
- [`docs/reference/architecture/mutation-capability-matrix.md`](docs/reference/architecture/mutation-capability-matrix.md) — operation ownership, admission, execution and refusal authority.
- [`../../../apps/brunch-agent/src/conversation/net-freshness.ts`](../../../apps/brunch-agent/src/conversation/net-freshness.ts) and [`../../../apps/brunch-agent/src/conversation/net-ledger.ts`](../../../apps/brunch-agent/src/conversation/net-ledger.ts) — current-net freshness and the candidate shared-history projection, including its authority constraints.
- [`packages/plugin-sdcpn/src/mutate-petrinet.ts`](packages/plugin-sdcpn/src/mutate-petrinet.ts) and [`packages/plugin-sdcpn/src/mutation-record.ts`](packages/plugin-sdcpn/src/mutation-record.ts) — selected carrier and receiving-boundary verification.
- [`../petrinaut-core/src/action-schemas.ts`](../petrinaut-core/src/action-schemas.ts), [`../petrinaut-core/src/selected-mutation-batch.ts`](../petrinaut-core/src/selected-mutation-batch.ts) and [`../petrinaut-core/src/diagnostics.ts`](../petrinaut-core/src/diagnostics.ts) — canonical actions, batch schema and TypeScript diagnostics.
- [`../../../apps/petrinaut-website/src/main/app/local-storage-demo/documents/`](../../../apps/petrinaut-website/src/main/app/local-storage-demo/documents/) and [`../../../apps/petrinaut-website/src/main/app/local-storage-demo/assistants/brunch/use-process-agent-binding.ts`](../../../apps/petrinaut-website/src/main/app/local-storage-demo/assistants/brunch/use-process-agent-binding.ts) — storage-neutral lifecycle, source crossing and typed conversation identity.
- [`docs/reference/architecture/topology.md`](docs/reference/architecture/topology.md) — current tool and document-lifecycle topology.

## Proof

### Claim discipline

Four evidence levels remain distinct:

1. **Structural:** the mutation applied and its record verifies at the receiving boundary.
2. **Compiled:** Petrinaut's TypeScript diagnostics are clean for the exact version the batch produced.
3. **Semantic:** the model corresponds to the workpiece and operational account, established by human review of the flagship.
4. **Behavioral:** the model behaves correctly when executed.

Mission 7c proves levels 1 and 2 mechanically and obtains level 3 through Lu's review of Inventory. It makes no level-4 claim. A structurally applied mutation is not thereby compiled; a compiled model is not thereby faithful; a timeout is not clean; and a single successful recording is not robustness.

### Visible product advance

**Release-note sentence:** Brunch builds and corrects an operational-process model in ordinary conversation, keeps it compiler-clean and legible, and answers where visible content came from, with Inventory purchasing as the recorded flagship.

**Product-manager script:** watch the retained persona session start with an empty canvas and develop the Inventory operational account and model. In that conversation the persona asks why two consequential elements exist and corrects one operational fact in ordinary language. Observe a bounded, compiler-clean model change and legible layout, then reopen the same local document/session and inspect the continuing account and explanation. Lu reviews the resulting model against actual testimony; no tool vocabulary or developer-authored model repair is needed. A reusable template launch is not part of this script.

### Throughline proof floor

These are existing mechanism checks to reuse while attempting the persona throughline, not an instruction to complete a subsystem checklist before the first informative run. Repair the first boundary that blocks or falsifies the selected run; use affected regression checks for each change.

Dispositions are based on the inspected coverage artifacts and [PR #9667's reported verification and known failures](https://github.com/hashintel/hash/pull/9667), not a fresh execution. **Coverage present** means an instrument exists, not that the whole obligation passed. The PR reports passing affected suites but a failing full Brunch integration run, including compiler-feedback; it does not establish an all-green baseline.

| Required result | Oracle | Current disposition / evidence |
| --- | --- | --- |
| Inventory-derived code-bearing slice fits the carrier | A frozen fixture names a coloured type, parameters, places and arcs, a stochastic transition and a differential equation; it parses, applies canonically and reaches clean TypeScript diagnostics. It is mechanism evidence only. | Coverage present: [Inventory slice test](packages/plugin-sdcpn/test/inventory-slice.test.ts). Persona construction remains open. |
| The run's operations apply or refuse honestly | Use the [capability matrix](docs/reference/architecture/mutation-capability-matrix.md) for admission and canonical execution. Receiving-boundary records verify applied effects; an unadmitted shape refuses at its position before application. A failed supported operation is a finding to repair, not a satisfied construction result. | Coverage present: [carrier tests](packages/plugin-sdcpn/test/mutate-petrinet.test.ts), [admission controls](../../../apps/brunch-agent/test/integration/admission-controls.test.ts). Full-envelope and portfolio proof moves to the successor. |
| Compiler feedback is version-correlated | A structurally applied dirty batch reports errors or pending, never stale success; repair begins from a fresh observation and reaches diagnostics for the repaired definition. Dependency changes invalidate all affected code. | Coverage present: [browser compiler tracer](../../../apps/brunch-agent/test/compiler-feedback.integration.ts). Integration failure reported in PR; not accepted as a green product gate. |
| Layout is a recorded document mutation | `layout_petrinaut_net` is separate from the semantic batch; its pre-hash equals the batch's final definition, its post-hash equals a fresh observation, and its effects are positions only. Existing user-arranged content uses the confirmation policy. | Coverage present: [mutation-record tests](packages/plugin-sdcpn/test/mutation-record.test.ts), [freshness tests](../../../apps/brunch-agent/test/net-freshness.test.ts). Flagship witness remains open. |
| Workpiece query uses recorded current-revision evidence | An ordinary question about visible Petrinaut elements obtains a fresh observation, resolves element IDs to existing mutation-attempt revision IDs, maps those to current workpiece passages and relevant session turns, and reports missing or ambiguous provenance without inventing a link. | Coverage present: [root-creation provenance cases](../../../apps/brunch-agent/test/root-creation.integration.ts). Sampled flagship why answers remain open. |
| Existing mode and tool boundaries remain intact | Reuse [host selection tests](../../../apps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.test.tsx), [catalogue](../../../apps/brunch-agent/src/agents/chat-agent/tool-catalogue.ts) and [schema-carriage comparison](../../../apps/brunch-agent/test/integration/native-schema-carriage.integration.ts) if run repairs touch those boundaries. | Coverage present; full mode-continuity and topology-envelope adjudication is carried in the successor, not silently accepted here. |

Host-executor tests are not persona construction evidence. The readiness gate below must use model-originated calls through the visible product.

### Readiness gate

The mission completes only when the recorded product-manager script works without developer model repair and Lu accepts the worked example. The rows below are judgments over the same run, not separate feature workstreams:

| Acceptance result | Required oracle | Current disposition |
| --- | --- | --- |
| Inventory is connected and operationally coherent | Lu reviews procurement, supplier disruption, transit, quality/quarantine, expiry/recall, production and demand decisions. Structural and compiled evidence cannot pass this gate. | Open: Lu's flagship acceptance not recorded. |
| Ordinary construction and correction succeed | The retained persona run builds from the elicited account, then updates the workpiece and bounded net region for one changed operational fact without unrelated rebuilding. Unsupported work is reported explicitly, never silently omitted or falsely successful. A refusal that prevents a coherent Inventory example leaves this gate open. | Open: requires the from-scratch product run. |
| Code-bearing construction is compiler-clean and legible | The exact final constructed/corrected definition has clean version-correlated diagnostics and recorded layout. Intermediate errors/pending remain visible and repairs start from fresh observations; a timeout never counts as clean. | Open: needs the exact flagship version and diagnostics. |
| Consequential content has a recorded basis | Why questions about two consequential agent-constructed elements trace actual mutation records to workpiece passages and session testimony, checked against native records. Missing or ambiguous basis is disclosed honestly; such disclosures alone do not demonstrate provenance-backed explanation. | Open: needs flagship questions and native records. |
| The flagship starts from scratch and is persona-driven | Initial document/session evidence shows no preloaded net, prior workpiece or retained conversation. A local Pi-harness recording shows ordinary-language elicitation, recurring workpiece revisions, model-originated construction, repair where needed, layout, explanation and correction. The persona's private pack and evaluator reference net never enter the elicitor's inputs. Browser-only scripts, fixed batches and operator-authored repairs are not this proof. | Open: [launcher](../../../apps/brunch-agent/src/evaluations/persona/launch.ts) exists; fresh-state verification and accepted recording remain. |
| The original worked session resumes | Reopen the same local document and conversation in their original stores; recover the final net/workpiece and answer a current-basis question from native records. This is original-session continuity, not export, template copy or identity remapping. | Open: requires the retained run and reopen witness. |
| Compaction dependence is disclosed | If the flagship crosses compaction, reopen, current-workpiece recovery and explanation are proven afterward. If it does not, dependence on uncompacted history is stated at closure and remains required before Mission 9 or any hosted long-lived provenance claim. | Open: depends on the retained flagship run. |

## Constraints

### Product boundary

Brunch is Petrinaut's default assistant for understanding, constructing, explaining and revising operational processes as SDCPNs, including organizational, software and cyber-physical operations. It does not claim universal Petri-net assistance. Petrinaut's stock assistant is the feature-flagged alternate; its canonical frontend tool surface and history remain independent.

### Authority and execution

- Petrinaut Core owns canonical mutation and command schemas, including `getNetCompilationErrors` and `applyAutoLayout`. Brunch selects or projects them and does not copy their field contracts.
- Ordinary construction exposes one model-facing `mutate_petrinaut_net` carrier, not a parallel catalogue of individual mutations. Its admitted set is governed by the capability matrix, not by a schema-size threshold.
- Every code-bearing batch, or batch that changes a code dependency, reaches a version-correlated diagnostics result before Brunch relies on it. A bounded wait may return `pending`; it never becomes clean by timeout.
- Petrinaut's ELK layout is authoritative. Coordinates do not inherit operational basis, and nothing may mutate after the recorded final hash.
- `query_workpiece` is the one model-facing current-basis operation. Its plugin-contributed selector accepts Petrinaut element IDs; the plugin resolves them through recorded effects to existing per-operation mutation-attempt tool-call IDs, which are the target mutation revision identities. Generic workpiece code maps those IDs to workpiece revisions, passages and relevant session turns. The Brunch app supplies authorized canonical history and current-document reconciliation. Stable semantic identity across arbitrary workpiece rewrites belongs to Missions 9 and 10.
- Safeguards remain only when earned by an observed failure, external constraint or explicit owner requirement. The 30-operation maximum remains provisional; the retired 64 KiB schema threshold is not a provider limit.

### Persistence and identity

- Flue history is canonical conversation history; the workpiece is the recoverable operational account; Petrinaut is the model authority.
- Retain the original run's session, workpiece and net through existing local persistence and native evidence. Label local-only records and name their actual locations at handoff; export and Postgres delivery are not prerequisites to believing an inspected run. Do not introduce a second persistence system.
- A projection over Flue history remains recomputable and unpersisted. It cannot introduce identities, repair or drop ambiguous records, consult a live Petrinaut state as hidden input, reorder history, or become another authority.

### Ownership

- Brunch core owns universal workpiece tools and formalism-independent guidance.
- Petrinaut Core owns model actions, commands and canonical schemas.
- The SDCPN plugin owns the selected carrier, formalism-specific operation policy, basis/effect interpretation and construction guidance.
- The Brunch app owns composition, authorized history, browser/document reconciliation, freshness, workpiece-query history access and operational diagnostics. The retained Postgres catalogue/copy path is successor work.
- The Petrinaut website owns browser execution, diagnostics/layout host integration, assistant selection and document routing. Preserve stock transport/tool/history independence during any run-driven repair; deferred remote-route contracts live in the successor draft.
- Workpiece operations use action names rather than ownership prefixes: `read_workpiece` reads the current workpiece and source/locator material; `mutate_workpiece` submits a complete next revision and records its verified delta from the cited base. Retained histories may recognize the legacy `brunch_workpiece` and `update_workpiece` names, but new conversations mount only the current names. Canonical Petrinaut action and command names remain unchanged. Definition homes, mounts, execution hosts, display consumers and persistence must agree before any other tool is renamed or moved.

### Scope boundary and external owners

- No Petrinaut simulation scenarios or metrics, structured-question widgets or questionnaires enter 7c unless PM explicitly recuts the objective.
- The established reference net's scenarios and metrics remain evaluator reference content, not preloaded model content, supported creation/editing or behavioral evidence.
- Fixture packaging/seeding, template distribution, copy/reset/remapping, all six-pack probes and the non-Inventory end-to-end witness belong to the [next mission](docs/mission-drafts/worked-example-distribution-and-breadth.md). Preserve existing implementations and regression pins; deferral is neither deletion authority nor a completion claim.
- No public deployment, hosted authentication, spend control, backup/recovery or multi-replica safety claim enters 7c. Tim owns hosted infrastructure and remote readiness under the Mission 8 successor and [FE-1569](https://linear.app/hash/issue/FE-1569).
- Voice limitations remain Kostandin's. General optimization handoff is Mission 11's.
- Crew reservation is a legacy, test-authored Mission 6 resume fixture: regression evidence only, not demo content, provenance evidence, a worked-model template, an owned-copy implementation or a precedent for the Inventory path.

## Fog-line

- **Assumption-based preview — PM decision:** decide whether Brunch may offer a provisional model when operational evidence is incomplete. The recommended policy is evidence-first; offer only when blocked; require explicit assent; distinguish assumptions from testimony in workpiece, explanation and provenance; keep them confirmable, replaceable and rejectable. Settle what assent authorizes, which assumptions are acceptable, how provisional content appears in the UI and what review makes it accepted meaning. This is a candidate policy, not permission to implement it.
- **Run allocation — Lu:** select explicit models and a bounded allocation covering Brunch and the Pi persona, including continuation, compaction and retries under execution safety. Preparing inputs and inspecting local wiring do not authorize paid inference.
- **Empty-start product path:** the launcher supports an omitted `--initial-net`, but flags alone do not prove the initial canvas, workpiece or history. Check the ordinary product route and starting evidence before claiming a from-scratch run; repair only a demonstrated setup blocker.
- **Carrier shape:** provider/product probes decide whether one full union, capability-grouped carriers or supported deferred loading is simplest.
- **Shared history projection:** shared interpretation of canonical Flue history is the product contract, not a predetermined module. The candidate projection is retained only if parity tests show that it removes duplicate interpretation without creating a store, identity scheme or authority.
- **Question marker reliability:** `brunch_mark_question` supports Voice question replay when the model calls it with exact matching prose. Plumbing is proven; autonomous activation reliability is not. Decide whether this model-compliance mechanism remains mounted, moves behind a deterministic response contract, or is removed.
- **Diagnostics protocol:** select mutation-returned diagnostics, an explicit current read, or a hybrid pending/result protocol while preserving version correlation.

## Stop or reorient

- Stop carrier expansion if the provider/product route cannot reliably select and populate representative operations; compare grouped or deferred carriers rather than imposing an arbitrary byte cap.
- Stop code-bearing construction if diagnostics cannot be correlated to the exact post-mutation definition.
- Stop automatic layout if it can silently move user-arranged content, escape effect accounting or change the document after its recorded final hash.
- Stop the assistant flag if it requires Brunch-specific behavior inside `@hashintel/petrinaut` beyond a generic host extension or merges provider histories.
- Stop the from-scratch claim if the run starts from a prebuilt net, existing workpiece/history, or requires operator-authored mutations to count as success.
- Stop Inventory acceptance for an inert, flattened, illegible, compiler-broken or operator-authored model, or a path that only works with Inventory-specific language.
- Keep separate history walks rather than extracting a shared projection that fails the authority constraints.

## Deferred

- [Next mission — worked-example distribution and portfolio breadth](docs/mission-drafts/worked-example-distribution-and-breadth.md): complete versioned fixtures, build/Postgres seeding, connected-bundle copy/reset/reopen, identity/provenance remapping, template/sibling isolation, remote-mode continuity, six-pack capability probes, a non-Inventory end-to-end run and full-envelope/topology adjudication. Consumes the accepted original example; unresolved fork capability and expected-failure pins remain open there.
- [Mission 9](docs/mission-drafts/9-traceable-projection.md) / [FE-1438](https://linear.app/hash/issue/FE-1438/project-an-evidence-backed-workpiece-into-a-traceable-live-sdcpn): unchanged repeat without duplication; changed-input impact; retirement and identity epochs; concurrent/manual-edit reconciliation; cross-revision passage identity; repeated construction beyond the next mission's portfolio probes.
- [Mission 10](docs/mission-drafts/10-bounded-reviewer-revision.md) / [FE-1394](https://linear.app/hash/issue/FE-1394/revise-one-traceable-net-region-through-targeted-reviewer-elicitation): general reviewer authority and revision cadence.
- [Mission 11](docs/mission-drafts/11-optimisation-handoff.md): consumer-accepted optimization handoff.
- [After-demo evaluation](docs/mission-drafts/7-explainable-construction.md): broader semantic, behavioral, provenance and lifecycle evaluation.
- [Future spine](MISSION.next.md): deployment, provider migration and unallocated product concerns.
