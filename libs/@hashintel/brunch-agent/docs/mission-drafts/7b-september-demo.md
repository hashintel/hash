# Draft Mission 7b — Substantial worked-scenario demo

> Draft cluster only. Not execution authority. Convert into `MISSION.md` on the Mission 7b branch after Part A's UI closeout and branch boundary are settled. This recut replaces the earlier narrow interpretation of one scripted why/correction path. It is not wholesale promotion of the former evaluation campaign.

## Visible product advance

A product manager opens a substantial previously elicited scenario in Petrinaut Brunch and can explore its retained conversation, evolving workpiece and connected Petri net without developer protocol knowledge. They can inspect why consequential model content exists, follow its basis into the workpiece and source conversation, supply an ordinary correction, see the affected workpiece and net region change without unrelated rebuilding, inspect the updated explanation, and close/reopen the working session. If the demo claims an executable model, they can run a meaningful scenario whose behaviour reflects the account.

A rehearsed live path may show only a few interactions for time, but it must sample a broadly usable worked scenario rather than constitute the only supported path. The old Mission 6 crew-reservation fixture is a narrow engineering tracer and is not candidate demo content.

**Required companion recording:** retain a recording of Brunch carrying a realistic isolated persona from elicitation through visible workpiece evolution into actual native construction of a substantial connected model through the product UI. The recording may be edited or accelerated only with that treatment disclosed; its native conversation and construction records remain reconcilable. An operator-authored net, hidden tool coaching, or a hand-authored successful transcript does not satisfy this obligation.

**Previously missing:** a PM-usable scenario whose conversation, workpiece, model and explanations form one continuable product artifact, plus evidence that Brunch produced it. This is stronger than one prepared arc, one scripted explanation, or one mechanically successful correction. It does not by itself establish universal modelling quality, arbitrary Petrinaut parity, general multi-user revision or optimisation readiness.

## Demo shape heuristics

These ranges describe the intended substance and are review heuristics, not count-only acceptance gates. Falling below them requires evidence that the selected artifact still carries equivalent operational depth; meeting them does not compensate for incoherence or weak semantics.

### Retained conversation

- Approximately **15–25 substantive interview exchanges**, or roughly **30–50 visible user/assistant messages** excluding internal tool noise.
- The interview covers purpose and boundary, main flow, roles and resources, decisions and alternatives, quantities and timing, exceptions and recovery, uncertainty and unresolved material, and review of the account during construction.
- The history contains roughly **4–8 meaningful settled workpiece revisions**, rather than one prepared version and one scripted correction.
- Later turns deepen, qualify or correct earlier content. The retained history reads as a serious elicitation, not a single information dump or developer-steered tool protocol.

### Current workpiece

- Ordinarily around **2,000–4,000 words** of useful structured content for a scenario of the intended depth; word count is a warning signal, not an oracle.
- Covers objective and operating boundary; actors, roles, resources and external systems; main stages; entry/completion conditions; branches and decision rules; resource contention; timing, schedules, quantities, capacities and rates; exceptions, recovery and escalation; confirmed evidence versus modeller inference/assumption; unresolved questions; current net correspondence; and sources for consequential claims.
- Functions as a handoff-quality operational account rather than a transcript summary. It preserves uncertainty and does not claim that saved prose is automatically current net state.

### Petri net

For the flagship scenario, expect approximately **12–25 places, 10–20 transitions and 30–60 arcs**, with several meaningful types/state attributes and parameters, at least **2–3 scenarios or initial conditions**, resource contention, branching, an exception/delay/recovery path, and timing or stochastic behaviour where the account requires it. These are shape indicators, not quotas.

The model must be connected, legible and operationally meaningful. It must visibly exceed the retained Vestera probe's inert parameter/type/equation and the crew-reservation arc tracer. Use subnets/components if the selected model needs them to preserve meaning or screen legibility; do not flatten the model merely to avoid missing construction support.

For a Vestera-like production-scheduling flagship, likely content includes waiting work, line availability/state, cleardown and washdown, crew and shift constraints, material/stock readiness, qualification, staging, production start/completion, overtime-versus-delay decisions, unavailable-resource or late-start paths, and completion/release outcomes. The exact model follows elicited evidence rather than this illustrative inventory.

### Live interaction

