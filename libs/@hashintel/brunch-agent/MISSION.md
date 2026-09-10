# Mission 7b — Substantial worked-scenario demo

## Status

**Live on `ln/fe-1573-mission-7b`, cut from Mission 7a tip `2408b90bac` under Lu's explicit FE-1573 two-PR exception.** Mission 7a remains in [draft PR #9562](https://github.com/hashintel/hash/pull/9562); its pending CI/review/merge do not become acceptance through this cut. The archived Part A contract is [Mission 7a — workpiece, construction and explanation groundwork](docs/mission-archive/7a-workpiece-construction-explanation-groundwork.md).

This mission replaces the former narrow interpretation of one scripted why/correction path. It requires substantial PM-explorable scenarios and evidence that Brunch produced the flagship through the real product. The current implementation supplies bounded workpiece, mutation and why groundwork; ordinary Brunch still gates useful workpiece/construction behaviour behind fixture/tracer modes, the retained persona run is not a connected model, and no production scenario catalogue or persona-driven browser construction exists.

**Current throughline:** run one bounded real-provider/browser `mutate_petrinet` carrier comparison using `anthropic/claude-sonnet-4-6`, after the local probe established canonical ordered mechanics but not provider reliability or end-to-end speed. Lu authorizes Mission 7b development inference below USD 100 total per day; record actual request usage, do not multiply the allocation through delegation, and stop this probe after one valid comparison or the first material carrier failure. Production batch implementation, scenario seeding, remote write, release and Linear write remain unauthorized by this probe.

## Imperative

Deliver a product manager–usable Brunch experience around substantial worked process models rather than diagnostic fixtures: begin from scratch or open an independently owned seeded scenario containing its real conversation, evolving workpiece, evidence and connected Petrinaut model; explore why consequential model content exists; correct the account in ordinary language; observe bounded workpiece/net change and updated explanation; and reopen/continue. Retain a recording proving that Brunch carried a realistic isolated persona from elicitation through visible native construction of the flagship.

Match the Inventory purchasing baseline's subsystem and decision complexity without treating its exact node topology or counts as an answer key. Keep the chat as the interaction basis until the simultaneous chat/workpiece presentation is solved; do not expand into a generic question-card framework. Establish the fundamental conversation → workpiece → substantial model → provenance → correction path before the lower-priority constraint/experiment slice.

## Throughline

```text
Petrinaut create-new → Build with Brunch → careful elicitation or assumption-marked quick preview
or stable ?scenario=... → independently owned seeded working copy
→ realistic conversation in the existing chat basis
→ recurring settled workpiece revisions
→ bounded coherent native mutation chunks with complete indexed effects and declared basis
→ substantial connected model with scenario-appropriate dynamics
→ broad why/source exploration across consequential visible elements
→ ordinary correction → workpiece revision → bounded net update
→ updated why and, after the fundamental path, named constraints + executed experiment
→ close/reopen and continue
```

### Product entrypoints

- The live presentation opens a seeded worked scenario; the companion recording shows complete elicitation and construction.
- Petrinaut's create-new flow offers **Build with Brunch** or **Start blank**. Build with Brunch then offers careful elicitation or a provisional quick preview.
- Brunch is the default assistant. The existing user-controlled Petrinaut feature-toggle/Command-K affordance swaps to the legacy AI Assistant for team comparison; change that affordance minimally and do not invent another picker.
- The URL selects a scenario, not an arbitrary identity. Local development may use the existing generated principal. Hosted use requires actual authentication or an explicitly configured server-side demo principal; a caller-controlled `?user=` value is not authorization.
- Current `/agents/chat/:instanceId` routing remains through the demo. Future aliases/routes are deferred on any risk or doubt.

### Scenario catalogue and working copies

The PM-facing database-backed catalogue uses stable URLs such as:

```text
?scenario=inventory-purchasing
?scenario=<second-substantial-scenario>
```

The baseline set contains two substantial bundles. Inventory purchasing is the flagship and common capability baseline. Choose the contrasting second scenario only after the Inventory path reveals whether the dominant strain is replenishment/safety, continuous dynamics, or quality/recovery.

A scenario template is a coherent bundle, not only a Petrinaut document:

