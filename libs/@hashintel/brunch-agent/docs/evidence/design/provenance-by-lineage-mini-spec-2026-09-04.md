# Provenance by lineage with declared basis — mini spec, 2026-09-04 (third state)

> Design evidence, not execution authority. This document projects the [decision log of 2026-09-04](provenance-and-tooling-decision-log-2026-09-04.md), including dispositions F1 to F16 and G1 to G22, into one reviewable statement of intent, design, and consequences for the Brunch mission spine. Two review passes shaped it: the [independent review](provenance-by-lineage-independent-review-2026-09-04.md) corrected the turn topology, hook pattern, and claim strength and added the declared basis and transition record; the [follow-up review](provenance-by-lineage-follow-up-review-2026-09-04.md) corrected the revision protocol, separated the provenance relations, added document reconciliation and readiness ownership, and hardened the gates. Nothing here may be implemented until it is re-evaluated and cut into a live `MISSION.md`; the planning projection is the Mission 7 draft.

## 1. Intent

Brunch must be able to say, for any consequential element of a Petri net it helped build, what it rests on: the workpiece passage the constructor declared as its basis, the settled revision that carried that passage, the conversation context associated with that revision and, where declared, the evidence relation behind the passage, and the recorded roles that did each thing, or an honest refusal. It must do this without a comprehensive typed domain model, without a second conversation log, and without anyone authoring links after the fact.

Two earlier approaches failed in opposite directions. A comprehensive typed intermediate representation tried to make provenance a property of the domain model; the typology receded as it grew and the model worked worse with it. The structural Markdown workpiece that replaced it is legible and cheap but has no seam to either the conversation or the net, and provenance was deferred without the tension being named in the planning record.

The corrected resolution treats provenance as four distinct contracts, none of which is inferred from the others:

1. **Revision protocol.** A workpiece revision settles and becomes addressable before any mutation can cite it.
2. **Provenance semantics.** Mutation basis, passage evidence, element origin, current-state history, attempt history, and recorded actor roles are distinct relations, each with its own source.
3. **Document reconciliation.** The live Petrinaut state is compared with recorded transitions before provenance is reported.
4. **Mission readiness.** The mission making the construction-and-explanation claim closes the safety and utility obligations that claim depends on; only breadth first made load-bearing by the next visible advance moves later.

## 2. The lineage model, as the log actually records it

```text
submission S1   user message                                    (submissionId S1, no turnId)
                assistant turn T1
                  ├─ update_workpiece { markdown, evidence? }    revision R: identity = callId, sha256
                  └─ tool result { revisionId, sha256, revision }
                state_write workpiece = { revisionId, sha256, revision, markdown }
submission S2   user message or continuation
                assistant turn T2   (render exposes revision R from state)
                  └─ addArc { …, basis: declared{ revisionId R, sha256, locators, rationale, scope } }
                      server output = awaiting client; turn terminates
submission S3   system dispatch  client-tool-result [{ toolCallId, output: transition record }]
                assistant turn T3   continuation
```

Rules the diagram encodes:

- `update_workpiece` and a Petrinaut mutation never share a tool batch, because a batch ends the turn only when every result terminates and construction tools terminate (G1).
- A mutation cites a settled revision by id and hash; "latest" and sibling order are inadmissible (G2).
- Correlation is by `toolCallId` plus submission order; cumulative result signals repeat earlier ids and are deduplicated (F1).
- "When" means canonical stream order (G6).

Resolution from an element, with the relation each hop actually is:

```text
element id
  → identity epoch, then transition records naming it         origin | current state | change history | attempt history   (G8, G9)
  → operation-level basis on the creating and changing calls   constructor-declared, or absent{reason}                      (G7)
       └─ mapped to this element only if an intended-effect mapping names it; else operation-level only
  → the locator's immutable span in the cited settled revision  passage                                                    (G11)
  → declared evidence relation on that revision, if any          elicited | inference | default | formalism | external | correction   (G3)
       └─ otherwise: conversation context temporally associated with the revision, labelled as such
  → recorded roles                                              assistant tool call · local browser executor · user under principal · test-authored fixture   (G6)
  → live document reconciliation                                 current hash matches last reconciled state, or answer is labelled "as of …"   (G4)
```

What the model does: it calls the lookup tools and interprets structured results in prose. What it may not do: author a basis after the fact, promote temporal context to evidence, reread the transcript as provenance, or explain an element the records mark unsupported, not attributable, or external (C3, G7, G10).

## 3. Mechanisms

### 3.1 `update_workpiece` (core, server-side) — C4, F2, F10, G1, G3

