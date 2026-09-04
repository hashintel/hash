# Draft Mission 7 — Construct and explain one real net region from a genuine conversation

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

This draft is written at cut-level detail so that conversion into a live `MISSION.md` is a re-evaluation rather than a rewrite; the [cut conversion map](#cut-conversion-map) at the end names which section becomes which live address. It was recut on 2026-09-04 from the former "capture-backed review of an honest prebuilt pair" after two independent reviews of the provenance design; the reasoning is in the [decision log](../evidence/design/provenance-and-tooling-decision-log-2026-09-04.md) (sections C, F, G), the [mini spec](../evidence/design/provenance-by-lineage-mini-spec-2026-09-04.md), the [independent review](../evidence/design/provenance-by-lineage-independent-review-2026-09-04.md), and the [follow-up review](../evidence/design/provenance-by-lineage-follow-up-review-2026-09-04.md). Where this draft cites an entry such as G7, that entry is the surviving rationale.

## Cold-start reads

Tracker: [FE-1573](https://linear.app/hash/issue/FE-1573/explain-one-prepared-petrinaut-net-from-exact-conversation-evidence) is the tracker projection for this future branch mission and advances the stakeholder outcome [FE-1478](https://linear.app/hash/issue/FE-1478/provide-provenance-from-a-generated-net-back-to-the-requirements-graph) without rewriting that record. Its current title and description describe the superseded prepared-pair cut and must be re-titled with owner approval before this draft is cut; FE-1478's "requirements graph" and "captured assertions" wording remains the stakeholder's, satisfied here by declared basis over settled workpiece revisions rather than by a graph.

A fresh builder must resolve these authorities and this terrain before implementing anything:

- [`../../MISSION.md`](../../MISSION.md) — the current branch's live authority (Mission 6 at the time of writing). Mission 7 stacks on Mission 6's accepted archive and on Mission 5's landed browser Flue transport. Mission 6's constraint that construction tools stay out of ordinary conversations is amended by this cut, not silently.
- [`../../MISSION.next.md`](../../MISSION.next.md) — compact spine, FE-1476 product frame, cross-mission obligations, standing locks, the 2026-09-04 planning migration matrix, and later evidence admitted after this draft.
- [`README.md`](README.md) — draft authority, lifecycle, and conversion rules.
- The four design-evidence documents named above. Design evidence, not authority; every settled item becomes authority only when written into the cut `MISSION.md`.
- [`../mission-archive/2-mechanical-capture-sweep.md`](../mission-archive/2-mechanical-capture-sweep.md) — the accepted mechanical capture throughline. Historical: capture envelopes and sweep semantics are rejected for this mission's provenance (G20); the session-log archive lane in `binding-flue` is a separate existing capability.
- [`../mission-archive/3-structurally-typed-runbook-to-headless-pn.md`](../mission-archive/3-structurally-typed-runbook-to-headless-pn.md) and [`../evidence/implementations/fe-1525-headless-runbook-pn.md`](../evidence/implementations/fe-1525-headless-runbook-pn.md) — accepted workpiece leg, falsified provider-visible nested-schema construction (0 for 9 on `addType.elements`), and the vacuous empty-net warning. This mission retires that blocker.
- [`../mission-archive/4-core-plugin-elicitation-proof-of-life.md`](../mission-archive/4-core-plugin-elicitation-proof-of-life.md) — the accepted core/plugin/app split and interaction decisions this mission composes within.
- [`../evidence/implementations/fe-1575-resumable-workpiece-petrinaut.md`](../evidence/implementations/fe-1575-resumable-workpiece-petrinaut.md) and the r2 outer witness beside it — Mission 6's viability proof of transport, least mutation, settled manifest, and two-tab resume, and its honest admissions: the prepared fixture's "Current Petrinaut correspondence" section was fixture-authored (A3), and the fenced-block workpiece source is a Mission 6 contract this mission replaces (A4). The Mission 6 fixture is not promoted into this mission's pair.
- [`../evidence/implementations/mission-5-direct-voice-flue/README.md`](../evidence/implementations/mission-5-direct-voice-flue/README.md) — the browser Flue `ChatTransport` at `/agents/chat/:instanceId`, client-tool-result correlation, and admission timing this mission consumes.
- [`../../packages/core/src/workpiece.ts`](../../packages/core/src/workpiece.ts) — the current resolver: tagged prepared signal or latest fenced `runbook-ir` block, identified by message id plus SHA-256. Replaced for model-produced revisions by `update_workpiece`; retained for the tagged prepared route.
- [`../../packages/core/src/flue.ts`](../../packages/core/src/flue.ts) and [`../../packages/core/src/client-tools.ts`](../../packages/core/src/client-tools.ts) — core owns no model-facing tool today and states the rule for adding one; the `ask` and `sweep` names here are orphans this mission retires.
- [`../../packages/plugin-sdcpn/src/flue.ts`](../../packages/plugin-sdcpn/src/flue.ts), [`../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts`](../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts), and [`../../packages/plugin-sdcpn/test/construction-tools.test.ts`](../../packages/plugin-sdcpn/test/construction-tools.test.ts) — the tool factory with the falsified carrier (`v.looseObject({})` plus `rawTransform` and the JSON Schema pasted into the description), the headless-only and fixture-only mounting modes, and the six-tool and two-tool subsets this mission retires as product surfaces.
- [`../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md`](../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md), [`templates/workpiece.md`](../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/templates/workpiece.md), [`references/pn-construction.md`](../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/references/pn-construction.md), and [`references/checks.md`](../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/references/checks.md) — current teaching: concepts, the fenced-block emission rule, and Construction notes. This mission adds construction posture and the settled-revision and basis discipline.
- [`../../packages/binding-flue/src/history-reader.ts`](../../packages/binding-flue/src/history-reader.ts) and [`../../packages/transport-aisdk/src/client-tool-history.ts`](../../packages/transport-aisdk/src/client-tool-history.ts) — how history is acquired in-process with host-owned URL and transport, and how client-tool results are projected today (opaque correlated outputs, no effect semantics).
- [`apps/brunch-agent/src/agents/chat-agent/agent.ts`](../../../../../apps/brunch-agent/src/agents/chat-agent/agent.ts), [`src/conversation/identity.ts`](../../../../../apps/brunch-agent/src/conversation/identity.ts), [`src/http/ownership.ts`](../../../../../apps/brunch-agent/src/http/ownership.ts), and [`src/capture/apply-sweep.ts`](../../../../../apps/brunch-agent/src/capture/apply-sweep.ts) — composition, the principal key and conversation id that are the only identity the system carries, and the in-process fetch pattern the why lookups reuse.
- [`apps/brunch-agent/.pi/extensions/brunch-persona-testing/README.md`](../../../../../apps/brunch-agent/.pi/extensions/brunch-persona-testing/README.md) and [`src/evaluations/persona/brunch-turn.ts`](../../../../../apps/brunch-agent/src/evaluations/persona/brunch-turn.ts) — the persona harness: `--brunch-tool-host` (`none`, `mock`, `real-headless`), `--brunch-tool-mocks`, `--brunch-evidence-dir` retaining `snapshot.json` and projections per settled read, turn budget in the launch prompt only.
- [`../../evaluations/README.md`](../../evaluations/README.md), [`../../evaluations/cases/`](../../evaluations/cases/), and [`../../evaluations/oracles/`](../../evaluations/oracles/) — six persona cases with hidden truth ledgers, and the frozen protocols not to rerun.
- [`../../../petrinaut-core/src/ai.ts`](../../../petrinaut-core/src/ai.ts), [`action-schemas.ts`](../../../petrinaut-core/src/action-schemas.ts), [`command-schemas.ts`](../../../petrinaut-core/src/command-schemas.ts), [`schemas/entity-schemas.ts`](../../../petrinaut-core/src/schemas/entity-schemas.ts), [`schemas/metric-schema.ts`](../../../petrinaut-core/src/schemas/metric-schema.ts), and [`file-format/types.ts`](../../../petrinaut-core/src/file-format/types.ts) — canonical AI tool bundle, mutation and command schemas, strict entity objects with no metadata slot, and the file wrapper (`version`, document arrays, `title`, optional generator `meta`) with no provenance field. Authority; never copied.
- [`../../../petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx`](../../../petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx) and [`../../../petrinaut/docs/ai-assistant.md`](../../../petrinaut/docs/ai-assistant.md) — the host execution boundary and the user guide that must change with any user-visible behaviour.
- [`../specs/petrinaut-batched-construction-tools.md`](../specs/petrinaut-batched-construction-tools.md) — candidate `pn_read`/`pn_edit` input; observation O2 (the Mission 3 failure is a carrier failure, not a granularity failure) is load-bearing here; batching itself is Mission 9's decision unless this mission's scenario forces it.
- [`../reference/architecture/flue-routing.md`](../reference/architecture/flue-routing.md) — per-conversation versus cross-conversation state, `usePersistentState`, signals, and the upgrade pins.
- Installed Flue 2.0.3 reference under `node_modules/@flue/runtime/docs/reference/`: `agent-api.md` (tool `run` contract: a multi-tool batch ends the turn only when every result terminates; `ToolContext.toolCallId`), `agent-hooks-api.md` ("Rendering and the rules of hooks": hooks only at render, setters only in callbacks), and `guide/models.md` (compaction folds older history into a summary, default 8000 recent tokens verbatim). These settle G1, G2, and F2 and motivate the compaction probe.
- Commit `157730cc5a214dd9c543e8d95c7193a219c48aef` on `ln/fe-1569-brunch-agent-deployment`, especially `docs/evidence/implementations/mission-8-deployment-handoff.md` — locally verified application contract; no remote deployment. This mission names local posture.

## Visible product advance

**Release note:** talk to Brunch about a process and watch it build that part of the net; then ask why any element exists and see the workpiece passage the constructor declared as its basis, the conversation behind it, and which recorded step did what, or an explicit refusal.

**Demo script (no engineer present):** with the local Brunch and Petrinaut stack running, open the demo conversation and its net in the Petrinaut Brunch panel. The workpiece pane shows the current revision, the revision list, and a diff between any two. Scroll the conversation: a real interview, labelled with its source (synthetic persona, internal human, or customer-derived), in which Brunch elicited the process, revised the workpiece as it went, and then built the region you see. Pick any element in the net and type its name or id. Read the passage Brunch declared as that element's basis, the revision it came from, the conversation lines or turns behind that passage, and the recorded steps: which assistant tool call requested it, which browser step applied it. Pick the element the demo marks as changed by hand and watch Brunch say it cannot attribute the current state. Pick the element marked as built without a declared basis and watch Brunch say so rather than improvise.

**Previously impossible:** Brunch had never built a net region inside a real conversation, only from a prepared fixture or a headless harness, and nothing connected any element to what was said.

**Completion:** the mission is done when a product manager can run that script for the proving scenario and every readiness-gate obligation below is closed, including the safety and utility gates for the why operation. The first green pass through the adversarial tracer and the first real constructed region are internal milestones.

**Scope history.** On 2026-09-03 the one-element explainability cut was judged too small under the product-manager litmus and expanded to a whole prepared net. On 2026-09-04 the prepared pair and its hand-authored derivation fixture were rejected as fixture-rigging and useless respectively (A3, B4), and the owner consolidated construction and explanation into this mission rather than splitting a thin visible-workpiece mission first, to resist the regression to thin tracers and to build fully connected parts with real test beds (F12). The follow-up review then established that this mission must close the readiness of its own claim and may move only breadth to Mission 9 (G16). Reversal condition: if the adversarial tracer shows the model cannot construct with a usable declared basis under any revised interaction, the explainability release is withheld and construction stands on its own gates (decision table below).

## Contract stratum

Close the **construction-and-explanation stratum for one genuine conversation, one proving scenario, and one document incarnation**. Its objects and minimum seams:

- **Settled workpiece revisions**: `update_workpiece` tool calls with revision id, SHA-256, and Markdown persisted in per-conversation state; the fenced-block route retired for model-produced revisions; the tagged prepared signal retained only for test-authored material.
- **Declared basis** on every mutation request: `declared { revisionId, sha256, locators, rationale, scope }` or `absent { reason }`, operation-level unless an intended-effect mapping names elements (G7).
- **Optional revision-time evidence relation** on `update_workpiece`: `evidence: [{ locator, messageIds, kind }]`, kind in elicited, inference, default, formalism-constraint, external, correction; carried forward unchanged passages inherit their relation (G3).
- **Mutation transition records**: requested base hash, observed pre-apply hash, post hash, outcome, disjoint derived effects, diff accounting, one authoritative result per call, conflicting duplicates to unknown (G9).
- **Identity epochs**: ids never reused; delete and recreate opens a new epoch; origin, current state, change history, attempt history are distinct query semantics (G8).
- **Passage identity policy** and its probe (G11).
- **Document reconciliation**: one conversation bound to one document incarnation; every why answer reconciles against the live hash or labels its staleness; external import records without laundering (G4, G5, G10).
- **Recorded roles**: assistant tool call, local browser executor, user under principal key, test-authored fixture author; human identity unknown; time is stream order (G6).
- **Scenario-selected tool admission with canonically derived schemas** over a repaired carrier (G15).
- **Consequential inventory** with one disposition per item and published numerator, denominator, and exclusions (G13).
- **Safety and utility gates** for the why operation (G14).
- **Runtime migration matrix** with a removal gate for any dual-read bridge (F15).

Outside this stratum and owned by Mission 9 with re-entry gates: unchanged repeat, changed input, deletion and retirement beyond the single negative case exercised here, concurrent user change beyond the single hand edit, cross-conversation document access and a document-scoped lineage owner, schema classes beyond the proving scenario, and the per-action versus batch decision.

## Boundary crossings and current throughline hypothesis

```text
persona or human conversation in the Petrinaut Brunch panel (or the persona harness against the production agent)
  → Mission 5 browser Flue ChatTransport → /agents/chat/:instanceId → ChatAgent
  → agent revises the workpiece: update_workpiece { markdown, evidence? } settles; state holds { revisionId, sha256, revision, markdown }
  → workpiece pane shows the revision; chat shows a one-line marker
  → next render exposes the settled revision; agent reads the live definition via getLatestNetDefinition
  → agent requests one mutation at a time citing { revisionId, sha256 } with declared basis; the turn terminates on the browser tool
  → Petrinaut panel: observes pre-apply hash, validates canonical input, applies, derives effects, returns one transition record
  → client-tool-result signal resumes the conversation; the agent reconciles effects against intent; unanticipated effects are basis-absent
  → agent calls getNetCompilationErrors, repairs within budget, and records decisions in Construction notes and a closing update_workpiece
  → reviewer types an element name or id; the why operation: locate element → epochs and transition records → basis → span in the cited revision → evidence relation or temporal context → recorded roles → live hash reconciliation
  → panel renders the answer in the workpiece pane, or a structured refusal: unsupported, not attributable, external, stale, ambiguous
```

Actor and authority crossings:

- **Flue log as substrate.** Revisions and mutations are tool-call records; correlation is by call id and submission order, never a shared turn id (F1). `update_workpiece` is never batched with a terminating construction tool (G1).
- **Agent to state.** `usePersistentState` at render, setter in the tool closure, called from `run` (F2). State holds the Markdown so the current revision survives compaction of the model's context (F10).
- **Agent to Petrinaut.** The plugin strips `basis` before forwarding canonical input; Petrinaut's contract is unchanged; schemas are derived mechanically (3.6 in the spec). Petrinaut library code gains no Brunch logic.
- **Browser to record.** The transition record is the only admissible statement of effect; a plan or self-report that fails diff accounting advances nothing (G9).
- **Core, plugin, binding, app.** Core owns revision and query semantics and `update_workpiece`; plugin owns mutation names, inputs, effects, template conformance, and the element locator; binding and app own authorized history acquisition and compose the why operation (F9).
- **Authorization.** Single principal, local, one conversation per document incarnation; retrieved history is untrusted evidence returned in the smallest range (F11, G5).

## Throughline proof floor

The floor has two steps, each under this mission's authority, separated by an owner gate (G18).

### Step A — adversarial tracer and probes under the initial narrow authority

One genuine conversation on the proving scenario, run through the production agent with the persona harness in `real-headless` mode or the panel, containing at least: two distinguishable workpiece passages, two mutations with declared basis, one no-op or failed mutation, one correction that changes a passage and its element, one hand edit made outside the conversation, one carried-forward passage, one passage with non-adjacent evidence, and one multi-source synthesis. The why operation must return deterministic answers or explicit refusals for every element, with no false attribution.

The four probes run alongside, each with its decision table:

| Probe | Pass | Partial | Fail | Re-entry |
| --- | --- | --- | --- | --- |
| **Compaction.** Set `keepRecentTokens` low, run past threshold, read `history()`. Do folded `update_workpiece` inputs, mutation parts, and user lines survive? | Lineage reads from `history()` | Current revision from state; history claims limited to the uncompacted window and disclosed in every answer | Harden the existing session-log archive lane into an immutable lineage projection before any exact-line claim; no new log, no capture envelopes (G20) | Flue exposes a supported pre-compaction read |
| **Fixture materialization.** Export or retain, relocate, reopen, authorize, and query the tracer conversation | Retained live store or supported relocation is the demo fixture route | Relocation works but identities must be re-bound; record the binding rule | Prepared-projection route only, honestly labelled; the why claim narrows to that projection | Flue adds a supported export or import surface |
| **Passage identity** under the G11 policy, on the tracer workpiece, across rename, move, paraphrase, split, merge, deletion, reintroduction, duplicate headings | Locator scheme selected | Some edit classes refuse continuity; the refusals become part of the claim | Revision-local text only; no cross-revision "introduced by" | A cheaper anchor lifecycle appears in the template |
| **Carrier repair** for one real nested mutation from the proving scenario's classes | Admit the scenario's classes | Flat classes only; nested classes refused with a named blocker | Crisp upstream Flue requirement (Standard Schema or supplied JSON Schema); no local schema copy | Flue accepts Standard Schema |

Two further measurements are taken in the tracer and gate the release, not the cut:

| Measurement | Pass | Partial | Fail |
| --- | --- | --- | --- |
| **Revision cadence and basis quality.** How often `update_workpiece` is called unprompted; how often basis is declared, relevant, and non-contradictory | Blame and basis have grain | Coarser ranges disclosed; skill wording and pane interaction adjusted before breadth | Explainability release withheld; construction stands on its own gates |
| **Reviewer utility** under the blinded rubric | Utility gate passes | Coverage below threshold on named classes; claim scoped to passing classes | Explainability release withheld |

Step A passes when every probe has a recorded outcome and the tracer produces no false attribution. The owner then decides whether to amend the authority into Step B, narrow it, or stop.

### Step B — the visible advance on the proving scenario

One or more genuine persona conversations on the proving scenario, run to construction with the tool set the carrier probe admitted, each retained through the harness's evidence directory and reopened through the fixture route the probe selected. The demo script runs on one of them. Every consequential element in its net resolves or refuses through the reopened authorized why operation, the safety gate passes, and the utility gate passes at the predeclared coverage.

## Readiness ratchet

```text
Mission 5 browser Flue transport + Mission 6 viability (transport, least mutation, settled manifest, resume)
→ inherited: core/plugin/app split; canonical Petrinaut contracts; persona harness; Flue 2.0.3 contracts as pinned
→ Step A: adversarial tracer + four probes with decision tables → owner gate
→ Step B: real conversations to construction; why over them
→ readiness gate: close identity, failure, durability, basis quality, current state, oracle obligations for this claim
├─ hand Mission 9 the seam: settled revisions, basis, transition records, epochs, passage policy, reconciliation, tool set, compaction posture, fixture route, gates
├─ hand Mission 10 basis, transition records, epochs, evidence relation for reviewer citation
└─ leave repeat, changed input, retirement breadth, concurrent change, cross-conversation access, schema breadth, batching, observer, remote durability unearned
```

### Inherited stratum closure

Mission 7 consumes, and must not overstate:

- **Mission 5.** The browser `ChatTransport`, the mounted route, client-tool-result correlation, and admission timing are landed and tested; the human Voice witness is Mission 5's own gate and not consumed here.
- **Mission 6.** Transport-carried least mutation, runtime settled manifest, and two-tab resume are viability facts. The prepared fixture's correspondence section was fixture-authored and the fixture is not promoted. The fenced-block resolver is a Mission 6 contract replaced here; Mission 6's close report names the carried change (A3, A4).
- **Mission 3 and 4.** Accepted workpiece leg and core/plugin architecture; falsified nested carrier; no full-run candidate. The tracer conversation is the first genuine full run and is labelled synthetic-persona if produced by the harness.
- **Mission 2.** Capture envelopes and sweep semantics are not consumed. The session-log archive lane exists and may be hardened only under the compaction probe's fail branch.
- **Mission 8.** Local application contract only. This mission names local posture; remote durability stays with a scheduled Mission 8 successor or a pre-handoff release gate.
- **Flue 2.0.3.** The tool `run` termination contract, the rules of hooks, `ToolContext.toolCallId`, `usePersistentState` semantics, and compaction defaults are documented and pinned; the upgrade row in the routing guidance applies.

### Readiness gate after the new throughline

This gate is the completion bar. For the proving scenario's net, close:

- **Inventory.** Consequential rule frozen before the run; inventory generated mechanically from the final canonical document; every identity-bearing or behaviour-affecting entity or field included; exactly one disposition per item (supported, partially supported, basis-absent, external, retired, refused); numerator, denominator, and exclusions published (G13).
- **Safety.** No false attribution; every required refusal correct: unsupported, not attributable, external, stale, ambiguous name, unknown outcome.
- **Utility.** Predeclared nonzero coverage of consequential elements with usable current-state answers, minimum coverage per admitted entity class, blinded reviewer task with the fixed rubric: identify the governing passage, distinguish elicited evidence from constructor inference, understand the current definition and latest correction, decide whether the answer changes the review judgement (G14).
- **Revision protocol.** No mixed batch; every mutation cites a settled revision; citation of an unknown or superseded revision refuses unless supersession is marked intended (G1, G2).
- **Basis quality.** Declared or absent-with-reason on every request; graded for relevance, contradiction, granularity, omitted dependencies; Construction notes never substitute (G7).
- **Transition records.** Independently verifiable on every call; duplicate delivery does not apply twice; conflicting duplicates resolve to unknown; failed, no-op, stale, unknown contribute only attempt history (G9).
- **Identity epochs.** One delete-and-recreate exercised; id not reused; origin and change history queryable (G8).
- **Reconciliation.** One hand edit exercised; the why answer refuses attribution for the affected state or discloses staleness; one external import exercised with dispositions retained (G4, G10).
- **Binding.** One-conversation-one-incarnation recorded and enforced; a second conversation targeting the document refuses (G5).
- **Roles and time.** Answers name recorded roles and stream order only (G6).
- **Passage policy.** Selected locator scheme or the revision-local fallback, with refusals as part of the claim (G11).
- **Compaction posture and fixture route.** Whichever branch the probes selected, disclosed in the product and the close report.
- **Carrier and tools.** Scenario-selected classes admitted over the repaired carrier; each class cites the case requirement it discharges; provider-schema rejection distinct from canonical rejection; repair budget enforced and visibly exhausted (G15).
- **Teaching.** Skill construction posture in place; measured cadence and basis quality recorded.
- **Visible workpiece.** Pane with current revision, list, diff; chat marker; projection in app or transport, not the Petrinaut library.
- **Subtraction.** `ask` and `sweep` client handling removed; six-tool and two-tool subsets retired as product surfaces once Mission 6 archives.
- **Runtime migration matrix.** Old history with new code; new history with rolled-back code; conversations mixing fenced and tool revisions; mixed browser and server versions; Mission 6 fixture mode; retained evidence restoration; tool-manifest rollback; any dual-read bridge with an explicit removal gate (F15).
- **Behavioural discriminator.** One executable check derived from the workpiece (resource reservation and release, reachability, token conservation, or one scenario outcome) passes on the constructed region and is carried unchanged to Missions 9 and 10 (F15).
- **Stock coexistence, docs, telemetry.** Stock assistant unchanged when Brunch is absent or unselected; Petrinaut user guide updated for the pane and the why interaction with a screenshot prompt; no content-bearing telemetry.

Mission 9 inherits the seam listed in the ratchet. **Owner:** Mission 9. **Re-entry gate:** an unchanged repeat request on the accepted conversation produces attempt history only, and one changed input produces a frozen expected impact set. **Oracle:** Mission 9's repeat, change, retirement, and current-state why witnesses. Mission 10 inherits basis, transition records, epochs, and the evidence relation for reviewer citation. **Re-entry gate:** an authorized reviewer's 3–5 turns produce a settled revision citing reviewer message ids and a bounded patch. Do not carry into Mission 9 anything this mission's visible claim already depends on.

## Candidate evidence and oracles

| Claim leaf | Existing evidence or candidate oracle |
| --- | --- |
| Browser Flue transport carries typed turns, history hydration, and correlated client-tool results | Existing Mission 5 evidence README and its 36-task Turbo run; Mission 6 focused tests for read, mutation, original call-id result, and continuation. Run `yarn exec turbo run test:unit --filter @apps/brunch-agent --filter @apps/petrinaut-website`. |
| Prepared signal retry and append-only selection; fixture-only advertisement; mismatch refusal; manifest retention | Existing Mission 6 tests named in `fe-1575-resumable-workpiece-petrinaut.md`. These remain guards for the prepared route only. |
| Construction tools currently expose the six-tool subset over the falsified carrier | Existing `plugin-sdcpn/test/construction-tools.test.ts`; `headless-petrinaut-client.test.ts`. Baseline to change, not success. |
| Multi-tool batch termination and hook rules | Installed Flue 2.0.3 reference; pin with a focused test that `update_workpiece` is non-terminating and never co-batched, and that the setter is captured at render. **ORACLE GAP** until that test exists. |
| `update_workpiece` settles, hashes, persists state, refuses empty or oversize input | **ORACLE GAP:** new core unit tests plus one production-agent integration through the Mission 5 transport. |
| Mutation cites a settled revision; unknown or superseded citation refuses | **ORACLE GAP:** plugin unit tests plus the tracer. |
| Transition record is independently verifiable; duplicates resolve to unknown | **ORACLE GAP:** website unit tests for pre-hash observation, effect derivation, diff accounting, duplicate handling; production-path integration. |
| Identity epochs; no id reuse | **ORACLE GAP:** epoch ledger unit test plus the tracer's delete-and-recreate. |
| Hand edit and external import are detected and disposed honestly | **ORACLE GAP:** the tracer's hand edit; reconciliation unit tests. |
| Passage policy holds under semantic edits | **ORACLE GAP:** the passage probe's recorded outcomes on the tracer workpiece. |
| Compaction posture | **ORACLE GAP:** the compaction probe's recorded outcome and its selected branch. |
| Fixture route | **ORACLE GAP:** the materialization probe's recorded outcome; acceptance assertions run through the reopened why operation. |
| Carrier carries one real nested mutation | **ORACLE GAP:** one budgeted paid call on the proving scenario's nested class with the exact schema artifact and raw arguments retained. |
| Why answers are safe and useful | **ORACLE GAP:** safety assertions over the frozen inventory through the reopened why operation; blinded reviewer task with the fixed rubric. |
| Constructed region is meaningful | **ORACLE GAP:** human semantic adjudication against the workpiece plus the behavioural discriminator. |
| Stock assistant unchanged | Existing host-mode test and browser witness pattern from Mission 6; rerun at close. |
| Product | A product manager runs the demo script on the proving scenario without an engineer. |

## Verification approach

- **Inner.** Core: `update_workpiece` validation, hashing, state write, revision numbering; query semantics for origin, current state, change history, attempt history. Plugin: basis parsing and refusal, locator resolution, effect interpretation, template conformance, class admission by scenario rule with schemas structurally compared to canonical Zod. Website: pre-hash observation, effect derivation, diff accounting, duplicate resolution, external import. Binding and app: history acquisition, authorization, why composition. Passage policy invariants as unit tests.
- **Middle.** The built production `ChatAgent` over the Mission 5 transport at `/agents/chat/:instanceId`: revise, cite, mutate, receive a transition record, resume, reconcile, and answer why, with duplicate delivery, stale base, unknown outcome, and hand edit injected. Run through root Turbo: `test:unit`, `lint:tsc`, `lint:eslint`, and `build` for `@apps/brunch-agent`, `@apps/petrinaut-website`, `@hashintel/petrinaut`, `@hashintel/brunch-agent`, `@hashintel/brunch-agent-plugin-sdcpn`, and `@hashintel/brunch-agent-transport-aisdk`.
- **Outer.** The adversarial tracer and the Step B conversations retained through `--brunch-evidence-dir`, reopened through the selected fixture route, and queried through the product why operation in the panel with `yarn dev:brunch` running and a real provider credential. Snapshots and projections are diagnostics only (G12).
- **Semantic and behavioural.** Human adjudication of the constructed region against the workpiece; the behavioural discriminator; the blinded utility rubric.
- **Product.** The demo script, last, after the readiness gate.

Paid provider evidence requires cut-time authorization with model, maximum calls, and spend ceiling recorded before execution.

## Inputs and joins

- **Mission 5 join.** The browser transport and correlation contract as landed; no second route.
- **Mission 6 join.** Viability facts and the two admissions; the prepared-signal route retained for test-authored material only; the fixture not promoted; Mission 6's construction-tool constraint amended here.
- **Persona harness join.** `real-headless` host for construction calls; evidence directory retention; turn budget in the launch prompt; a completion signal from Brunch's delivery status; ledger coverage as post-hoc grade (D4). Workpiece recovery in the harness must read `update_workpiece` tool parts.
- **Petrinaut canonical-contract join.** `petrinautAiTools`, `mutationActionInputSchemas`, `aiCommandActionInputSchemas`, entity schemas, writable callbacks, by import or mechanical derivation; mismatches route upstream; no schema change for provenance.
- **Flue join.** Documented tool, hook, state, signal, and history contracts; upstream requirement if the carrier cannot be repaired locally.
- **Scenario join.** The owner selects the proving scenario from the six cases, its admitted classes with cited requirements, its consequential rule, its behavioural discriminator, and the utility coverage threshold before the run.
- **Consumer discovery join.** Lightweight, non-binding discovery with Chris and Yannis before the proving scenario is fixed, so the region exercises semantics they will need (F15; Mission 11 draft).
- **Mission 9 and 10 output joins.** As listed in the ratchet.

## Risks and assumptions

| Risk or assumption | Impact if false | Cheapest discriminating validation |
| --- | --- | --- |
| The model calls `update_workpiece` often enough for revisions to have grain | Blame collapses to "the workpiece came from the conversation"; explainability release withheld | Count calls per turn in the tracer before Step B; adjust skill wording and pane interaction once |
| The model declares a usable basis unprompted | Basis is absent or circular; answers degrade to temporal context | Grade basis in the tracer for relevance, contradiction, granularity, omitted dependencies |
| `history()` keeps folded records | Exact lines and revision history vanish past 8000 tokens | Compaction probe |
| A genuine conversation can be relocated and reopened with identities intact | Persona runs cannot power the demo | Materialization probe on the tracer before any paid breadth |
| A locator scheme survives semantic edits under the policy | No cross-revision claim | Passage probe |
| The JSON Schema to Valibot interpreter preserves the scenario's nested classes | Nested classes blocked upstream | One real nested call |
| Effects can be derived mechanically from pre and post definitions and account for the diff | Self-report is unverifiable | Website unit tests with injected extra effects and hand edits |
| One-conversation-one-incarnation is enough for the proving scenario | A second conversation or principal needs the document | Decide at cut time; refuse otherwise |
| Visible names are unique enough for reviewer input, with id as escape hatch | A name-only query resolves the wrong element | Inventory duplicates; an ambiguous query must ask for the id |
| Exact lines plus declared basis are enough for a useful answer | Provenance exposed but review not helped | Blinded rubric |
| A synthetic persona yields a representative conversation | Provenance trivial on unique wording; fails on human messiness | Label sources; include the adversarial fixture with duplicate wording and rejected quotations (G12) |
| The proving scenario's consequential rule can be frozen before the run | Inventory gamed after generation | Freeze the rule and generate the inventory mechanically (G13) |
| Full-document emission per revision is affordable on the proving scenario's length | Cost forces coarser cadence | Measure tokens per revision in the tracer; structured patch is the later absorber |
| The interpreter, pane, tools, and probes fit one mission without unrelated fronts invalidating each other | Large implementation lands before a probe fails it | Step A gate before Step B (G18) |

## Accepted constraints and guarded invariants

- **STOP-THE-LINE — no false attribution.** A why answer never presents temporal context as evidence, a plan as effect, or absence as basis. Guard: safety assertions over the frozen inventory; negative controls.
- **STOP-THE-LINE — settled revision before mutation.** No mixed batch; explicit citation. Guard: co-batch and citation tests; tracer.
- **STOP-THE-LINE — transition record is the only statement of effect.** Guard: diff accounting and duplicate resolution tests.
- **STOP-THE-LINE — ids are never reused across epochs.** Guard: epoch ledger.
- **STOP-THE-LINE — external state is never laundered.** Guard: import dispositions retained until replaced.
- Flue history remains the canonical conversation log; no second log, capture ledger, or derivation store. Guard: dependency and state inventory.
- Markdown remains the semantic workpiece; revisions settle only through `update_workpiece`; the prepared signal remains tagged test-authored. Guard: resolver tests and public-schema inspection.
- Petrinaut owns canonical schemas, validation, mutations, document state; Brunch derives, never copies. Guard: structural alignment tests; stop on hand-copied fields.
- Core owns revision and query semantics; plugin owns operation semantics and locators; binding and app own acquisition and composition; the Petrinaut library gains no Brunch logic. Guard: topology tests.
- Stock assistant unchanged when Brunch is absent or unselected. Guard: host-mode test and witness.
- Single-principal local authorization named as a limit; retrieved history is untrusted evidence in the smallest range. Guard: ownership tests; answer inspection.
- No observer, automatic evidence fold, closed ontology, typed completion, assertion-card default, graph database, second agent or server, workflow engine, or general projection engine. Guard: dependency, tool, and state inventory.
- No content-bearing telemetry by default. Guard: trace inspection.
- Local posture only; "locally run," "locally verified image," and "remote replacement-safe" stay distinct claims.
- Paid provider evidence only under recorded budget.

## Cross-cutting obligations

- Workpiece sufficiency, projection fidelity, evidence provenance, revision integrity, Petrinaut semantic acceptance, deployed interaction quality, and visible failure, as stated in the spine's cross-mission obligations, hold over the constructed region and its why answers.
- Runtime migration matrix with removal gate (F15).
- Petrinaut user guide updated for the workpiece pane and why interaction; screenshot replacement prompted.
- Architecture docs: if a new folder forms a real architectural unit, add the local declaration and run the Petrinaut architecture-doc lint.
- Close report: each proof leaf's outcome, each probe's branch, the measured cadence and basis quality, the inventory numbers, the gates, and the flags carried to Missions 9 and 10.

## Expected touched paths

Tentative; Step A may shrink or redirect this manifest.

```text
libs/@hashintel/brunch-agent/
├── MISSION.md                                                        ~ cut-time authority; amended after the Step A gate
├── MISSION.next.md                                                   ~ carried flags only
├── docs/evidence/                                                    + probe outcomes, tracer, Step B witnesses, adjudications, gates
├── packages/core/src/                                                + update_workpiece; revision and query semantics; passage policy
├── packages/core/src/client-tools.ts, _suspended/                    - ask and sweep names and contract
├── packages/plugin-sdcpn/src/tools/                                  ~ carrier interpreter; scenario-selected admission; basis handling; locators
├── packages/plugin-sdcpn/src/flue.ts                                 ~ mount by scenario; retire subsets after Mission 6 archives
├── packages/plugin-sdcpn/src/skills/sdcpn-modelling/                 ~ construction posture; settled-revision and basis discipline
├── packages/binding-flue/src/                                        ~ history acquisition for why; archive lane only under the compaction fail branch
├── packages/transport-aisdk/src/                                     ~ transition-record projection; deduplication by call id; pane projection
└── evaluations/                                                      + proving-scenario consequential rule, discriminator, rubric

apps/brunch-agent/
├── src/agents/chat-agent/                                            ~ compose update_workpiece and the why operation
├── src/capture/apply-sweep.ts                                        - retired unless the compaction fail branch keeps the archive lane
├── src/evaluations/persona/                                          ~ workpiece recovery from tool parts; cadence and basis measurement
└── test/                                                             + protocol, record, epoch, reconciliation, why integration

apps/petrinaut-website/src/main/app/
├── local-storage-demo/                                               ~ transition records; binding; pane; why rendering; remove ask/sweep handling
└── voice-interview/                                                  - ask and sweep references

libs/@hashintel/petrinaut/
├── src/ui/views/Editor/panels/ai-assistant-panel*                    ? generic host surface only if the app cannot host the pane
└── docs/                                                             ~ pane and why guidance

libs/@hashintel/petrinaut-core/                                       ? only for an observed canonical contract defect; no provenance slot
```

## Fog-line

- Compaction survival of `history()` records; the probe decides the branch.
- Fixture materialization route; the probe decides.
- Locator scheme under the passage policy; the probe decides.
- Carrier repair route: local interpreter or upstream Flue; the probe decides.
- Revision cadence and basis quality in a real conversation; measured in the tracer.
- Whether the optional evidence relation on `update_workpiece` is used by the model unprompted, and whether it drifts toward assertion cards under use.
- Whether one or two model-facing why tools serve the reviewer better.
- Token cost of full-document emission on the proving scenario, and when a structured patch earns its place.
- Which admitted classes misbehave at the provider boundary once the carrier carries fields.
- Whether the proving scenario needs cross-conversation document access.
- The proving scenario itself, its consequential rule, discriminator, and utility threshold: owner decisions at cut time, informed by consumer discovery.

Resolve these at the real boundaries. If a choice changes accepted interaction policy, architectural ownership, or the claim, return it to the owner and amend the authority before continuing.

## Stop or reorient

Stop and surface evidence if:

- the tracer cannot produce deterministic answers or explicit refusals without guessing, after one round of interaction adjustment;
- `update_workpiece` and a construction tool must share a batch to make the interaction work;
- a mutation cannot cite a settled revision because the model cannot reliably use the returned ids;
- the compaction probe fails and the only remedy is a new log rather than hardening the existing archive lane;
- the materialization probe fails and the prepared-projection route would make the why claim fixture-only;
- the carrier cannot be repaired locally without copying Petrinaut fields; record the upstream blocker;
- effects cannot be derived mechanically and the browser must self-report;
- a hand edit or external state is presented as attributed provenance;
- an id is reused across epochs;
- the constructor's basis is systematically circular or absent and no interaction change helps; withhold the explainability release;
- the utility gate cannot be met on any admitted class; withhold the explainability release;
- the pane or why operation requires Brunch logic in the Petrinaut library;
- a second conversation or principal must reach the document; that is Mission 9's owner and gate;
- the mission widens into repeat, changed input, retirement breadth, observer, remote durability, or reviewer authority; or
- the inventory rule is defined after the artifact is inspected.

## Carried evidence and rejected alternatives

- Mission 2 established the least capture pipe: explicit harness range, one exact envelope per user utterance, payload `{}`, stable ids on replay, no model extraction, no sweep tool. It did not establish typed semantics, a workpiece join, or durable product data. **Rejected for this mission's provenance (C8, G20):** Flue history already carries message ids and exact text; the store duplicated it under a second identity scheme. Its session-log archive lane survives as a separate capability with one named re-entry.
- Mission 3 accepted one Flue workpiece path and falsified real-model construction on the provider-visible carrier; the hermetic fixture proved packaging and canonical validation; the paid empty net is not a pair. **Consumed:** this mission repairs the carrier (B9, C11).
- Mission 4 supplied no full-run candidate. **Consumed:** the tracer is the first genuine full run, labelled by source.
- Mission 6 proved transport, least mutation, settled manifest, and resume. **Two admissions carried:** fixture-rigging (A3) and the fenced-block-to-tool change (A4).
- **Rejected: the honest prebuilt pair with a hand-authored derivation fixture** (B4, C1). Provenance now comes from constructor-declared basis and recorded transitions on a genuine conversation.
- **Rejected: temporal adjacency as causation** (F5, G3). "Latest revision before the mutation" is context, not basis; passage-to-turn ranges are context, not evidence, unless a revision-time relation is declared.
- **Rejected: a hash-only join between net and workpiece revisions** (F7, G9). Replaced by the transition record.
- **Rejected: storing provenance pointers in the Petrinaut document** (C6, B7). No slot exists; a file-level pointer waits for a Mission 11 consumer.
- **Rejected: the six-tool subset as a product surface** (C10) and **full-bundle admission by default** (F13, G15). Replaced by scenario-selected operations with canonically derived schemas.
- **Rejected: capture-fold, one-artifact merger, versioned assertion cards as default, closed kinds and slots, typed completion, per-capture losses, observer, graph database, general projection engine.** Their re-entry conditions live in the spine's backlog and standing locks.
- **Rejected: a side quest under Mission 6 or a separate probe mission for the probes** (G18). The two-step authority within this mission was chosen.
- Versioned assertion cards remain a possible future response only if the optional evidence relation on `update_workpiece` proves insufficient under observed revision strain; they are not the default.
- Typing a visible element name or id remains the accepted first interaction; click-to-chat and canvas-selection context are deferred unless textual identification proves ambiguous or burdensome (carried from the 2026-09-03 draft).
- The FE-1476 six-beat story remains the integrated floor, not the ceiling; the broader scenario portfolio remains unenumerated and must be named at cut time.

## Cut conversion map

| Live `MISSION.md` address | Source in this draft |
| --- | --- |
| Status | New at cut: branch, issue re-title, two-step authority note, Mission 6 constraint amendment |
| Imperative | Visible product advance, with the release note, demo script, previously impossible, deployment posture (local), and completion |
| Throughline | Boundary crossings and current throughline hypothesis, plus Expected touched paths |
| Proof | Throughline proof floor (Step A with decision tables, Step B), Readiness gate after the new throughline, Candidate evidence and oracles, Verification approach |
| Constraints | Accepted constraints and guarded invariants, Cross-cutting obligations, Inputs and joins |
| Fog-line | Fog-line, plus the open rows of the decision tables |
| Stop or reorient | Stop or reorient |
| Deferred | The Mission 9 and 10 handoffs in the Readiness ratchet, and the rejected alternatives with their re-entry conditions |

Before cutting, re-read the four design-evidence documents and the two reviews' evidence lists, inspect the real boundary for each cold-start read, confirm the proving scenario with consumer discovery, obtain the FE-1573 re-title, and record the paid-evidence budget.
