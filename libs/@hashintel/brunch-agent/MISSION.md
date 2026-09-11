# Mission 7c — Inventory worked-model capability and provenance (FE-1573 / FE-1478)

## Status

**Live on `ln/fe-1573-mission-7c`, PR [#9667](https://github.com/hashintel/hash/pull/9667), stacked on the current-net freshness side quest `ln/fe-1653-alternate` (see [`SIDE_QUEST.md`](SIDE_QUEST.md)).** Mission 7b merged to `main` as [#9649](https://github.com/hashintel/hash/pull/9649) and is archived at [`docs/mission-archive/7b-ordinary-batched-construction-provenance.md`](docs/mission-archive/7b-ordinary-batched-construction-provenance.md). Mission 7a landed as [#9562](https://github.com/hashintel/hash/pull/9562). This mission partially addresses [FE-1478](https://linear.app/hash/issue/FE-1478/provide-provenance-from-a-generated-net-back-to-the-requirements-graph) and does not close it.

**Product boundary.** Brunch is Petrinaut's default assistant for understanding, constructing, explaining and revising operational processes as SDCPNs, including organizational, software and cyber-physical operations. It does not claim universal Petri-net assistance. Petrinaut's stock assistant remains functional as the alternate, selected through a host feature flag; when stock mode is active its canonical frontend tool surface is unchanged.

**Reconciled 2026-09-11** against the owner's reconciliation report. Sections below state the intended direction in present tense; the status tables state what holds on this branch. Items awaiting PM confirmation are marked as such. Before review or close, this file is reconciled again against what landed and what PM confirmed.

**External dependencies, not absorbed here:** Tim owns hosted infrastructure and remote readiness (Mission 8 successor, [FE-1569](https://linear.app/hash/issue/FE-1569)); Kostandin owns the carried Voice limitations; PM confirms scenarios/metrics, structured questions and assumption-based preview; Mission 9 ([FE-1438](https://linear.app/hash/issue/FE-1438)) owns repeat/change/retirement/concurrency; Mission 10 ([FE-1394](https://linear.app/hash/issue/FE-1394)) owns general reviewer authority and revision; Mission 11 owns accepted optimization handoff. The stock/Brunch selection request is recorded at [FE-1650](https://linear.app/hash/issue/FE-1650), whose default direction (stock default, Brunch opt-in) is superseded by the boundary above and needs amending when the flag is built.

## Imperative

Make a product manager able to open a stable Inventory purchasing worked model, inspect a legible sophisticated SDCPN with its retained Brunch conversation and workpiece, ask why consequential content exists, correct it in ordinary language, see compiler-clean model changes and coherent layout, and close and reopen the same copy — and make the same product path work for any named operational-process persona pack, not only the Inventory script.

Inventory is the fully recorded flagship and acceptance exemplar. It is not permitted to be the only path that works: no scenario-specific nouns or IDs in reusable guidance or execution, and a fresh construction and correction for another named pack runs through the same architecture or refuses visibly where a capability is genuinely unsupported.

Do not treat a structurally applied mutation as a type-checked model, a type-checked model as a faithful one, a timeout as clean, a golden-path recording as robustness, or a secret URL as authentication.

## Throughline

```text
Petrinaut with Brunch selected (stock assistant unchanged behind the flag)
→ persona speaks in ordinary language; workpiece revisions settle
→ Brunch recognizes explanation, construction or correction intent
→ getLatestNetDefinition observation (freshness marker asks for one when stale)
→ one mutate_petrinet batch: add, edit or remove root-net parts by ID
→ browser applies the committed prefix and derives complete effects
→ getNetCompilationErrors reaches clean | errors | pending, version-correlated
→ Brunch repairs errors against a fresh observation, if needed
→ applyAutoLayout, separately recorded with pre/post hashes and position effects
→ brunch_why locates the current revision and passage, or says it cannot
→ close/reopen resumes the same conversation, workpiece and net coherently
```

Assistant-mode isolation runs alongside: separate transport and tool manifests, separate conversation histories, no tool-result or history splicing, no accidental Brunch dependency in stock mode, no assumption that every stock tool is mounted into Brunch.

### Cold-start reads

- [`docs/mission-archive/7b-ordinary-batched-construction-provenance.md`](docs/mission-archive/7b-ordinary-batched-construction-provenance.md) — accepted ordinary batch departure base.
- [`docs/reference/architecture/mutation-capability-matrix.md`](docs/reference/architecture/mutation-capability-matrix.md) — every canonical Petrinaut action as admitted or not, how each earns `applied`, where it is exercised, and the refusal the model sees otherwise.
- [`docs/reference/architecture/topology.md`](docs/reference/architecture/topology.md) — stale for the batch carrier, freshness marker and history-backed why tool; reconcile with code before renaming or moving tools.
- [`SIDE_QUEST.md`](SIDE_QUEST.md) and [`../../../apps/brunch-agent/src/conversation/net-freshness.ts`](../../../apps/brunch-agent/src/conversation/net-freshness.ts) — the parent branch's current-net freshness fold over Flue history.
- [`packages/plugin-sdcpn/src/mutate-petrinet.ts`](packages/plugin-sdcpn/src/mutate-petrinet.ts), [`packages/plugin-sdcpn/src/tools/mutate-petrinet.ts`](packages/plugin-sdcpn/src/tools/mutate-petrinet.ts), [`packages/plugin-sdcpn/src/mutation-record.ts`](packages/plugin-sdcpn/src/mutation-record.ts) — the selected carrier and its effect/outcome verification.
- [`../petrinaut-core/src/action-schemas.ts`](../petrinaut-core/src/action-schemas.ts), [`../petrinaut-core/src/selected-mutation-batch.ts`](../petrinaut-core/src/selected-mutation-batch.ts), [`../petrinaut-core/src/ai.ts`](../petrinaut-core/src/ai.ts), [`../petrinaut-core/src/diagnostics.ts`](../petrinaut-core/src/diagnostics.ts) — canonical mutation, batch, compilation-read, headless-diagnostics and ELK authorities.
- [`../../../apps/brunch-agent/src/conversation/why.ts`](../../../apps/brunch-agent/src/conversation/why.ts) — history-backed explanation; the walk it contains is the seam the ledger fold (fog-line) extracts.
- Website `local-storage-demo` host, `mutate-petrinet-tool.ts`, `mutation-record.ts` and `local-storage-demo-search.ts` — browser execution, `layoutRecord`, and URL/mode ownership.

## Proof

### Four evidence levels

These are separate claims and are never collapsed into one another:

1. **Structural** — the mutation applied and its record verifies at the receiving boundary.
2. **Compiled** — Petrinaut's TypeScript diagnostics are clean for the version the batch produced.
3. **Semantic** — the model corresponds to the workpiece; established by human review of the flagship, not by tests.
4. **Behavioral** — the model behaves correctly when executed; **not claimed** by this mission.

Mission 7c proves 1 and 2 mechanically and obtains 3 by Lu's review of the flagship.

### Visible product advance

**Release-note sentence:** Brunch, now Petrinaut's default assistant, builds and corrects an operational-process model in ordinary conversation, keeps it compiler-clean and legible, and answers where a visible part came from — with Inventory purchasing as the recorded flagship.

**Product-manager script:** open the Inventory worked model with Brunch selected, inspect the connected model and workpiece, ask why two consequential elements exist, correct one operational fact in ordinary language, see a compiler-clean bounded net change and coherent layout, close and reopen the same copy. Then switch to the stock assistant and confirm its tools and history are its own.

### Throughline proof floor

| Result | Required oracle | Holds on this branch |
| --- | --- | --- |
| Inventory-derived code-bearing slice on the carrier | Frozen fixture naming one coloured type, parameters, places/arcs, a stochastic transition and one differential equation parses, applies canonically and compiles clean. | Yes — `plugin-sdcpn/test/inventory-slice.test.ts` over `test/fixtures/inventory-slice/batch.json`. |
| Capability-matrix coverage | Every admitted operation is exercised through the browser executor and verifies `applied` at the receiving boundary; an unadmitted operation is refused at its position with the admitted list, nothing applied; the three admitting schemas agree. | Yes — [`mutation-capability-matrix.md`](docs/reference/architecture/mutation-capability-matrix.md): 22 admitted shapes (add, edit, remove), `mutate-petrinet-tool.test.ts`, `mutate-petrinet.test.ts`, `selected-mutation-batch.test.ts`. |
| Structurally applied batch can be compiler-dirty | Mutation `applied`; diagnostics independently `errors` or `pending`; timeout never becomes clean; the exact Flue continuation carried the diagnostics. | Yes — `apps/brunch-agent/test/compiler-feedback.integration.ts` for dirty → clean (vitest wrapper skipped without the website dist); `libs/@hashintel/petrinaut/.../wait-for-diagnostics-refresh.test.ts` forces the timeout and proves the read reports `pending`, never the earlier version's text, and stays pending on the next read until diagnostics actually pass the mutation's version. Before this branch the stock panel returned the stale text on timeout. |
| Repair reaches a version-correlated clean result | Follow-up observation and batch; diagnostics version equals the post-repair definition hash. | Yes — same integration. |
| Dependency changes trigger checks | Type-element, parameter, place-name, arc and colour changes invalidate untouched transition or dynamics code. | Yes — `petrinaut-core/src/lsp/lib/dependency-invalidation.test.ts`; the carrier now admits every operation those tests use. |
| ELK layout is observable and does not stale the next base | `applyAutoLayout` recorded separately; reported final hash equals a fresh `getLatestNetDefinition`; position-only effects; existing user-arranged content requires confirmation. | Yes — same integration plus `layoutRecord` tests in website `mutation-record.test.ts` and plugin `deriveLayoutEffects`. Residual: a user drag during a pending confirmation would be attributed to layout. |
| Ordinary why locates the current revision and passage, or says it cannot | Ordinary-language why with no tool vocabulary; history shows `getLatestNetDefinition` then `brunch_why`; missing or ambiguous provenance reported honestly; never an invented link. | Live witness only (`claude-haiku-4-5`, dev pair): fresh conversation routed correctly and refused honestly. Residuals: the conversation that had just built the net answered from memory; before the two-turn instruction the model proposed both tools together and admission refused the whole proposal (error toast). The why tool's scope is under owner review (fog-line). |
| Stock-mode isolation | With the flag off, stock transport, tools and history are the same as before Brunch existed; switching does not merge histories or reinterpret prior tool calls. | **Not yet.** Today Brunch is used whenever an endpoint is configured; there is no selectable stock mode and no isolation test. |
| Portfolio portability | A fresh construction and correction for a second named operational-process pack runs through the same route; reusable guidance contains no Inventory nouns or IDs; a representative probe suite covers the six named packs under `evaluations/cases/`. | **Not yet.** Packs exist; no probe suite runs them through the construction route. |
| Realistic persona construction recording | A persona interview in ordinary language, recurring workpiece revisions, construction through the visible product, native Brunch and Petrinaut records, no operator-built net, compiler repair where relevant, layout and fresh-hash coherence, recorded why traversal, correction and reopen. | **Not yet.** One operator-driven live run exists as a witness, not as recorded evidence. Synthetic fixtures remain mechanism tests. |

### Readiness gate

The mission completes when Lu performs the product-manager script without IDs, tool vocabulary or developer repair, a second named pack has been run through the same route, and:

| Result | Required oracle |
| --- | --- |
| Inventory is connected and operationally coherent | Lu's review against procurement, supplier disruption, transit, quality/quarantine, expiry/recall, production and demand decisions. Structure and compilation alone cannot pass. |
| Ordinary requests inside the envelope succeed or refuse visibly | Sampled ordinary construction and correction requests across the capability matrix on the live copy: each succeeds through canonical operations or produces a clear unsupported-operation refusal; none crashes, stalls, corrupts the net, silently omits meaning, leaves hidden partial state or claims success. A scripted sequence passing is insufficient. |
| Code-bearing construction is compiler-clean or visibly unresolved | Compiler-feedback tests plus the live copy; no timeout reported as success. |
| Consequential visible elements have recorded basis or an explicit absent disposition | Sampled ordinary why questions on the live copy through the mechanical path. |
| Stock assistant unaffected | Flag-off snapshot of transport, tool manifest and history store equals the pre-Brunch baseline; flag-on/off switching preserves each provider's history. |
| Compaction disclosure | If the flagship conversation crosses compaction: reopen, current-workpiece recovery and why/provenance proven after it. If not: dependence on uncompacted history is disclosed here and required before Mission 9 or any hosted long-lived provenance claim. |
| Tool authority/topology is coherent | Updated topology, import/mount tests and a generated or checked catalogue that fails on duplicate names, ownerless tools, schema copies or unrecorded mount modes. |

### Explicit non-claims

- No general Petri-net assistance; the boundary is operational processes as SDCPNs.
- No simulation-backed behavioral validation (evidence level 4).
- No Petrinaut simulation scenarios or metrics, structured-question widgets or questionnaires, arbitrary import/clone, attachment or complete historical-effect rebinding — pending PM confirmation as non-goals.
- No public deployment, authentication, spend control, backup/recovery or multi-replica safety claim; no general optimization handoff; Voice limitations are Kostandin's.
- A second polished seeded worked-model bundle is stretch scope, not a completion gate, unless PM asks for portfolio breadth.
- Semantic fidelity and reviewer utility remain unassessed until Lu's readiness review. FE-1478 remains open.

## Constraints

- **Canonical authority:** Petrinaut Core owns mutation and command schemas, including `getNetCompilationErrors` and `applyAutoLayout`. Brunch selects or projects them and never copies their field contracts.
- **Tool-surface isolation:** stock mode's canonical frontend tool surface is unchanged. Brunch exposes projected or adapted tools through its own transport and never replaces or mutates the stock tool contracts. The host owns selection and mode wiring; start-of-session selection is the initial contract, and mid-conversation switching needs a separately defined continuity policy.
- **One ordinary mutation interface:** ordinary construction mounts `mutate_petrinet`, not a parallel catalogue of individual mutations. Coverage is determined from the supported product cases (the capability matrix), not from exposing every Petrinaut operation.
- **Separate claims:** the four evidence levels above are different results.
- **Diagnostics:** every batch that writes code or changes a dependency of code reaches a version-correlated diagnostics result before Brunch relies on it. A bounded wait may return `pending`; it never becomes clean by timeout. Failed, stale, no-op and unknown attempts are never causes.
- **Layout:** Petrinaut's asynchronous ELK layered layout is the authority, mounted as its own recorded command. Fresh construction may lay out without confirmation; existing user-arranged content uses the existing confirmation policy. Layout is a document mutation with recorded effects and final hash; coordinates never inherit operational basis; nothing mutates after the reported final hash.
- **Why:** identifies the correct current workpiece revision and passage, reports missing or ambiguous provenance honestly, and never invents a replacement link. Stable semantic identity across arbitrary workpiece rewrites is Mission 9/10's.
- **Earned safeguards:** a limit, gate or refusal remains only when an observed failure, external constraint or explicit owner requirement earns its friction. The former 64 KiB schema threshold is not a provider limit. The 30-operation maximum is provisional.
- **Persistence:** Flue history is canonical conversation history; the workpiece is the recoverable operational account; Petrinaut is the model authority. No second stores.
- **Scope:** no simulation-scenario/metric work, remote write, deployment, unrelated Linear write, or Mission 9–11 breadth without another accepted recut.

### Ownership at the 7c boundary

- Brunch core owns universal workpiece tools and formalism-independent guidance.
- Petrinaut Core owns canonical model actions, commands, batch schema and schemas.
- The SDCPN plugin owns the selected model-facing carrier, formalism-specific operation policy (the capability matrix), basis/effect interpretation and construction guidance.
- The Brunch app owns composition, authorized history, browser/document reconciliation, freshness, history-backed why execution and operational diagnostics.
- The Petrinaut website owns browser execution, diagnostics/layout host integration, assistant-mode selection and URL routing.
- Reconcile naming, definition homes, mounts, execution hosts, display consumers and persistence before renaming or moving tools. Brunch-owned names follow `brunch_<operation>`; canonical Petrinaut action/command names remain camelCase; Flue built-ins remain substrate-owned.

## Fog-line

- **Assumption-based preview** — pending PM. Question put: may Brunch offer to build a provisional model from clearly labelled assumptions when operational evidence is incomplete? Recommended policy: evidence-first by default; offer a provisional preview only when blocked; proceed only on explicit assent; assumptions distinguished from testimony in workpiece, explanation and provenance; confirmable, replaceable, rejectable; never presented as elicited fact. Until PM confirms, an explicit fog-line, not an implicit non-feature.
- **Portfolio portability probe** — the named packs exist under [`evaluations/cases/`](evaluations/cases/): Vestera Scheduling, Data Centre Thermal Operations, Industrial Gas VMI, Pharma Cold Chain, Semiconductor Fab Operations, Truck Fleet Maintenance (Inventory is the flagship, not one of them). Open: the shape of the representative probe suite that runs a fresh construction and correction for each through the same route, and the scan that keeps Inventory nouns out of reusable guidance.
- **Carrier shape** — whether one full union (22 shapes today), capability-grouped carriers or provider-supported deferred loading is the simplest reliable model-facing shape. Decided by the provider probe in the readiness gate, not by a byte cap.
- **Ledger fold** — `why.ts` and `net-freshness.ts` each walk the same client-result stream. One `net-ledger` fold (verified reads, mutations with attempts/outcomes, layout, unrecorded changes) with freshness and why as consumers is the intended shape; `recordedBrowserObservation` moves out of the why tool. Owner constraint (2026-09-11): it is a deterministic projection over canonical Flue history and not a second store or authority — recomputable and unpersisted; no new event IDs; missing or ambiguous records preserved as such, never repaired; live Petrinaut observation kept separate from recorded history; Flue history remains canonical. These constraints are written as tests before any extraction begins.
- **Tool catalogue home** — generated from mount declarations or a checked curated authority map; final model-facing Brunch names and any migration/reset policy for persisted histories.
- **Diagnostics protocol** — returned in `mutate_petrinet`, an explicit read (current), or a hybrid pending/result protocol; must preserve version correlation.
- **Worked-model catalogue and copies** — the pre-reconciliation imperative required a Postgres-backed `?bundle=inventory-purchasing` template with independently owned copies and a clean-copy path. The reconciliation report does not mention this. Retained here as an open question for the owner rather than silently dropped or silently kept.
- **PM decisions** — scenarios/metrics, structured questions, and whether portfolio breadth (a second seeded bundle) becomes a gate.

Settled on this branch, 2026-09-11: ELK runs as a separately recorded command; the operation classes are one union of adds, edits and removals by ID with positions left to layout (see [`mutation-capability-matrix.md`](docs/reference/architecture/mutation-capability-matrix.md)).

## Stop or reorient

- Stop schema expansion if the provider/product route cannot reliably select and populate the representative operations; compare a smaller or deferred catalogue instead of installing an arbitrary byte cap.
- Stop code-bearing construction if diagnostics cannot be correlated to the exact post-mutation definition.
- Stop automatic layout if it can silently move user-arranged content, escape effect accounting or change the document after the reported final hash.
- Stop tool renaming if retained sessions cannot continue under an accepted migration/reset policy.
- Stop the stock-mode flag if it requires Brunch-specific code inside `@hashintel/petrinaut` beyond a generic host extension, or if switching merges histories.
- Stop Inventory acceptance for an inert, flattened, visually illegible, compiler-broken or operator-authored model, or for a path that only works with Inventory nouns.
- Stop simulation-scenario/metric work unless PM explicitly makes it part of the objective.

## Deferred

- [Mission 9](docs/mission-drafts/9-traceable-projection.md) / [FE-1438](https://linear.app/hash/issue/FE-1438): unchanged repeat without duplication; changed-input impact calculation; retirement and identity epochs; concurrent or manual-edit reconciliation; cross-revision passage identity (rename, move, paraphrase, split, merge, delete, reintroduce); repeated portfolio construction. Mission 7c hands off directly; no long pause is implied.
- [Mission 10](docs/mission-drafts/10-bounded-reviewer-revision.md) / [FE-1394](https://linear.app/hash/issue/FE-1394): general reviewer authority, revision cadence policy.
- [Mission 11](docs/mission-drafts/11-optimisation-handoff.md): consumer-accepted optimization handoff.
- [After-demo evaluation](docs/mission-drafts/7-explainable-construction.md): broader semantic, behavioral, provenance and lifecycle evaluation once a useful worked model exists.
- [Future spine](MISSION.next.md): deployment, provider migration and unallocated product concerns.

## Owner decisions

- **2026-09-11 — 7b/7c split.** Lu accepted the narrower 7b close-out and authorized this third FE-1573 PR for Inventory capability, compiler feedback, ELK layout, reliable why routing and tool topology.
- **2026-09-11 — scenarios out by default.** Petrinaut simulation scenarios and metrics are not part of the objective unless PM later admits them.
- **2026-09-11 — first observation is the compiler/layout carrier.** Reached: `compiler-feedback.integration.ts` runs dirty batch → correlated TS2304 → repair → clean → `applyAutoLayout` whose pre hash equals the repair's reported hash and whose post hash equals a fresh `getLatestNetDefinition`.
- **2026-09-11 — edit existing parts, don't remove and re-add.** The batched carrier carries ordinary corrections: rename a place, change a parameter, edit transition code, change a type's fields, switch an arc's type or weight, and remove net-level state. 22 shapes admitted at all three layers; each earns `applied` only through the plugin's verified footprint.
- **2026-09-11 — reconciliation accepted as owner direction.** Brunch is the default assistant within the `process × SDCPN` boundary; the stock assistant is a feature-flagged alternate with an unchanged tool surface; Inventory is the flagship but the path must be portable across named packs; coverage is an explicit capability matrix with succeed-or-refuse acceptance; TypeScript feedback is integrated as evidence level 2 and behavioral correctness is not claimed; the realistic persona recording is required evidence; assumption-based preview and the non-goals list go to PM; compaction is proven only if the flagship crosses it; passage identity and repeat/change/retirement go to Missions 9/10; 7c hands off directly to Mission 9.
- **2026-09-11 — 7c stacks on the freshness side quest.** Reparented onto `ln/fe-1653-alternate` so `layoutRecord` and the freshness marker read one ledger rather than two walks.