| Aspect | Decision |
| --- | --- |
| Input | `markdown` (full document) and optional `evidence: [{ locator, messageIds[], kind }]` |
| Hook pattern | `usePersistentState('workpiece', …)` at render; setter captured in the tool closure; called from `run`, which receives `toolCallId` |
| Identity | `revisionId` is the call's `ToolContext.toolCallId`; `sha256` is content identity; the ordinal `revision` is display metadata, never an identity (H6) |
| State value | `{ revisionId, sha256, revision, markdown }`, updater form; the Markdown lives in state so the agent has its current workpiece at render regardless of compaction |
| Output | `{ revisionId, sha256, revision }`; the model must use these in later basis declarations |
| Termination | non-terminating; never batched with a terminating construction tool |
| Validation | core: non-empty, size; plugin: template conformance |
| Durability | `durable: true`, server attempt only |
| Ownership | core owns the tool; plugins own the template |

The fenced `runbook-ir` block is retired as the model-produced revision source. The prepared-signal route stays for test-authored revision zero, tagged as such.

### 3.2 Declared basis on mutation requests — F5, G2, G7

```text
basis =
  | declared { revisionId, sha256, locators: [span], rationale, scope: operation | { intendedEffects: [{ elementId, locators }] } }
  | absent   { reason }
```

The cited revision must have settled and match the current state pointer unless supersession is marked intended. Construction notes are not a substitute for an absent basis. The plugin strips `basis` before forwarding the canonical input to Petrinaut, so Petrinaut's contract is unchanged, and the full request is retained in the log as the tool-call input. Basis quality is graded for relevance, contradiction, granularity, and omitted dependencies.

### 3.3 Mutation transition record and operation protocol — F7, F8, G4, G5, G9, G10

The browser returns one authoritative transition record per call:

```text
{ toolCallId, documentId, documentIncarnation,
  requestedBaseHash, observedPreHash, postHash?,
  outcome: applied | no-op | failed | stale | unknown,
  effects: { created[], updated[], deleted[], derived[] }   disjoint, mechanically derived from pre/post
  diffAccounted: boolean }
```

Protocol: `requested → outcome → reconciled | incomplete | unknown`. `postHash` is present only when a post-apply observation exists, so an `unknown` outcome may lack it. The first well-formed outcome is authoritative unless a later delivery conflicts with it, in which case the outcome becomes `unknown` and both deliveries remain as attempt history (H7). An `elicited` evidence relation on `update_workpiece` is refused unless every referenced message id resolves to an authorized true-user message in the bound conversation (H8). Failed, no-op, stale, and unknown calls contribute only attempt history. Mission 7 binds one conversation to one document incarnation, recorded at fixture creation and checked on every mutation and why query (G5). A document hash no record explains is "not attributable from recorded transitions"; an external revision may be imported with actor or unknown, principal, parent hash, canonical diff, and reason, and every imported changed element keeps an `external/unsupported` disposition until a later recorded transition replaces it (G10). Every why answer reconciles against the live document hash through the existing client-tool path or labels itself "as of the last reconciled recorded state" (G4).

### 3.4 Lookups and their executable boundary — C5, F9

Core owns revision and query semantics. Plugin-sdcpn owns mutation names, inputs, outputs, and effect interpretation. Binding and app own authorized acquisition of Flue history through the in-process fetch pattern the capture sweep already uses, and compose the model-facing why operation. One or two model-facing tools follows interaction quality. Retrieved conversation text is untrusted evidence returned in the smallest range needed; the single-principal local limit is stated (F11).

### 3.5 The visible workpiece — C7, G16

Chat projects `update_workpiece` parts out of assistant messages and leaves a one-line marker. A pane in the Petrinaut Brunch panel shows the current revision, the revision list, and a diff, derived from Flue history through the Mission 5 transport. The why answer renders into the same pane. The projection lives in the app or transport layer, not the Petrinaut library. Inside Mission 7 the pane is an enabling surface for the construction-and-explanation claim, not a second release.

### 3.6 Schema carrier repair — B9, C11

Precondition for admitting any nested tool. Flue accepts Valibot only and rejects other Standard Schema vendors; the construction factory declares an empty loose object with the JSON Schema pasted into the description. Fix by a mechanical JSON Schema to Valibot interpreter for the subset Petrinaut uses, or upstream Flue Standard Schema support. Prove one real nested call before broad admission. Carrier failure is a crisp upstream blocker, never a local schema copy.

### 3.7 Passage identity — F6, G11