```text
scenario template
├── retained Brunch conversation
├── saved workpiece revisions
├── source/evidence relationships
├── construction and explanation history
├── Petrinaut document, scenarios and metrics
├── document/incarnation binding
└── stable scenario identity and content revision
```

After migrations and before readiness, startup idempotently updates approved templates in Postgres under stable IDs. New definitions affect new opens without duplicating visible catalogue entries or changing existing sessions. Opening a scenario creates or resumes an independently owned working copy; template and other copies remain unchanged. Preserve coherent conversation, workpiece, evidence, transition and document identities through an inspected native contract—not blind string replacement, diagnostic-export import or model replay. Provide reliable resume and a safe clean-copy/rehearsal route; decide the smallest UX after inspecting native copy identity.

The existing `brunchDemoMode` toggle and `?brunch-fixture=crew-reservation-v1` route remain developer/test mechanisms. The crew-reservation fixture and retained inert Vestera probe are not demo content.

### Workpiece and projection cadence

- Chat remains the primary interaction basis for this mission. The current AI / Workpiece tabs are Part A's departure surface; solve simultaneous workpiece/chat usability before designing sub-issues such as general question cards.
- Save the workpiece after meaningful new substance, correction or phase completion—not every acknowledgement and not only at the end.
- Begin net construction when a settled revision carries enough coherent material, then update incrementally from later settled revisions.
- Before consequential projection, Brunch may tell the user what it is about to update. Do not require users to request every projection manually.
- “Graph” in this mission means the Petrinaut model, not a new HASH requirements graph. A user-visible semantic model-diff surface is deferred; retain structural effects and provenance without inventing a graph-diff UI.

### Quick preview

When time is tight or a user wants a preview, Brunch offers to fill gaps and proceeds only after assent. It may update the working workpiece and net immediately, but every model-supplied assumption remains visibly provisional, editable and attributed to the model rather than the interviewee. It may propose candidate safety thresholds, objectives and consequential policy choices, but those remain unresolved until the user adopts them. Preview usefulness depends on the same construction/provenance path working quickly and honestly; it is not a bypass around broken construction.

### Current throughline — bounded mutation probe

The proposed `mutate_petrinet` client tool carries bounded coherent chunks of approximately 20–30 operations or 64 KiB of arguments, subject to provider evidence. Inventory topology arithmetic now suggests about 403 operations including metrics, or roughly 14–17 initial chunks, rather than hundreds of provider/browser settlement cycles. This remains an estimate, not a performance claim.

Accepted candidate semantics for the probe:

- Petrinaut Core derives and owns the canonical mutation discriminated union, parser/schema, ordered executor and complete structural effect vocabulary. Brunch does not copy the mutation ledger or schemas.
- Brunch owns workpiece-basis declarations, conversation/browser binding, model-facing policy and chunk limits. The browser owns bound execution and independent observations.
- Operations execute sequentially. Each canonical mutation is individually committed; the chunk is not a transaction.
- A successful prefix remains committed. The first failed or unknown operation stops execution; every later operation is retained and explicitly `unattempted`.
- Unattempted work can re-enter a corrected continuation after a fresh verified net read. Preserve one logical operation identity and distinct execution-attempt identities.
- Automatic retry is limited to a transient failure proven to occur before mutation, or a known non-applied attempt with a verified unchanged hash and stable idempotency identity. Bound it to three attempts with backoff. Schema/semantic refusal, no-op, changed state, compilation failure, partial effect or unknown outcome never retries automatically.
- Several operations may cite a de-duplicated basis declaration, but every operation carries an explicit `basisId`.
- Code-bearing operations use explicit compilation barriers after coherent related groups. A failed checkpoint leaves the truthful committed prefix and later operations unattempted.
- Preserve individual mutation implementations/tests during rollout; expose only one mutation interface to the model in a given mode.
- Return compact indexed outcomes, pre/post hashes, canonical effects and a durable ledger receipt. Retain exact requests, attempts, observations, bases and complete effects durably; load details by targeted/paginated read rather than returning repeated full documents.
- Core structurally derives the current full 41-operation registry; production admission begins with the proven operation classes needed by the two scenarios. Registry presence is not a parity claim.