A representative live exploration adds approximately **5–10 ordinary chat turns**:

1. Open the scenario and inspect its retained conversation, current workpiece and complete model.
2. Select or name a consequential model element and ask why it exists.
3. Follow the explanation into the workpiece passage and linked source messages, or see an honest absent/incomplete basis.
4. Ask about a different kind of element or assumption so the first answer is not a one-off.
5. Supply a correction in ordinary language; Brunch asks a clarification if material ambiguity remains.
6. Observe a new saved workpiece revision and bounded native model change with unrelated identities/content preserved.
7. Ask why again and distinguish original support from the later correction.
8. If executable behaviour is part of the agreed demo, run or compare a scenario affected by the account or correction.
9. Close/reopen and continue the same owned working session.

The presenter may rehearse one route, but ordinary rephrasing, follow-up, selection of another consequential element and inspection of another source must not immediately leave the supported product path. No IDs, hashes, citation offsets, tool names or hidden operator repair are required.

## Explanation obligations

For the selected flagship model, **every consequential visible element must have an inspectable recorded basis or explicitly report that its basis is absent or incomplete**. A few live examples are samples from a broadly explainable model, not the only elements for which why works.

Mechanical coverage for each consequential element is:

```text
visible model element
→ construction/change record
→ declared workpiece basis
→ workpiece passage
→ linked source messages where supplied
```

Petrinaut references do not propagate provenance. Defaults, derived effects, adjacency and plausible prose do not inherit testimony or intention. Missing links remain visible rather than reconstructed.

Human usefulness is reviewed across materially different classes: main-flow content, resource constraint, branch/decision, timing or dynamics choice, exception path, assumption or unsupported default, and the corrected element before and after correction. The answer must be understandable and credible, not merely return records. This targeted broad review restores utility as a demo-readiness obligation without requiring the entire former passage/lifecycle/adversarial campaign before the demo.

## Scenario catalogue and working copies

The PM-facing entrypoint is a database-backed scenario catalogue addressable by stable URLs such as:

```text
?scenario=vestera-production-scheduling
?scenario=data-centre-thermal-operations
```

The exact initial catalogue is an owner decision, but it is plural and includes at least one flagship artifact meeting the substantial worked-scenario bar. Diagnostic fixtures may remain available to tests or developers but are not presented as demo scenarios.

A scenario template is a coherent bundle, not only a Petrinaut document:

```text
scenario template
├── retained Brunch conversation
├── saved workpiece revisions
├── source/evidence relationships
├── construction and explanation history
├── Petrinaut document and scenarios
├── document/incarnation binding
└── stable scenario identity and content revision
```

After migrations and before readiness, startup idempotently updates approved templates in Postgres under stable scenario IDs. A new template definition replaces the catalogue entry for new opens without duplicating visible versions or modifying existing working sessions. Image build does not write a database.

Opening a scenario creates or resumes an independently owned working session. The template and other users' copies remain unchanged. The copy records its template origin/content revision and preserves coherent conversation, workpiece, evidence, transition and document identities through an explicitly inspected native contract—not blind string replacement, diagnostic-export import or model replay. Missing dependencies or collisions refuse without exposing a partially usable scenario.

The URL selects the scenario, not an arbitrary user identity. Local development may use the existing generated local principal. Hosted demo ownership uses the actual authenticated identity or an explicitly configured server-side demo principal; a caller-controlled `?user=` value is not authorization. Before implementation freezes, choose whether reopening `(owner, scenario)` resumes one stable working copy, creates a fresh copy, or exposes both **Resume** and **Start fresh**. PM experimentation requires at minimum a reliable resume path and a safe way to obtain a clean copy for rehearsal.

The existing `brunchDemoMode` toggle and `?brunch-fixture=crew-reservation-v1` route remain developer/test-fixture mechanisms. They are not the PM scenario catalogue and must not be stretched into it.

## Construction and persona throughline

```text
approved scenario/persona inputs
→ realistic isolated persona interview in the real Petrinaut Brunch UI
→ recurring visible saved workpiece revisions
→ Brunch constructs the substantial native model through browser-executed canonical operations
→ every consequential element records effects and declared basis
→ retained trajectory becomes an approved versioned scenario template
→ PM opens an independent working copy by stable scenario URL
→ ordinary why/source exploration
→ ordinary correction → workpiece revision → bounded net update
→ updated why and, if agreed, meaningful simulation
→ close/reopen and continue
```

