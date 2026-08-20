# Brunch — domain language

Vocabulary for the brunch elicitation system: an architecture generalizing agentic interviewing against pluggable elicitation targets. Hardened during the elicitation-kernel effort (whose spec settled 2026-08-10) and now governing this repo's implementation and the live process-model-elicitation effort alike. (The old title "Elicitation Kernel" fell to the glossary's own rule: "kernel" is a retired shell name.)

## Language

### Shells

**Substrate**:
The agent framework the system is built on — the Pi family, Flue — including the embedding environment's concerns: deploy target, storage-port implementation, artifact delivery, model/provider. (The retired term "host" silently bundled these with interface concerns; they split into substrate and UI. The charter non-goal "harness-agnostic core" predates this glossary and reads "substrate-agnostic".)
_Avoid_: harness (for Pi/Flue), platform, host (for the embedding environment)

**UI**:
The interface shell: whatever affords user interaction — rendering, input, reply transport. Not bound to GUI or TUI; a chat channel qualifies.
_Avoid_: host, host-interface, frontend, client

**Harness**:
The middle shell and the essence of the effort: the generic capability layer of the elicitation system — mechanism and orchestration (the conversation loop, the `ask` API, capture envelope, issue queue, sweep bookkeeping). Injected into plugins as a narrow context; never owned by them.
_Avoid_: kernel, core, elicitor (as a shell name — "elicitor" may name the whole system). Exempt compound: **kernel card** (below). "Kernel invariants" renamed **harness invariants** (spec §14.1).

**Plugin**:
The innermost shell: target-defining policy. Declares packs, forms, and validators; composes at authoring time; receives harness capabilities by injection. Mostly policy — mechanism stays in the harness.
_Avoid_: extension, pack (a pack is a unit *within* a plugin)

**Binding**:
The substrate-facing adapter between harness and substrate: implements the harness's named substrate-capability list (tool registration, instruction assembly, persistent state, affordance emission, suspend-for-reply, private model call) in one substrate's dialect. One per substrate; the harness imports no substrate, a binding imports both. Bindings vary in size — each absorbs what its substrate lacks or forbids.
_Avoid_: adapter (generic), integration, wrapper

### Sessions & durability

**Target-domain**:
The artifact family being elicited — what a plugin defines (gherkin scenarios, assurance arguments, BPMN). The family half of the former bare "target".
_Avoid_: target-paradigm; bare "target" where family/instance is ambiguous

**Target-document**:
The durable unit sessions attach to: one target-domain, its capture store, and its session history. Named by its purpose — its authoritative state is the capture store plus session logs, never the rendered artifact (renders are derived, cacheable, disposable). Endures independently of any session; never locks — completion is a derived status, not a write gate.
_Avoid_: spec (as the unit name), workpiece, case, target-output

**Session**:
One substrate conversation — the full log of entries (user, agent, tool calls, injected state messages), matching Pi's session model. Per-session state is exactly: the evidence log, the swept high-water mark, the pending-affordance slot. Sessions go quiet rather than close; any session is resumable against the current state of its target-document.
_Avoid_: sitting, conversation (as a distinct concept)

**Capture store**:
The durable, session-independent truth of a target-document: captures, issues, events. Written only by atomic sweep application (serialized); statuses and projections derive from it at read time.