The completed local probe exercised a 26-operation canonical loop and a 25-operation generated carrier. Ordered and individual callbacks produced the same final hash; intra-chunk IDs resolved; a deterministic no-op, readonly no-ops, extension sanitization, exact committed prefix and explicit unattempted suffix were observed. Local outcome accounting averaged 2.240 ms versus 2.068 ms for individual callbacks, so the mechanism itself was 8.3% slower and the expected settlement-latency saving remains unproved. The 25-operation payload was 5,330 bytes / about 1,545 tokens, while the full 41-operation schema was 69,897 compact bytes / about 16,581 tokens and exceeded the provisional 64 KiB threshold. Transport correlation accepted one outer result and rejected changed replay content, but this probe did not independently prove a universal two-browser-call refusal. Native artifacts remain under `/tmp/m7b-batch-spike-{mechanics,carrier}` and are disposable.

The next probe folds browser and provider questions into one bounded comparison. Expose only the Inventory chunk's selected operation classes, not the full 41-operation schema. Through the real Brunch → browser → Petrinaut → correlated-result path, compare one coherent 20–30-operation batch with the equivalent current individual-operation route; record schema/input validity, repairs, request count, elapsed time, actual usage, final document equivalence, partial outcomes and one compilation checkpoint. Stop after one valid comparison or the first material carrier failure. A provisional 5× improvement is a strain detector, not a sacred benchmark. This probe cannot establish production transition-ledger completeness, whole-batch atomicity or broad provider reliability.

## Proof

### Visible completion

A representative live exploration adds approximately **5–10 ordinary chat turns**; the presenter may rehearse one route, but those turns sample a broadly usable artifact rather than define its only supported path.

A PM who did not watch development can:

1. Open either stable scenario URL and obtain an owned working copy with retained conversation, revisions, current workpiece and connected model.
2. Explore the Inventory flagship without developer vocabulary; ordinary rephrasing, follow-up and selection beyond one rehearsed element remain on the supported path.
3. Ask why about different consequential element classes and follow model → change → workpiece → source, or see an honest absent/incomplete basis.
4. Supply an ordinary correction, answer a clarification if material ambiguity remains, and observe a new workpiece revision plus the bounded relevant model update with unrelated identities/content preserved.
5. Ask why again and distinguish original support from the correction.
6. Close/reopen and continue the same copy; obtain a safe fresh copy without modifying the template or another copy.
7. Start a new net with Brunch and choose careful elicitation or quick preview.
8. After the fundamental path is dependable and Chris supplies the necessary procedure/API, define reusable named constraints, create an experiment, execute it and report whether constraints held. If this slice cannot be completed without displacing the fundamentals, retain it as the next required 7b slice rather than representing prose-only constraints as completion.
9. Watch a retained recording whose persona conversation, recurring workpiece revisions and substantial visible construction reconcile with native product records.

### Shape and quality heuristics

The ranges below expose undersized work; counts alone cannot pass, and a smaller artifact may pass only when it preserves comparable subsystem and decision complexity.

- Approximately **15–25 substantive interview exchanges** or **30–50 visible user/assistant messages**, excluding tool noise.
- Roughly **4–8 meaningful settled workpiece revisions** whose later versions deepen, qualify or correct prior material.
- Ordinarily **2,000–4,000 words** of handoff-quality current workpiece covering objective/boundary; actors/resources/systems; main stages and conditions; decisions/branches; contention; timing/schedules/quantities/rates; exceptions/recovery/escalation; evidence versus inference/assumption; unresolved questions; correspondence; and sources.
- Inventory purchasing establishes the capability scale: **38 places, 45 transitions, 189 arcs, 9 types, 9 differential equations, 58 parameters, 45 metrics and 10 scenarios**, with procurement, supplier disruption, transit, quality/quarantine, expiry/recall, production, customer demand, continuous stochastic demand/prices, policy controls and safety/performance requirements. Brunch need not reproduce its topology byte-for-byte, but must not erase these consequential subsystem interactions to appear smaller or complete.
- The flagship is connected, legible, operationally meaningful and scenario-appropriate. Use subnets/components when meaning or screen legibility requires them rather than flattening around missing support.

### Explanation readiness

Every consequential visible flagship element has an inspectable recorded basis or explicitly reports absent/incomplete basis:

```text
visible model element
→ construction/change record
→ declared workpiece basis
→ workpiece passage
→ linked source messages where supplied
```