Policy first: passage ids are never reused after deletion; split and merge record predecessor and successor sets; ambiguous paraphrase refuses continuity; reintroduction starts a new identity unless continuity is declared; a locator resolves to an immutable revision-local span; duplicate headings and quotations are tested; an overbroad span fails basis quality when a materially narrower sufficient span exists. Then the probe tests ergonomics and model compliance on one real workpiece under rename, move, paraphrase, split, merge, deletion, and reintroduction. Fallback if the policy proves too expensive: revision-local text and refused cross-revision "introduced by" claims.

### 3.8 Scenario-selected tool admission with canonically derived schemas — F13, G15

The inherited six-tool subset is retired. Operations are selected from the proving scenario; their schemas are derived mechanically from Petrinaut's AI tool bundle. The 2026-09-04 survey of the six persona cases gives the candidate set; the cut names the proving scenario and admits only the classes it needs, citing the case requirement each discharges.

| Entity class | Case evidence | Operations (add, update, remove unless noted) | Admission |
| --- | --- | --- | --- |
| places, transitions, arcs | every case | including arc weight and type | default |
| scenarios (initial state) | every case | | default |
| types and type elements | most cases name colours or token attributes | | default when the scenario has typed tokens |
| parameters | industrial gas | | when the scenario names a tunable quantity |
| differential equations | data-centre thermal, pharma cold chain | | when the scenario has continuous dynamics |
| metrics | Vestera names scheduling objectives but forbids invented weights | | only when the scenario names a measurable objective Petrinaut's `Metric` can express |
| queries and commands | all | `getLatestNetDefinition`, `getNetCompilationErrors`, `applyAutoLayout`, `setNetTitle` | default |
| excluded | only Vestera hints at hierarchy | subnets, component instances, position updates, type-element move | until a case needs them |

Expansion is by observed need with the case named. Parity with the stock modeller is not the goal; ending deferral is.

### 3.9 Teaching and subtraction — C9, C12, G20

The skill gains construction posture: read the definition first, call `update_workpiece` and wait for its settled revision, mutate in small steps each citing that revision with a declared basis, check compilation errors, record decisions in Construction notes without treating them as basis, and call `update_workpiece` again after construction. The `ask` and `sweep` client handling is retired from code. Three things stay distinct: capture envelopes and sweep semantics, rejected for Mission 7 provenance; the existing session-log archive lane in `binding-flue`, which may be hardened if the compaction probe is negative; and any new immutable lineage projection required by compaction, relocation, or authorization.

## 4. Tool inventory after this design

| Tool | Owner | Executes | Status |
| --- | --- | --- | --- |
| `ping`, `activate_skill`, `readPetrinautDoc` | app, Flue, plugin | server, server, browser | keep |
| scenario-selected Petrinaut operations (3.8) | plugin-sdcpn, schemas derived | browser | admit after carrier repair, per proving scenario |
| `update_workpiece` | core | server | new |
| why operation (one or two model-facing tools) | composed at app from core and plugin | server, with a browser read for reconciliation | new |
| `ask`, `sweep` client handling | core, website | browser | retire |
| six-tool and two-tool subsets | plugin-sdcpn | browser | retire once Mission 6 archives |

## 5. Real honest fixtures — D1 to D5, F14, G12, G13, G14

The provenance pair is a real conversation with a real revisioned workpiece and a real constructed net, produced by persona interviews against the production agent. The Mission 6 prepared fixture stays a viability proof.

```text
probe: one tiny genuine conversation → export or retain → relocate → reopen → authorize → query   (F14, first)
then: persona runs (Pi harness, production ChatAgent, real-headless host), several cases in parallel
      → Flue store holds conversation, settled revisions, mutations with basis, transition records
      → harness retains snapshot.json + projections per settled read           (diagnostics only)
      → consequential rule frozen before the run; inventory generated from the final canonical document
      → acceptance assertions run through the reopened authorized why operation the product uses
      → safety gate, then utility gate with a blinded reviewer task and fixed rubric
```

Sources are labelled synthetic-persona, internal-human, or customer-derived. At least one adversarial fixture includes duplicate wording, rejected quotations, constructor inference, a correction, unrelated context, a carried-forward passage, non-adjacent evidence, and multi-source synthesis. Stop rule: a turn cap as budget, early stop when Brunch declares construction handoff, ledger coverage as the post-hoc grade (D4). Runs go to construction so the fixture contains lineage and basis (D5).

## 6. Mission topology — F12, G16, G18

