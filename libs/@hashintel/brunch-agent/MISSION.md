# Mission 7c — Inventory worked-model capability and provenance (FE-1573 / FE-1478)

## Status

**Live on `ln/fe-1573-mission-7c`, stacked on Mission 7b PR [#9649](https://github.com/hashintel/hash/pull/9649) under Lu's explicit third FE-1573 PR exception.** This mission also partially addresses [FE-1478](https://linear.app/hash/issue/FE-1478/provide-provenance-from-a-generated-net-back-to-the-requirements-graph): it must make ordinary why questions use the recorded explanation path and carry Inventory-scale provenance. It does not close FE-1478. Mission 7a has landed on `main` as [#9562](https://github.com/hashintel/hash/pull/9562). Mission 7b remains the ordinary structural-batch close-out archived at [`docs/mission-archive/7b-ordinary-batched-construction-provenance.md`](docs/mission-archive/7b-ordinary-batched-construction-provenance.md); its review and merge do not become acceptance through this branch.

Lu accepted the 7b/7c recut on 2026-09-11 and directed this branch to take the Inventory worked-model, compiler, layout, why-routing, tool-topology and Postgres-copy obligations. Petrinaut simulation scenarios and metrics stay out unless PM later admits them. This commit only cuts authority. Implementation starts after it.

## Imperative

Make a product manager able to open a stable Inventory purchasing worked-model bundle, receive or resume an independently owned copy, inspect a legible sophisticated SDCPN with its retained Brunch conversation and workpiece, ask why consequential content exists, correct it in ordinary language, see compiler-clean model changes and coherent layout, close/reopen, and obtain a clean copy without altering the template or another user's copy.

Before this mission, ordinary Brunch can batch a small structural region and correct it, but cannot safely construct code-bearing Inventory dynamics, guarantee readable layout, reliably invoke the recorded explanation path, or open a Postgres-backed worked-model bundle.

Do not treat a structurally applied mutation as a type-checked model, a timeout as clean, or a secret URL as authentication.

## Throughline

```text
Petrinaut ?bundle=inventory-purchasing
→ authenticated principal or explicitly configured demo principal
→ Brunch app resolves Postgres template / owned working copy
→ existing chat + workpiece + SDCPN binding resume coherently
→ Brunch recognizes explanation, construction or correction intent
→ getLatestNetDefinition observation
→ canonical selected mutate_petrinet batch
→ browser applies the committed prefix and derives complete effects
→ diagnostics refresh reaches complete | errors | pending
→ Brunch repairs errors against a fresh observation, if needed
→ ELK layout under fresh/preserved-layout policy
→ final observed hash and derived position effects
→ brunch_why reconciles visible content with retained history
→ close/reopen or clean-copy leaves template and sibling copies unchanged
```

The first implementation observation is not a full Inventory generation. It is a dependency-affecting batch with deliberately invalid dynamics that reaches Brunch as a correlated compiler error, is repaired, and remains hash/effect coherent after ELK layout. That path determines the diagnostics and layout carrier before catalogue materialization depends on them.

### Cold-start reads

- [`docs/mission-archive/7b-ordinary-batched-construction-provenance.md`](docs/mission-archive/7b-ordinary-batched-construction-provenance.md) — accepted ordinary batch departure base.
- [`docs/reference/architecture/topology.md`](docs/reference/architecture/topology.md) — stale for the batch carrier and history-backed why tool; reconcile it with code before renaming or moving tools.
- [`packages/plugin-sdcpn/src/mutate-petrinet.ts`](packages/plugin-sdcpn/src/mutate-petrinet.ts), [`packages/plugin-sdcpn/src/tools/mutate-petrinet.ts`](packages/plugin-sdcpn/src/tools/mutate-petrinet.ts), [`packages/plugin-sdcpn/src/mutation-record.ts`](packages/plugin-sdcpn/src/mutation-record.ts) — current selected carrier.
- [`../petrinaut-core/src/action-schemas.ts`](../petrinaut-core/src/action-schemas.ts), [`../petrinaut-core/src/ai.ts`](../petrinaut-core/src/ai.ts), [`../petrinaut-core/src/commands.ts`](../petrinaut-core/src/commands.ts) — canonical mutation, compilation-read and ELK authorities.
- [`../../../apps/brunch-agent/src/conversation/why.ts`](../../../apps/brunch-agent/src/conversation/why.ts) and [`../../../apps/brunch-agent/src/database-config.ts`](../../../apps/brunch-agent/src/database-config.ts) — history-backed explanation and SQLite/Postgres selection.
- Website `local-storage-demo` host, `mutate-petrinet-tool.ts`, and `local-storage-demo-search.ts` — browser execution and URL ownership.

## Proof

### Visible product advance

**Release-note sentence:** Brunch can open an owned Inventory purchasing model, keep it compiler-clean and legible, answer why a visible part exists from recorded history, and let a second person take a clean copy without disturbing the template.

**Product-manager script:** open `?bundle=inventory-purchasing`, inspect the connected model and workpiece, ask why two consequential elements exist, correct one operational fact in ordinary language, see a compiler-clean bounded net change and coherent layout, close and reopen the same copy, then open a second principal's copy and confirm the first is untouched.

**Previously impossible:** ordinary Brunch could only construct and correct a small structural region on disposable SQLite, without reliable compilation feedback, layout, mechanical why, or a hosted worked-model catalogue.

### Throughline proof floor

This is the first internal milestone, not completion.

| Result | Required oracle |
| --- | --- |
| A minimal Inventory-derived code-bearing slice can be expressed on the selected carrier | Canonical schema projection and selected-operation tests in `libs/@hashintel/petrinaut-core` and `libs/@hashintel/brunch-agent/packages/plugin-sdcpn` for the admitted type/parameter/dynamics operations, plus a frozen fixture naming one coloured type, parameters, places/arcs, a stochastic transition, and one differential equation. |
| A structurally applied batch can be compiler-dirty | Integration test with a known invalid dynamics or kernel surface: mutation outcome is applied, diagnostics independently report `errors` or `pending`, and timeout never becomes clean. Inspect that the exact Flue continuation delivered the diagnostics, not only a React render. |
| A repair batch can reach a version-correlated clean result | The same test's follow-up observation and mutation; diagnostics version matches the post-repair definition hash. |
| Dependency changes trigger checks | Tests covering type-element, parameter, place-name and arc/type changes that invalidate transition or dynamics code without directly editing that code. |
| ELK layout is observable and does not stale the next base | Petrinaut `applyAutoLayout` command tests plus a browser/integration assertion that the reported final hash equals a fresh `getLatestNetDefinition` after layout, including derived position effects. Fresh construction may lay out without confirmation; existing user-arranged content requires confirmation. Type/parameter/dynamics-only batches do not relayout. |
| Ordinary why uses the mounted explanation path | Ordinary-language why cases with no tool names in the user prompt; native history shows `getLatestNetDefinition` then `brunch_why`, and the pane renders that structured result. |

### Readiness gate

The mission completes when Lu can perform the product-manager script without IDs, tool vocabulary or developer repair, and these leaves hold:

| Result | Required oracle |
| --- | --- |
| Inventory is connected and operationally coherent | Lu's review of the visible model against procurement, supplier disruption, transit, quality/quarantine, expiry/recall, production and demand decisions. Exact historical node counts are not an answer key. Structure and compilation alone cannot pass. |
| Code-bearing construction is compiler-clean or visibly unresolved | The compiler-feedback tests above plus the live Inventory copy; no timeout reported as success. |
| Consequential visible elements have recorded basis or an explicit absent/incomplete disposition | Sampled ordinary why questions on the live copy; mechanical path used without user tool vocabulary. |
| Two principals have independent copies | Postgres integration and two-browser/principal product proof: `?bundle=inventory-purchasing` resume, clean copy, template update, sibling isolation, retained workpiece/mutation/why history. A startup template revision affects new copies without duplicating catalogue entries or rewriting existing sessions. |
| The intended deployment store/route is exercised locally | Local Postgres on the production store contract. SQLite remains only for lightweight tests and explicitly disposable local work. |
| Broader schema is provider-usable | Count actual input tokens, submit representative Inventory-derived tool schemas and calls through the selected provider/product route, and compare acceptance, tool selection, repair and latency. No byte threshold substitutes for this probe. |
| Tool authority/topology is coherent | Updated living topology, import/mount tests and a generated or checked catalogue that fails on duplicate names, ownerless tools, schema copies or unrecorded mount modes. |

### Explicit non-claims

- This cut does not yet implement Inventory generation, Postgres copies, tool renaming, or deployment.
- Petrinaut simulation scenarios and metrics are outside the default completion claim pending PM confirmation. A second worked-model bundle is a portfolio decision, not implied by the word “scenario.”
- Semantic fidelity, reviewer utility and genuine testimony remain unassessed until Lu's readiness review.
- Mission 7b's small receiving-dock witness is not an Inventory-quality flagship.
- FE-1478 remains open after this mission's partial provenance delivery.

## Constraints

- **Canonical authority:** Petrinaut Core owns mutation and command schemas, including `getNetCompilationErrors` and `applyAutoLayout`. Brunch may select or project them but must not copy their field contracts.
- **One ordinary mutation interface:** ordinary construction mounts `mutate_petrinet`, not a parallel catalogue of individual mutations. Historical headless and fixture catalogues are distinct proof surfaces.
- **Separate claims:** structural mutation success, compiler cleanliness, semantic correspondence and simulation behavior are different results.
- **Diagnostics:** every batch that writes code or changes a dependency of code reaches a version-correlated Petrinaut diagnostics result before Brunch relies on it. A bounded wait may return `pending`; it never becomes clean by timeout. Failed, stale, no-op and unknown attempts are never causes.
- **Layout:** Petrinaut's existing asynchronous ELK layered layout is the authority. Fresh construction may lay out without confirmation; existing user-arranged content uses the existing confirmation policy. Type/parameter/dynamics-only batches do not relayout. Layout is a document mutation: record its effects and final hash; do not inherit operational basis as if coordinates were user testimony; do not mutate after the reported final hash.
- **Why routing:** a why question about model content uses the mounted recorded explanation capability when that capability is available. Always-on SDCPN guidance owns recognition and routing; the activated job skill owns the detailed read-then-why protocol; the tool description owns its input/refusal contract.
- **Earned safeguards:** a limit, gate or refusal remains only when an observed failure, external constraint or explicit owner requirement earns its friction. Record owner, enforcement point, prevented failure, evidence and reconsideration condition. The former 64 KiB schema threshold is not a provider limit. The current 30-operation maximum is provisional, not a product invariant. Explicit paid-spend authorization remains a legitimate budget.
- **Persistence:** production and worked-bundle paths use Postgres through the existing adapter and migrations. Do not create a second persistence system. SQLite remains for lightweight tests and explicitly disposable local work only.
- **Identity:** a URL key identifies a bundle; it does not authenticate a user by obscurity. Hosted access uses actual authentication or an explicitly configured server-side demo principal. If a secret URL is proposed as a bearer capability, entropy, logging, sharing, revocation and authorization require explicit review.
- **No second stores:** the workpiece remains the recoverable operational account; Flue history remains canonical conversation history; Petrinaut remains the model authority.
- **Scope:** no simulation-scenario/metric work, remote write, deployment, unrelated Linear write, or Mission 9–11 breadth without another accepted recut.

### Ownership at the 7c boundary

- Brunch core owns universal workpiece tools and formalism-independent guidance.
- Petrinaut Core owns canonical model actions, commands and schemas.
- The SDCPN plugin owns the selected model-facing carrier, formalism-specific operation policy, basis/effect interpretation and construction guidance.
- The Brunch app owns composition, authorized history, browser/document reconciliation, history-backed why execution, operational diagnostics and the Postgres catalogue/copy path.
- The Petrinaut website owns browser execution, diagnostics/layout host integration and bundle URL routing.
- Reconcile naming, definition homes, mounts, execution hosts, display consumers and persistence before renaming or moving tools. Preserve stock Petrinaut assistant behavior and canonical Petrinaut names. Brunch-owned names follow `brunch_<operation>`; canonical Petrinaut action/command names remain camelCase; Flue built-ins remain substrate-owned.

## Fog-line

- Exact Inventory operation classes, and whether one full union, capability-grouped carriers or provider-supported deferred loading is the simplest reliable model-facing shape.
- Whether diagnostics should be returned in `mutate_petrinet`, exposed as an explicit read, or use a hybrid pending/result protocol. The selected design must preserve version correlation.
- ~~Whether ELK runs inside the mutation result boundary or as a separately recorded command.~~ Settled 2026-09-11: the canonical `applyAutoLayout` command is mounted as its own browser client tool in batched construction. The website attaches `metadata.layoutRecord` with the observation taken when the call was issued, the observation after it ran, and position-only effects; any other difference is refused. A `mutate_petrinet` result is likewise refused if the document no longer matches its reported `postHash`. Proof: `apps/brunch-agent/test/compiler-feedback.integration.ts`. Open remainder: a user drag while an `askUserFirst` confirmation is pending would be attributed to layout; the record still cannot absorb non-position changes.
- Final model-facing Brunch names and any migration/reset policy for persisted histories.
- Exact home of the tool catalogue and whether it is generated from mount declarations or checked as a manually curated authority map.
- Native Flue/Postgres clone/materialization contract and the minimum safe clean-copy UX.
- Hosted identity for the demo and whether a secret link is merely a selector or an explicitly reviewed bearer capability.
- PM decision on Petrinaut simulation scenarios/metrics and a second worked-model bundle.

## Stop or reorient

- Stop schema expansion if the provider/product route cannot reliably select and populate the representative Inventory operations; compare a smaller or deferred catalogue instead of installing an arbitrary byte cap.
- Stop code-bearing construction if diagnostics cannot be correlated to the exact post-mutation definition.
- Stop automatic layout if it can silently move user-arranged content, escape effect accounting or change the document after the reported final hash.
- Stop tool renaming if retained sessions cannot continue under an accepted migration/reset policy.
- Stop bundle promotion if native identities cannot be copied or materialized coherently, one copy can change another, or URL obscurity is being used as accidental authorization.
- Stop Inventory acceptance for an inert, flattened, visually illegible, compiler-broken or operator-authored model.
- Stop simulation-scenario/metric work unless PM explicitly makes it part of the sophisticated-Petri-net objective.

## Deferred

- [After-demo construction and explanation evaluation](docs/mission-drafts/7-explainable-construction.md): broader semantic, behavioral, provenance and lifecycle evaluation after a useful worked model exists.
- [Mission 9](docs/mission-drafts/9-traceable-projection.md): repeat/change/retirement/concurrency breadth beyond the selected worked-model seam.
- [Mission 10](docs/mission-drafts/10-bounded-reviewer-revision.md): general reviewer authority and revision.
- [Mission 11](docs/mission-drafts/11-optimisation-handoff.md): consumer-accepted optimization handoff.
- [Future spine](MISSION.next.md): deployment, provider migration, assumption-based preview and unallocated product concerns not consumed here.

## Owner decisions

- **2026-09-11 — 7b/7c split.** Lu accepted the narrower 7b close-out and authorized this third FE-1573 PR for Inventory capability, compiler feedback, ELK layout, reliable why routing, tool topology and Postgres copies. Consumed by this cut.
- **2026-09-11 — scenarios out by default.** Petrinaut simulation scenarios and metrics are not part of the sophisticated-net objective unless PM later admits them.
- **2026-09-11 — first observation is the compiler/layout carrier.** Do not generate the full Inventory model, promote bundles, or rename tools until a dependency-affecting invalid dynamics batch reaches Brunch as a correlated compiler error, is repaired, and stays hash/effect coherent after ELK. Reached on this branch by `compiler-feedback.integration.ts`: dirty batch → correlated TS2304 → repair → clean → `applyAutoLayout` whose pre hash equals the repair's reported hash and whose post hash equals a fresh `getLatestNetDefinition`. Remaining proof-floor rows: frozen Inventory-derived fixture, dependency-change tests, ordinary why routing.