Inventory the consequential visible elements and mechanically traverse each path. Human usefulness review samples main flow, resource constraint, branch/decision, timing/dynamics, exception, assumption/unsupported default, and the corrected element before/after correction. Answers must be understandable and credible, not merely return records. Broader cross-scenario reliability and the former passage/lifecycle/adversarial campaign remain deferred; that deferral cannot excuse a thin flagship.

### Oracle table

| Result | Oracle before claiming it |
| --- | --- |
| Batch premise is worth implementing | Local mechanics already establish ordering, partial outcomes and equivalence. The bounded real-provider/browser comparison must establish selected-schema following, correlated product-path execution and material end-to-end latency/reliability improvement. Failure returns to the construction design discussion without production batch code. |
| Substantial flagship exists | Lu reviews retained conversation, current workpiece and visible connected model against operational coherence and the Inventory capability baseline; native history/definitions establish identities/effects. |
| Persona carried elicitation into construction | Recording plus native history and delivered browser results show recurring revisions and complete visible construction; no private pack, expected model or hidden tool coaching reached Brunch. |
| Consequential elements are broadly explainable | Complete flagship inventory mechanically resolves record/basis/passage/source or honest absence; human review covers every named explanation class. |
| Correction is a product operation | Freeze one ordinary correction family before rehearsal; compare revisions, actual native effects and untouched identities/content; updated why distinguishes original support and correction. |
| Scenario URLs deliver independent sessions | Open one stable template as two owners/copies, continue independently, leave source/other copy unchanged, reopen/resume, then update the template and prove old sessions retain origin/content. |
| Start from scratch works | Through Petrinaut's actual create-new flow choose Build with Brunch, choose careful or preview posture, save a workpiece and construct visible native content without fixture query parameters. |
| Constraints/experiments work, when reached | Create named reusable constraints and an experiment through accepted Petrinaut APIs, execute it, inspect results and report constraint status; workpiece prose alone cannot pass. |
| Demo tolerates exploration | Lu varies wording, asks why beyond the rehearsed element, follows another source, corrects, closes/reopens and continues without IDs/tool vocabulary or developer repair. |
| Recording matches product state | Reconcile the played sequence and disclosed editing/time compression with retained conversation, workpiece revisions and model effects. |

## Constraints

### Scope posture: primary obligations and strains

The mission is bounded by visible product utility, not by pretending the route is equally secure everywhere. “Primary” means required for the product claim; “strain” names a current weak premise or expensive join whose next discriminator is explicit.

| Area | Posture now | Strain / next discriminator |
| --- | --- | --- |
| Conversation → workpiece → model → why | Primary; consumes Part A's bounded contracts | Ordinary Brunch still exposes docs-only browser behaviour and gates the useful surface behind tracer mode; first ordinary create/open path must cross it. |
| Inventory-comparable flagship | Primary; subsystem/decision complexity, not exact counts | Current genuine run is inert and current persona cases are bounded incidents. A realistic trajectory must produce a connected model without operator construction. |
| Two seeded substantial scenarios | Primary | No production seeder/catalogue/copy contract exists; second scenario waits on Inventory's dominant observed strain. |
| Independent working copies | Primary | Native selective clone/import is absent; preserve identities through an inspected contract rather than private-format optimism. |
| Broad flagship why coverage | Primary | Supplied links are optional and no automatic completeness exists; inventory every consequential element and review representative usefulness. |
| One ordinary correction/reopen | Primary | General repeat/change/retirement/concurrency remains later; the selected correction must still avoid unrelated rebuilding. |
| Start from scratch | Primary; recorded path even though live demo starts seeded | FE-1331's older topology is stale and no product create-new Brunch choice exists. |
| Mutation batching | Candidate enabler for primary construction speed; local ordered mechanics passed | Full-registry schema is 69,897 bytes and local batching adds 8.3% accounting overhead. Selected-schema provider reliability, real settlement speed, aggregate transition ledger, complete effects, compilation checkpoints and partial-state UX remain unproved; run one bounded real comparison. |
| Quick preview | Primary interaction posture after assent | Depends on fast reliable construction and honest model-proposed assumptions; cannot bypass a failing fundamental path. |
| Chat/workpiece UI | Chat remains the basis | Simultaneous visibility is unresolved. Defer generic question cards and other chat sub-issues until that parent layout problem is observed and selected. |
| Constraints + executed experiments | Ordered lower-priority 7b requirement | Canonical constraints exist only in optimization manifests, are not reusable with scenarios/experiments and are not enforced; await Chris's proposed API/procedure before designing past this boundary. |
| Dynamics/simulation | Required where the flagship account/executable claim needs it | Part A's clock is not a strategy; derive a scenario-specific policy from the selected model and actual Petrinaut contracts. |
| Model diff | Deferred | Current effects are structural records, not a semantic/user-visible model diff. Do not build a graph-diff UI in this mission. |
| Assistant replacement | Brunch default; legacy user-swappable through existing feature-toggle/Command-K affordance | Current environment switch is not the agreed product flag. Modify existing settings minimally; keep histories separate and the document shared. |
| API route naming | Deferred until after demo | Alias only after a future bounded probe proves no ownership/client/store/deployment risk. |
| OpenAI migration | Deferred until after 7b; not a blocker | Move Brunch first; persona may remain Anthropic to preserve evaluation diversity. |
| Optimisation / Chris-Yannis handoff | Deferred unless Lu explicitly recuts the endpoint | Optimization-run API exists, but no accepted consumer contract; constraint/experiment work does not imply handoff acceptance. |

