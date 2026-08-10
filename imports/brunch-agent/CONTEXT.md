# Elicitation Kernel

Vocabulary for the elicitation-kernel effort: a standalone architecture generalizing brunch's elicitor into agentic interviewing against pluggable elicitation targets.

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
_Avoid_: kernel, core, elicitor (as a shell name — "elicitor" may name the whole system)

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

**Walking skeleton**:
A prototype that proves a transport or integration end-to-end on the real substrate (e.g. a real Flue agent + web UI) with stubbed internals.

**Logic-prototype**:
A prototype that locks down mechanism semantics (e.g. capture sweeps, settlement) in isolation, without the full host substrate.
