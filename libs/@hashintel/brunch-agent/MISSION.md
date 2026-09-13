# Mission 7c — Inventory worked-model capability and provenance (FE-1573 / FE-1478)

## Status

Live on `ln/fe-1573-mission-7c`, [PR #9667](https://github.com/hashintel/hash/pull/9667). Mission 7b merged as [PR #9649](https://github.com/hashintel/hash/pull/9649) and is archived in [`7b-ordinary-batched-construction-provenance.md`](docs/mission-archive/7b-ordinary-batched-construction-provenance.md). Mission 7a landed as [PR #9562](https://github.com/hashintel/hash/pull/9562). The current-net freshness parent merged as [PR #9672](https://github.com/hashintel/hash/pull/9672) and is now ordinary inherited code on `main`. This mission advances [FE-1478](https://linear.app/hash/issue/FE-1478/provide-provenance-from-a-generated-net-back-to-the-requirements-graph) without closing it.

This file is the normative mission contract: what must be true and how acceptance is judged. Current implementation state, test paths and residual observations belong in [PR #9667](https://github.com/hashintel/hash/pull/9667), not in a second mission document.

**Product boundary.** Brunch is Petrinaut's default assistant for understanding, constructing, explaining and revising operational processes as SDCPNs, including organizational, software and cyber-physical operations. It does not claim universal Petri-net assistance. Petrinaut's stock assistant is the feature-flagged alternate; its canonical frontend tool surface and history remain independent.

## Imperative

Use the team's established, compiler-clean Inventory reference SDCPN and local Pi-harness persona-based development to produce a versioned Inventory fixture bundle containing one retained Brunch session, its workpiece and that reviewed net. Package the complete accepted fixture with the deployed app and seed it into Postgres when the database is created or upgraded.

Make a product manager able to open that stable Inventory purchasing template through `?bundle=inventory-purchasing` as an independently writable copy of the complete connected bundle, with the retained conversation, workpiece, net and their references intact; inspect its legible SDCPN; ask why consequential content exists; correct it in ordinary language; see compiler-clean model changes and coherent layout; and close and reopen the same copy. Editing one copy must not alter the seeded template or a sibling, and the product must create a clean complete-bundle copy from the seed on request.

The current implementation resolves only a principal-owned net projection and mints an empty conversation. That partial path is useful infrastructure, but it does not satisfy worked-model copy, clean-copy, reopen, provenance-resume or Mission 7c acceptance.

Inventory is the fully recorded flagship and semantic acceptance exemplar, but the construction architecture must not depend on Inventory-specific nouns or IDs. The portfolio obligation is tiered:

1. Inventory receives flagship-level construction, correction and explanation recording.
2. All six named operational-process packs receive compatibility/capability probes through the construction route: Vestera Scheduling, Data Centre Thermal Operations, Industrial Gas VMI, Pharma Cold Chain, Semiconductor Fab Operations and Truck Fleet Maintenance.
3. At least one non-Inventory pack receives a fresh end-to-end construction and correction run through the visible product route.

Full end-to-end proof for every pack is not required. Inside the declared capability envelope, an ordinary request must either succeed through canonical Petrinaut operations or refuse visibly and specifically before unsupported work is claimed.

## Throughline

```text
local persona-based development produces an accepted session + workpiece + net
→ app build packages the versioned fixture bundle
→ database creation or upgrade seeds the standard template idempotently
→ ?bundle=inventory-purchasing selects the fail-closed remote document source
→ principal-scoped resolution creates or resumes an independently writable
  copy of the complete connected session + workpiece + net bundle
→ copied identities are stable or coherently remapped while conversation,
  workpiece, mutation/provenance and document-revision links remain intact
→ the remote route fixes the Brunch process assistant and exposes a read-only
  title while identity-explicit revisions persist through the remote repository
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
→ close/reopen resumes the same owned copy coherently
```

Assistant selection is host-owned. Each mode has its own transport, tool manifest and conversation history; no history or tool result is spliced across modes.

### Cold-start reads

- [`docs/mission-archive/7b-ordinary-batched-construction-provenance.md`](docs/mission-archive/7b-ordinary-batched-construction-provenance.md) — accepted ordinary batch and provenance base.
- [`docs/reference/architecture/mutation-capability-matrix.md`](docs/reference/architecture/mutation-capability-matrix.md) — operation ownership, admission, execution and refusal authority.
- [`../../../apps/brunch-agent/src/conversation/net-freshness.ts`](../../../apps/brunch-agent/src/conversation/net-freshness.ts) and [`../../../apps/brunch-agent/src/conversation/net-ledger.ts`](../../../apps/brunch-agent/src/conversation/net-ledger.ts) — current-net freshness and the candidate shared-history projection, including its authority constraints.
- [`packages/plugin-sdcpn/src/mutate-petrinet.ts`](packages/plugin-sdcpn/src/mutate-petrinet.ts) and [`packages/plugin-sdcpn/src/mutation-record.ts`](packages/plugin-sdcpn/src/mutation-record.ts) — selected carrier and receiving-boundary verification.
- [`../petrinaut-core/src/action-schemas.ts`](../petrinaut-core/src/action-schemas.ts), [`../petrinaut-core/src/selected-mutation-batch.ts`](../petrinaut-core/src/selected-mutation-batch.ts) and [`../petrinaut-core/src/diagnostics.ts`](../petrinaut-core/src/diagnostics.ts) — canonical actions, batch schema and TypeScript diagnostics.
- [`../../../apps/brunch-agent/src/database-config.ts`](../../../apps/brunch-agent/src/database-config.ts) — existing SQLite/Postgres adapter on which the catalogue and copy path must build.
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

**Product-manager script:** open `?bundle=inventory-purchasing` and receive an independently writable copy of the fixture's retained conversation, workpiece and net with their references intact; ask why two consequential elements exist; correct one operational fact in ordinary language; observe a compiler-clean bounded change and coherent layout; close and reopen the same connected copy; confirm the template and a sibling are unchanged; and create a clean complete-bundle copy. Confirm that the worked-model document states “This document uses the Brunch process assistant”, presents the template title as read-only and offers no assistant switch. Open an ordinary local document with the stock assistant and confirm that its stock transport, tool manifest and history remain unchanged.

### Throughline proof floor

These are the inner and middle-layer gates before the product-manager script can count as acceptance:

| Required result | Oracle |
| --- | --- |
| Inventory-derived code-bearing slice fits the carrier | A frozen fixture names a coloured type, parameters, places and arcs, a stochastic transition and a differential equation; it parses, applies canonically and reaches clean TypeScript diagnostics. It is mechanism evidence only. |
| The capability envelope is complete and honest | The canonical batch, plugin carrier and website-owned host executor admit the same operations. Every admitted shape verifies `applied` at the receiving boundary. An unadmitted shape is refused at its own position with the admitted names before anything applies. The dedicated [capability matrix](docs/reference/architecture/mutation-capability-matrix.md) is the authority. |
| Compiler feedback is version-correlated | A structurally applied dirty batch reports errors or pending, never stale success; repair begins from a fresh observation and reaches diagnostics for the repaired definition. Dependency changes invalidate all affected code. |
| Layout is a recorded document mutation | `layout_petrinaut_net` is separate from the semantic batch; its pre-hash equals the batch's final definition, its post-hash equals a fresh observation, and its effects are positions only. Existing user-arranged content uses the confirmation policy. |
| Workpiece query uses recorded current-revision evidence | An ordinary question about visible Petrinaut elements obtains a fresh observation, resolves element IDs to existing mutation-attempt revision IDs, maps those to current workpiece passages and relevant session turns, and reports missing or ambiguous provenance without inventing a link. |
| Assistant modes are isolated | On ordinary local documents, host tests compare transports, tool manifests and history stores; switching preserves each provider's history without reinterpreting prior tool calls. Worked-model routes fix Brunch and do not offer the switch. |
| The partial worked-model net projection is source- and identity-explicit | `apps/brunch-agent/test/{worked-model-store,worked-model-routes}.test.ts`, `apps/brunch-agent/test/integration/worked-model-net-projection.test.ts`, and `apps/petrinaut-website/src/main/app/local-storage-demo/{documents/**/*.test.ts,local-storage-demo-app.test.tsx}` are the existing green store, route, repository and controller oracles. They prove principal-scoped GET/POST/PUT, fresh net projections, fail-closed remote selection, revision persistence after open, typed process binding, fixed Brunch mode and read-only remote title. They do not prove a worked-model copy because they do not preserve the fixture session, workpiece or their links. |
| Complete connected-bundle acceptance remains executable debt | A dedicated `apps/brunch-agent/test/worked-model-bundle-copy.contract.test.ts` expected-failure or explicitly skipped suite must pin fixture-derived session/workpiece availability before a new turn, coherently remapped provenance links, same-copy reopen, clean session/workpiece/net copying and the build-discovered Postgres product path. These pins remain visibly unmet until their blocking capability exists; green net-projection tests cannot satisfy this result. |

Host-executor tests are not live-browser construction evidence. The portfolio and persona gates below must exercise representative admitted operations and refusals through the visible product.

### Readiness gate

The mission completes only when Lu can perform the product-manager script without IDs, tool vocabulary or developer repair, and all of the following hold:

| Acceptance result | Required oracle |
| --- | --- |
| Inventory template and copies behave as one worked model | Build/seed and Postgres integration plus two-principal product proof: the exact accepted local fixture is seeded idempotently; the route creates or resumes the right independently writable complete-bundle copy; copied or coherently remapped references connect its retained conversation, workpiece history, current revision/passages, mutation provenance, net and document revision history; copy edits never reach the template or sibling; same-copy reopen preserves that connected bundle; and a clean copy resets session, workpiece and net together. The complete-bundle pins above must pass; the current net projection cannot satisfy this gate. |
| Inventory is connected and operationally coherent | Lu reviews procurement, supplier disruption, transit, quality/quarantine, expiry/recall, production and demand decisions. Structural and compiled evidence cannot pass this gate. |
| The tiered portfolio obligation is met | Repeatable run records demonstrate all three tiers defined in the Imperative, and a scan confirms that reusable guidance contains no Inventory-specific nouns or IDs. |
| Ordinary requests succeed or refuse visibly | Representative live-browser construction and correction across the capability envelope succeeds through canonical operations or produces a clear unsupported-operation refusal. No case crashes, stalls, corrupts the net, silently omits requested meaning, leaves hidden partial state or claims success. |
| Code-bearing construction is clean or visibly unresolved | The live copy reaches level 2 for the exact produced definition, or visibly reports errors/pending. No timeout is treated as success. |
| Consequential content has an honest basis disposition | Sampled ordinary why questions traverse the recorded mechanical path and return a current-revision basis or an explicit absent/ambiguous disposition. |
| The flagship is genuinely persona-driven | A local Pi-harness recording shows ordinary-language interview around the established reference net, recurring workpiece revisions, model-originated tool calls, compiler repair where needed, layout, explanation, correction and same-copy reopen. Browser-only or faux-provider scripts remain product/mechanism tests, not persona evidence. |
| Mode isolation survives the product route | On an ordinary local document, a flag-off comparison preserves the stock transport, tool manifest and history behavior. A worked-model document offers no assistant switch and states “This document uses the Brunch process assistant.” |
| Compaction dependence is disclosed | If the flagship crosses compaction, reopen, current-workpiece recovery and explanation are proven afterward. If it does not, dependence on uncompacted history is stated at closure and remains required before Mission 9 or any hosted long-lived provenance claim. |
| Tool authority and topology are coherent | The topology and import/mount tests agree with a generated or checked catalogue that fails on duplicate names, ownerless tools, schema copies and unrecorded mount modes. |

## Constraints

### Authority and execution

- Petrinaut Core owns canonical mutation and command schemas, including `getNetCompilationErrors` and `applyAutoLayout`. Brunch selects or projects them and does not copy their field contracts.
- Ordinary construction exposes one model-facing `mutate_petrinaut_net` carrier, not a parallel catalogue of individual mutations. Its admitted set is governed by the capability matrix, not by a schema-size threshold.
- Every code-bearing batch, or batch that changes a code dependency, reaches a version-correlated diagnostics result before Brunch relies on it. A bounded wait may return `pending`; it never becomes clean by timeout.
- Petrinaut's ELK layout is authoritative. Coordinates do not inherit operational basis, and nothing may mutate after the recorded final hash.
- `query_workpiece` is the one model-facing current-basis operation. Its plugin-contributed selector accepts Petrinaut element IDs; the plugin resolves them through recorded effects to existing per-operation mutation-attempt tool-call IDs, which are the target mutation revision identities. Generic workpiece code maps those IDs to workpiece revisions, passages and relevant session turns. The Brunch app supplies authorized canonical history and current-document reconciliation. Stable semantic identity across arbitrary workpiece rewrites belongs to Missions 9 and 10.
- Safeguards remain only when earned by an observed failure, external constraint or explicit owner requirement. The 30-operation maximum remains provisional; the retired 64 KiB schema threshold is not a provider limit.

### Persistence and identity

- Flue history is canonical conversation history; the workpiece is the recoverable operational account; Petrinaut is the model authority.
- The Inventory template and owned copies live in the Brunch app's Postgres store through the existing adapter and migrations. Versioned fixture bundles produced locally are build inputs whose exact session, workpiece and net are seeded idempotently; they are not a runtime promotion path. Every owned copy must preserve that complete connected bundle under stable or coherently remapped identities. The current net-only projection is an incomplete implementation finding, not accepted copy semantics. SQLite remains for lightweight tests and disposable local work. Do not create a second persistence system.
- A `?bundle=` key identifies a template; it does not authenticate a user by obscurity. Any bearer-capability proposal requires explicit review of entropy, logging, sharing, revocation and authorization.
- A projection over Flue history remains recomputable and unpersisted. It cannot introduce identities, repair or drop ambiguous records, consult a live Petrinaut state as hidden input, reorder history, or become another authority.

### Ownership

- Brunch core owns universal workpiece tools and formalism-independent guidance.
- Petrinaut Core owns model actions, commands and canonical schemas.
- The SDCPN plugin owns the selected carrier, formalism-specific operation policy, basis/effect interpretation and construction guidance.
- The Brunch app owns composition, authorized history, browser/document reconciliation, freshness, workpiece-query history access, operational diagnostics and the Postgres catalogue/copy path.
- The Petrinaut website owns browser execution, diagnostics/layout host integration, assistant selection and URL routing, including `?bundle=`. Route identity selects the document source independently of the host-local assistant preference. A bundle route fails closed, fixes Brunch, hides the switch and restores the untouched preference on return to an ordinary route. Its repository persists identity-explicit revisions; its title is read-only.
- Workpiece operations use action names rather than ownership prefixes: `read_workpiece` reads the current workpiece and source/locator material; `mutate_workpiece` submits a complete next revision and records its verified delta from the cited base. Retained histories may recognize the legacy `brunch_workpiece` and `update_workpiece` names, but new conversations mount only the current names. Canonical Petrinaut action and command names remain unchanged. Definition homes, mounts, execution hosts, display consumers and persistence must agree before any other tool is renamed or moved.

### Scope boundary and external owners

- No Petrinaut simulation scenarios or metrics, structured-question widgets or questionnaires enter 7c unless PM explicitly recuts the objective.
- The established Inventory fixture's existing scenarios and metrics are retained as reference content. Mission 7c does not thereby support creating or editing them, or claim their behavioral results.
- No arbitrary user import/clone, attachments or complete historical-effect rebinding enter the copy path. Catalogue-controlled instantiation of a versioned seeded fixture into an independently writable copy is the intended product path.
- No public deployment, hosted authentication, spend control, backup/recovery or multi-replica safety claim enters 7c. Tim owns hosted infrastructure and remote readiness under the Mission 8 successor and [FE-1569](https://linear.app/hash/issue/FE-1569).
- Voice limitations remain Kostandin's. General optimization handoff is Mission 11's.
- A second polished seeded bundle is not a completion gate. Portfolio breadth is proven by the tiered obligation above.
- Crew reservation is a legacy, test-authored Mission 6 resume fixture: regression evidence only, not demo content, provenance evidence, a worked-model template, an owned-copy implementation or a precedent for the Inventory path.

## Fog-line

- **Assumption-based preview:** PM must decide whether Brunch may offer a provisional model when operational evidence is incomplete. The recommended policy is evidence-first; offer only when blocked; require explicit assent; distinguish assumptions from testimony in workpiece, explanation and provenance; keep them confirmable, replaceable and rejectable.
- **Portfolio probe shape:** the obligation is settled, but the per-pack probe and turn budget, the non-Inventory end-to-end pack, and the reusable-guidance noun/ID scan remain to be selected.
- **Carrier shape:** provider/product probes decide whether one full union, capability-grouped carriers or supported deferred loading is simplest.
- **Shared history projection:** shared interpretation of canonical Flue history is the product contract, not a predetermined module. The candidate projection is retained only if parity tests show that it removes duplicate interpretation without creating a store, identity scheme or authority.
- **Question marker reliability:** `brunch_mark_question` supports Voice question replay when the model calls it with exact matching prose. Plumbing is proven; autonomous activation reliability is not. Decide whether this model-compliance mechanism remains mounted, moves behind a deterministic response contract, or is removed.
- **Seeded session/workpiece fork:** Complete connected-bundle copying is blocked on a supported way to fork or export/import the retained Flue session and workpiece while coherently remapping identities and preserving links to mutation provenance and Petrinaut revisions. Flue 2.0.3 exposes no supported public operation for this, and projected `history()` cannot reconstruct canonical stream records or persistent state. Determine whether the capability belongs in Flue, an adapter-level utility or an application-owned archival format, and which identities it remaps. Never clone private Flue tables or present transcript replay as retained history. Until this closes, the current net projection remains an explicitly incomplete implementation and complete-bundle acceptance stays open.
- **Diagnostics protocol:** select mutation-returned diagnostics, an explicit current read, or a hybrid pending/result protocol while preserving version correlation.
## Stop or reorient

- Stop carrier expansion if the provider/product route cannot reliably select and populate representative operations; compare grouped or deferred carriers rather than imposing an arbitrary byte cap.
- Stop code-bearing construction if diagnostics cannot be correlated to the exact post-mutation definition.
- Stop automatic layout if it can silently move user-arranged content, escape effect accounting or change the document after its recorded final hash.
- Stop the assistant flag if it requires Brunch-specific behavior inside `@hashintel/petrinaut` beyond a generic host extension or merges provider histories.
- Stop the copy path if one copy can alter the template or a sibling, or if reopen cannot resume the same copy.
- Stop Inventory acceptance for an inert, flattened, illegible, compiler-broken or operator-authored model, or a path that only works with Inventory-specific language.
- Keep separate history walks rather than extracting a shared projection that fails the authority constraints.

## Deferred

- [Mission 9](docs/mission-drafts/9-traceable-projection.md) / [FE-1438](https://linear.app/hash/issue/FE-1438/project-an-evidence-backed-workpiece-into-a-traceable-live-sdcpn): unchanged repeat without duplication; changed-input impact; retirement and identity epochs; concurrent/manual-edit reconciliation; cross-revision passage identity; repeated portfolio construction. Mission 7c hands off directly after valid closure.
- [Mission 10](docs/mission-drafts/10-bounded-reviewer-revision.md) / [FE-1394](https://linear.app/hash/issue/FE-1394/revise-one-traceable-net-region-through-targeted-reviewer-elicitation): general reviewer authority and revision cadence.
- [Mission 11](docs/mission-drafts/11-optimisation-handoff.md): consumer-accepted optimization handoff.
- [After-demo evaluation](docs/mission-drafts/7-explainable-construction.md): broader semantic, behavioral, provenance and lifecycle evaluation.
- [Future spine](MISSION.next.md): deployment, provider migration and unallocated product concerns.
- After the Inventory bundle path lands, evaluate removing the user-facing crew-reservation fixture selector, manifest and preparation flow. Keep only useful frozen regression histories under tests; historical archives remain.