### Earned data and execution contracts

- Flue history remains canonical conversation history; the workpiece owns semantic synthesis; Petrinaut owns canonical model schemas, actions, compilation and simulation. No second transcript/provenance store or copied model catalog.
- Preserve one current revision with native tool-call ID, Markdown/hash and ordinal. A saved revision is not owner-approved meaning or automatically current model state.
- Preserve every authorized true-user source ID after folding; source text may be clipped but IDs are not windowed. Prepared, assistant, signal and foreign material is not elicited testimony.
- Keep workpiece evidence, declared operation basis, actual effects and model references distinct. Net connectivity does not transmit provenance; defaults and derived effects do not inherit intent automatically.
- Browser edits bind conversation/document/incarnation and a verified prior full read. Stale, duplicate, retired, no-op, failed, unknown and refused outcomes remain explicit; never replay an unknown admitted mutation.
- Outside edits are not attributed to Brunch. Why uses verified live observation or explicit as-of scope, never a historical call ID alone.
- Preserve canonical complete direct/derived effect accounting, stock-assistant isolation, active Stop, Voice results and existing package/publication obligations.
- The persona's pack grounds a realistic role and stays private. Persona and operator submissions remain serial. Natural improvisation, uncertainty and correction are allowed; the expected net and construction instructions never reach Brunch.

### Ownership

- Core owns source-independent revision/source resolution, workpiece tools and generic scenario-template identity contracts.
- Petrinaut Core owns canonical mutation schemas/actions and any generic ordered batch executor/effect vocabulary.
- The SDCPN plugin owns formalism-specific operation selection, target lookup, effect interpretation, construction guidance and why semantics.
- The app supplies authorized history, current browser state, catalogue/store startup and composition.
- The Petrinaut website owns editor/workpiece/source/scenario integration. Reusable Petrinaut stays free of Brunch provenance semantics.
- Use Postgres for the production catalogue/working-session path and SQLite for lightweight tests. Do not add a general migration framework, universal claim ontology, parallel editor or second state graph.

### Owner decisions

- **2026-09-10 — Substantial demo correction.** The 7a/7b split does not demote the product to one scripted explanation. The flagship must be PM-explorable, Inventory-comparable in subsystem/decision complexity and broadly explainable.
- **2026-09-10 — Baseline catalogue.** Seed two substantial scenarios. Inventory purchasing is the common flagship/capability baseline; select the contrasting second scenario after the first path exposes its dominant strain.
- **2026-09-10 — Entry and UI.** Live demo starts seeded; start-from-scratch remains required through Build with Brunch → careful/preview. Chat remains the interaction basis. Solve simultaneous chat/workpiece display before question-card subdesign.
- **2026-09-10 — Preview and cadence.** Brunch offers an assumption-marked preview after assent and does not silently adopt safety/objective/policy choices. Save workpiece at meaningful boundaries and project incrementally from settled revisions.
- **2026-09-10 — Assistant and model.** Brunch is default; the team can swap to legacy through Petrinaut's existing user-controlled toggle/Command-K affordance. OpenAI migration follows 7b and is not its blocker.
- **2026-09-10 — Lower-priority joins.** Constraints plus executed experiments follow the fundamental path and await Chris's proposed API/procedure. Semantic model diff and route aliases are deferred; any doubt keeps route work after demo.
- **2026-09-10 — Ordered mutation probe.** The local probe partially validates the bounded Core-owned ordered-stop batch: canonical mechanics/equivalence/partial outcomes pass; local latency, full-schema size and provider/browser evidence do not. Correct the registry count from 35 to 41. Proceed with one bounded real Sonnet/browser comparison using only selected Inventory operation classes, folding the former separate browser and provider probes together. Development inference below USD 100 total per day is owner-authorized; retain actual usage and stop at one valid comparison or first material carrier failure. Re-grill before production implementation.