**Re-entry briefing**:
The state message the harness injects when a session resumes after the world moved: computed facts only — unswept tail, world-moved delta, open issues, pending affordance. Authored on behalf of the user in the transcript (Pi's custom-entry convention) but distinguished from true user entries in the data model, and never citable as capture evidence.
_Avoid_: sync message, forced re-sweep

### Interaction

**Affordance**:
A structured interactive element (question form, choice strip, questionnaire) emitted into the conversation stream as a rendered enhancement. Not a state machine — the conversation stays primary, and an affordance's payload is evidence in the session like any other entry.
_Avoid_: exchange, exchange pair, terminal (brunch's retired turn-by-turn ontology)

**Capture**:
Extraction of structured evidence — envelope plus plugin-typed payload — from session entries. Produced by sweeps, never written directly during conversation.
_Avoid_: extraction, harvest

**Sweep**:
An idempotent pass over a settled range of session entries that produces captures. Re-sweeping a range never double-captures.

**Settlement**:
The agent-judged event marking a range of conversation (a vein closing) ready to sweep. Always range-level, never per-question.
_Avoid_: exchange completion

**Interpretation render**:
The harness-owned affordance form showing current captured state — the harness frames envelope semantics; the plugin's renderer definition (typed against its own payload shapes) supplies the content view when provided, with a harness default (plain JSON view) otherwise.
_Avoid_: digest (brunch's form)

### Envelope & packs

**Intermediate representation (IR)**:
The elicited description a target-document accumulates: the set of active captures, read through the plugin's declared payload type system. Not a second store — every consolidated view (entity graph, net, completion table) is a read-time projection over active captures, and the rendered artifact is one projection of the IR, never the IR itself. Defining a plugin's IR means defining its payload type system.
_Avoid_: knowledge store, domain model (as a stored unit), staging area

**Capture envelope**:
The harness-defined, domain-free wrapper around an opaque plugin payload: harness-minted id, evidence spans, epistemic status, confidence, value-xor-absence, alternatives grouping, one `supersedes` link. The hourglass waist. No stored status — envelope status (`active | superseded | retracted`) derives at read time from links and events.

**Evidence span**:
A capture's provenance link: a **quoted excerpt** (primary, the model-facing citation currency) plus a **pointer** (session id + entry range, harness-derived — entry identity is harness-side vocabulary only). Anchors only on true user and user-affordance-payload entries.

**Epistemic status**:
`explicit | inferred | tentative | defaulted | external-lookup` — how a capture's content relates to what the user actually said. Distinct from confidence; excluded from capture identity.

**Absence state**:
A first-class capture value where an answer would be: `unknown-to-user | not-yet-decided | not-applicable | explicitly-absent | declined | deferred` (`not-mentioned` is a computed fact, not a sweepable capture). Never collapses to null.
_Avoid_: null, missing (as the stored representation)

**Supersession**:
The explicit correction mechanism, single-hop over active heads only. Two channels: the creation-time `supersedes` link (sweep-time correction) and the resolution record (issue-time adjudication). Superseded captures stay visible — corrections don't erase history.

**Resolution record**:
The explicit capture-store event that alone closes a `conflicting` issue (and, with no successor capture, expresses retraction). Must cite the true user's utterance as evidence.

**Issue**:
Typed, stored backpressure to the elicitation controller: `missing / ambiguous / conflicting / invalid / unsupported / unmapped / low-confidence`, with factual attributes. Two producers, namespaced: plugin ops (payload level) and the harness itself (envelope level). Closes only explicitly.
_Avoid_: advisory (a different thing, below)

**Advisory**:
A computed, ephemeral, non-blocking fact the harness surfaces to the agent (unaccounted ask, unswept tail, world-moved delta). Never stored in the capture store; never gates anything.

**Pack**:
A unit within a plugin: **ElicitationPack** (kernel cards, completion contract, clarification hints) or **ProjectionPack** (`project` + `validate`, optional `reconcile`, annotated shapes, typed loss reports). Packs are shapes-to-fill plus behavioral guidance, per Principle v2.

**Kernel card**:
The pack-content unit of elicitation guidance: Detects / Goal / contrastive Questions / Artifacts (brunch `BEHAVIORAL_KERNELS.md` lineage — "kernel" here names a small unit of behavioral guidance, not a shell; the compound is the glossary's one sanctioned "kernel" use). Splits by ownership: domain cards are plugin pack content; a harness-shipped **generic strategy quiver** (cards over envelope vocabulary — conflict, ambiguity, weak evidence) is named in spec §11.5, not designed.

**PluginContext**:
The narrow injected context through which a plugin receives harness capabilities (the ask API, envelope, issue queue, sweep bookkeeping). The plugin's entire world at runtime; the four operations remain pure (snapshot-in/deltas-out) regardless.

**Storage port**:
The harness-defined contract for the capture store (atomic sweep application, envelope invariants as store-level refusals), implemented by the binding for its deploy target. Plugins are storage-blind. Scope includes the **session-log archive** (archive-on-read; spec §9.6): session logs live with the target-document, retained indefinitely — the substrate's conversation store is the live transport copy, never the provenance record.

### September demo

**Demo shell**:
The one-off application proposed for the 17–18 September demo (FE-1362; recommended to PM alongside the artifact boundary, not ratified): consumes the elicitation library (harness + plugin + binding) and the Petrinaut libraries, owns the UI, session persistence, and elicitor runtime. Explicitly disposable — not a product commitment; neither library consumes the other.
_Avoid_: "the app", standalone brunch, demo app (unqualified)

**Artifact boundary**:
The integration posture between elicitor and Petrinaut recommended to PM (FE-1362; not ratified): the elicitor emits a versioned net file plus scenario; Petrinaut consumes it through its published parser and import-with-autolayout path. The alternative recommended against was library coupling (one library consuming the other).
_Avoid_: file handoff (undersells it), integration (generic)

**Revision story**:
The working-hypothesis demo spine (FE-1363; recommended to PM, not ratified): a sped-up recorded elicitation (conversation, interpretation surface, and growing net visible together) plus a bounded live segment in which a few turns elicit a fact forcing a structural revision of the net, run before/after in Petrinaut.
_Avoid_: live demo (unqualified — the live part is one bounded segment, not the format)

### Simulation & evaluation

**Situation pack**:
The interviewee-side bundle defining a user-to-be-simulated: situation, scenario, and persona — knowledge and motivations, some facts deliberately coloured by the persona's perspective. Private to the agent (or human) playing the user. Invariant: never authored from, or shaped to mirror, the IR — the elicitor's job is to excavate across that wall.
_Avoid_: fact pack (undersells the persona; collides with the answer key), persona pack (too narrow)

**Answer key**:
The modeller-side list of facts the reference net needs, derived from the reference model — the evaluation rubric for what an elicitation should have excavated from a situation pack. Satisfies PRO-99's "written list of all facts necessary to make the net". Sits on the elicitor-team side of the wall; never part of the situation pack.
_Avoid_: fact list (ambiguous with situation-pack content)

**Walking skeleton**:
A prototype that proves a transport or integration end-to-end on the real substrate (e.g. a real Flue agent + web UI) with stubbed internals.

**Logic-prototype**:
A prototype that locks down mechanism semantics (e.g. capture sweeps, settlement) in isolation, without the full host substrate.