The current persona launcher reliably drives elicitation and workpiece updates but explicitly refuses external browser construction while the persona is active. 7b must repair or replace that handoff within the maintained product path; ordinary operator-entered construction after the persona stops does not satisfy the required recording. Keep persona and operator submissions serial, preserve run-local isolation and never expose the private pack or expected model to Brunch.

The existing fourteen-operation catalog is departure evidence, not the selected model's completion checklist. Before implementation, freeze the flagship model's required operation classes and compare them with the product surface. Add or reshape the exact operations needed for the real construction path. Full stock Petrinaut parity remains unnecessary unless the demo claim explicitly becomes arbitrary-model construction.

## Scope allocation under demo pressure

### In 7b

- Database-backed plural scenario catalogue and stable `?scenario=...` entrypoints.
- Complete conversation/workpiece/evidence/net bundles and independently owned resumable or fresh working sessions.
- At least one flagship scenario meeting the substantial conversation, workpiece and model bar.
- Persona-driven visible construction of a substantial connected native model.
- Exact mutation/read/validation operations required by that model, including deletion or nested/component operations if the selected trajectory needs them.
- Broad mechanical why coverage for every consequential visible flagship element, with honest missing basis.
- Human usefulness review across the named explanation classes.
- Ordinary PM exploration, source inspection, one correction family, bounded model update, updated why and reopen/rehearsal.
- A scenario-specific timing/dynamics policy where the flagship account requires timing or uncertainty.
- One meaningful simulation if the agreed product claim calls the flagship executable or behavioural.

### Not automatically in 7b

- Every Petrinaut operation or arbitrary-model construction parity.
- General deletion, retirement or nested editing beyond the selected scenario's needs.
- A universal stochastic/dynamics strategy for every process family.
- Arbitrary unchanged-repeat/change/retirement semantics or multi-user concurrent editing.
- Every reviewer role, authority hierarchy, contradiction and coexistence class.
- The former full passage-edit/lifecycle/adversarial evaluation matrix or a population reliability claim.
- General optimisation support or an accepted Chris/Yannis handoff.
- Portable export or relocation beyond the database-backed template and working-copy path, generic identity-epoch breadth, or archive-lane hardening without observed history loss.

### Owner decisions before freezing the demo

- Exact flagship and additional catalogue scenarios.
- Required operation inventory and whether the model needs nested structure or deletion.
- Exact identity guarantees for template origin, independent working copies and the correction path; general retirement epochs remain Mission 9 scope unless the selected trajectory requires them.
- Whether the retained flagship history crosses compaction and therefore requires a forced-compaction/reopen proof; otherwise name the first later durability consumer.
- Whether portable export or relocation beyond the database-backed scenario path is part of the demo claim.
- Whether the live claim includes executable simulation and whether the correction must alter simulation results.
- Whether optimisation is shown at all.
- Whether Chris/Yannis participate as accepted consumers; if so, obtain their concrete input/output/question/execution/credibility contract rather than equating a UI action with handoff acceptance.
- Hosted versus local entrypoint, authenticated presenter/attendee posture, and Resume versus Start-fresh UX.
- Recording duration, editing/time-compression treatment and acceptable rehearsal reset.

If optimisation or accepted consumer handoff enters, explicitly recut the mission rather than letting it arrive as an implied consequence of constructing a model.

## Ownership and topology

- Core owns source-independent revision/source-link resolution, scenario-template identity contracts and workpiece tool semantics. Put tool implementations under `packages/core/src/tools/`; retain `src/flue.ts` as the mounting/composition surface.
- The SDCPN plugin owns net-target lookup, native operation selection, effect interpretation, formalism-specific explanation and the selected scenario's construction guidance. Do not move today's entire app `conversation/why.ts` unchanged into core.
- The app supplies authorized history, current state, browser context, catalogue/store startup and composition of owned capabilities. Avoid app-owned reusable explanation policy.
- The Petrinaut website owns workpiece/editor/source interaction and scenario selection. Petrinaut's reusable library stays free of Brunch-specific provenance and scenario semantics.
- Use Postgres for seeded catalogue/working-session delivery and SQLite for lightweight tests. Do not add a second conversation/provenance store, generic migration framework, universal claim ontology or parallel editor.