## Fog-line

- **Batch carrier and value:** local canonical mechanics pass, but the full schema exceeds 64 KiB and local outcome accounting is slower. Selected-schema Sonnet array reliability, real browser settlement latency and aggregate effect/transition recording remain unproved. The bounded real comparison is the next observation; do not design production batching past its result.
- **Flagship construction:** no evidence yet shows Brunch can produce Inventory-comparable complexity or a complete substantial model from a realistic persona. The first successful carrier does not establish semantic/model quality.
- **Second scenario:** select after Inventory reveals whether the important contrast is replenishment/safety, continuous dynamics, or quality/recovery.
- **Template materialization:** native identity/copy support, hosted ownership, resume/fresh UX and catalogue update safety require inspection at the actual store/browser boundary.
- **Simultaneous chat/workpiece presentation:** Part A tabs conserve space but do not settle side-by-side use. Observe PM work before selecting layout or card sub-issues.
- **Constraints/experiments:** Chris's API/procedure and the reusable placement/enforcement contract do not yet exist. Do not invent them from current optimization-manifest placement.
- **Dynamics/execution:** the exact flagship model determines required stochastic/dynamics policy, simulation claim and compilation barriers.
- **Delivery:** actual hosted frontend/backend/store revisions, authentication, attendee posture and recording duration/editing expectations remain to inspect or decide.

## Stop or reorient

- Stop the batch path if the provider cannot reliably produce representative bounded arrays, canonical schemas require copying, partial outcomes cannot be independently reconciled, effect accounting is incomplete for selected operations, or latency improvement is marginal. Return to the construction design discussion rather than fortifying the hypothesis.
- Stop a mutation chunk on the first failed/unknown operation or failed compilation barrier; retain the prefix and every unattempted intent. Never retry unknown or partially applied work automatically.
- Stop scenario promotion if conversation, workpiece, provenance and model identities cannot be copied coherently or one working copy changes the template/another copy.
- Stop flagship acceptance for an inert/diagnostic/flattened net, operator-authored construction, hidden expected-model/tool coaching, prose-only lineage, one-off scripted why, or counts without operational correspondence.
- Stop quick preview when assumptions cannot be distinguished from testimony or consequential safety/objective/policy choices become silently adopted.
- Stop lower-priority constraint/experiment, UI-card, route, model-provider or optimization work when it displaces the fundamental substantial-scenario path or lacks its named prerequisite.
- Preserve and report source/identity corruption, false attribution, unavailable canonical state and unknown outcomes; fluency never overrides them.

## Deferred

- [Mission 9](docs/mission-drafts/9-traceable-projection.md): general unchanged-repeat, changed-input, retirement, concurrency and broader schema/scenario breadth beyond the two selected 7b artifacts.
- [Mission 10](docs/mission-drafts/10-bounded-reviewer-revision.md): general reviewer authority, qualification, coexistence, conflict, refusal and impact widening beyond the chosen ordinary correction.
- [Mission 11](docs/mission-drafts/11-optimisation-handoff.md): general optimisation and accepted Chris/Yannis consumer handoff; enter only by explicit owner recut.
- [After-demo evaluation](docs/mission-drafts/7-explainable-construction.md): cross-scenario semantic/behavioural reliability, expanded passage/adversarial/lifecycle matrices and population claims. It cannot be cited to weaken flagship readiness.
- [Future spine](MISSION.next.md): user-visible semantic model diff, route migration/aliases, OpenAI migration, generic question-card/dashboard work, broader sources/plugins, surprising-scenario generation, create-new breadth beyond the selected flow and remaining backlog.