Construction and explanation ship in one mission, Mission 7, which also closes the readiness of its own claim. Its authority is cut in two steps under one issue and branch, based on the final Mission 6 close commit: a narrow first authority whose throughline is the adversarial tracer and the four probes with decision tables and an outcome classification (eligible for amendment, eligible after named rework, terminal stop); then, on an allowed branch and the owner gate, a separately committed amendment admitting the construction-and-explanation body with its readiness gate. The Step B packet survives in the retitled draft, never in the live Proof, until that amendment (H3, H5). Under the owner's qualification H0, rework branches preserve the consolidated shape; only outcomes that contradict it are terminal. Mission 9 takes breadth first made load-bearing by "repeatable": unchanged repeat, changed input, deletion and retirement, concurrent user change, cross-conversation document access, broader schema classes, and the per-action versus batch decision if Mission 7 has not settled it. Mission 10 inherits basis, transition records, passage policy, and identity epochs. Mission 11 gains early consumer discovery and three-gate readiness (G21). Local posture is named; remote durability goes to a scheduled Mission 8 or an explicit pre-handoff release gate, and "locally run," "locally verified image," and "remote replacement-safe" stay distinct claims.

Release wording (C13, F5, G6): "Ask why about any element in a net Brunch built with you, and see the workpiece passage the constructor declared as its basis, the conversation context behind it, and which recorded step did what, or an explicit refusal." Causal and identity wording strengthen only as the records do.

## 7. Consequences for the planning record — G19

1. **Name the tension** in the spine: lineage plus declared basis as the hypothesis; typed IR, hand-authored derivation, and temporal adjacency as causation rejected with reasons; revision cadence, compaction survival, passage identity, and basis quality as named strains; the visible workpiece as the precondition.
2. **Recut the drafts**: Mission 7 becomes the consolidated construction-and-explanation mission at cut-level detail; Mission 9 becomes breadth and repeat behaviour; Mission 10 inherits the new seam; Mission 11 gets early consumer discovery and three-gate readiness.
3. **Planning-content migration matrix** in `MISSION.next.md`: one surviving destination per old item.
4. **Mission 6 close report**: fixture-rigging admission, the carried fenced-block-to-tool change, the credential cause of the blocked witness.
5. **Runtime migration matrix** with a removal gate for any dual-read bridge (F15).
6. **Authority**: every settled item becomes authority only when written into the cut Mission 7 `MISSION.md`, with Mission 6's construction-tool constraint amended there.

## 8. Probes with decision tables — G17

| Probe | Pass | Partial | Fail | Re-entry |
| --- | --- | --- | --- | --- |
| Compaction: does `history()` keep folded `update_workpiece` inputs, mutation parts, and user lines? | Lineage reads from `history()` | Current revision from state; history claims limited to the uncompacted window and disclosed | Harden the existing session-log archive lane into an immutable lineage projection before any exact-line claim | Flue exposes a supported pre-compaction read |
| Fixture materialization: export, relocate, reopen, authorize, query one tiny genuine conversation | Retained live store or supported relocation is the fixture route | Relocation works but identities must be re-bound; record the binding rule | The demo runs on the retained live store where the conversation was produced; relocation is filed upstream; the prepared-projection route is not used for the why claim (H5) | Flue adds a supported export or import surface |
| Passage identity under the G11 policy | Locator scheme selected | Some edit classes refuse continuity; refusals become part of the claim | Revision-local text only; no cross-revision "introduced by" | Cheaper anchor lifecycle appears in the workpiece template |
| Carrier repair for one real nested mutation from the proving scenario | Admit the scenario's classes | Flat classes only; nested classes refused with a named blocker | Crisp upstream Flue requirement; no local schema copy | Flue accepts Standard Schema or supplied JSON Schema |
| Revision cadence and basis quality in the adversarial tracer | Blame and basis have grain | Coarser ranges disclosed; skill wording and pane interaction adjusted before breadth | Explainability claim stops at "which revision, which turns"; construction proceeds without the why release | Cadence improves under the revised interaction |
| Reviewer utility under the blinded rubric | Utility gate passes | Coverage below threshold on named classes; scope the claim to passing classes | Explainability release withheld; construction release stands on its own gates | Rubric passes on a later fixture |

## 9. Questions for the next reviewer

1. Does the two-step Mission 7 authority satisfy the one-live-mission rule without becoming a thin tracer by another name?
2. Is the optional revision-time evidence relation on `update_workpiece` the least mechanism that makes passage evidence honest, or does it drift toward assertion cards?
3. Is the transition record now independently verifiable, and does the one-conversation-one-document binding leave Mission 9 a clean re-entry?
4. Is any admitted class in 3.8 unearned by the proving scenario?
5. Which decision-table rows are terminal stops rather than rework branches, and does any rework branch quietly reduce the mission's ambition against H0?