## Evidence and oracles

| Result | Oracle before claiming it |
| --- | --- |
| Substantial worked artifact exists | Lu reviews retained conversation, current workpiece and visible connected model against the shape heuristics and operational coherence; native history/definitions establish identities and effects. Counts alone cannot pass. |
| Persona carried elicitation into construction | Recording plus native user/assistant history and delivered browser results show recurring revisions and complete model construction through the visible product; no private pack, expected model or tool coaching reached Brunch. |
| Consequential elements are broadly explainable | Inventory every consequential visible flagship element and mechanically traverse its record/basis/passage/source or honest absence. Human review samples every named explanation class, including before/after correction. |
| Correction is a product operation | Freeze one ordinary correction family before rehearsal; compare workpiece revisions, actual native effects and untouched identities/content. Updated why distinguishes original support and correction. |
| Scenario URLs deliver usable independent sessions | Open the same stable scenario as two owners or two explicit fresh copies; continue each independently, leave template/other copy unchanged, reopen/resume, then update the template and prove old sessions retain their origin/content. |
| Model is executable, if claimed | Compile and run the selected scenario through native Petrinaut simulation; compare one qualitative result with a predeclared expectation and disclose unresolved assumptions. Parser success alone is insufficient. |
| Demo tolerates ordinary exploration | Lu varies wording, asks why about more than the rehearsed element, follows another source, closes/reopens and continues without IDs/tool vocabulary or developer repair. |
| Recording matches product state | Reconcile the played construction sequence and any disclosed edits/time compression with retained native conversation, workpiece revisions and model effects. |

Reuse Part A's source/binding/outcome, effect-accounting, correlation, Voice and no-replay contracts. Mechanical validity, semantic correspondence and explanation usefulness remain separate judgments. Do not add a runtime semantic completion engine or force every model generation through an evaluator taxonomy.

## Continuing constraints

- Carry Part A's all-authorized-source-ID discovery, revision-local passage limits, complete direct/derived effect accounting, honest absent basis, current/as-of distinction and outside-edit non-attribution.
- Preserve canonical Petrinaut schemas/actions/compiler/simulation ownership and visible failed, stale, no-op, unknown and refused outcomes. No mutation is admitted from a guessed base or silently replayed.
- Record inherited template evidence as inherited synthetic-persona, internal-human or customer-derived material, never testimony newly elicited from the current PM. Do not seed private packs, credentials, demo-owner secrets or unsupported attribution.
- Keep the isolated persona's natural improvisation, uncertainty and correction. Both persona and Brunch use the owner-selected model with explicit paid-run authorization; this draft itself starts no provider run.
- Construction-tool design remains a required discussion before implementation. Neither expanding the current allowlist nor introducing a batch/replacement tool is preselected.
- Remote writes, deployment, release and Linear updates remain separately authorized. Inspect actual frontend/backend/store revisions and authentication before claiming hosted readiness.

## Fog-line and stop conditions

Resolve the flagship/additional scenarios, construction-tool shape, template materialization/identity contract, PM source-navigation interaction, simulation/optimisation tier, hosted identity/copy semantics and recording expectations before freezing implementation. Use the first genuine substantial trajectory to pressure-test the ranges and adjust them by owner decision without reducing the visible product obligation.

Stop only the affected path for invalid source/effect attribution, canonical/runtime failure, incoherent template identity, unavailable required operation or a material unresolved owner decision. Do not substitute the crew-reservation tracer, an inert partial net, operator-authored construction or a one-off scripted explanation. Do not broaden from the selected substantial scenario into arbitrary parity, universal semantics or the entire after-demo evaluation portfolio without explicit scope authority.

## Cut and PR boundary

Use FE-1573 for both PRs under Lu's explicit split decision; proposed branch `ln/fe-1573-mission-7b`, based on the inspected Part A tip. Keep Part A's UI fix and FE-1645 integration before its merge. At the authorized branch transition, archive Part A with bounded engineering status, convert this draft into the sole live `MISSION.md`, return unselected items to the future spine and remove this consumed draft. Do not mark the former evaluation campaign passed, and do not preserve the superseded narrow scripted interpretation as competing authority.
