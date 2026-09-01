# Brunch — domain language

Vocabulary for the brunch elicitation system: an architecture generalizing agentic interviewing
against pluggable elicitation targets.

## Shells

**Substrate** — the agent framework the system is built on (Flue), including deploy target,
storage-port implementation, artifact delivery, and model/provider.
_Avoid_: harness (for Flue), platform, host.

**UI** — whatever affords user interaction: rendering, input, reply transport. Not bound to
GUI/TUI; a chat channel qualifies.
_Avoid_: host, frontend, client.

**Harness** — the generic capability layer: mechanism and orchestration (the conversation loop,
the `ask` API, capture envelope, issue queue, sweep bookkeeping). Injected into plugins as a
narrow context; never owned by them.
_Avoid_: kernel, core (as a prose shell name; the package path `packages/core` is exempt).

**Plugin** — the innermost shell: reusable elicitation and modelling policy for one **domain typology** / **target formalism** pairing, never for a concrete **domain**, situation, or scenario. It owns how the typology is recognized and investigated and how the resulting knowledge is preserved, transformed, and checked for the formalism; mechanism stays in the harness.
_Avoid_: extension, pack (a pack is a unit within a plugin), formalism-only plugin.

**Binding** — the substrate-facing adapter implementing the harness's named substrate-capability
list (tool registration, instruction assembly, persistent state, affordance emission,
suspend-for-reply, private model call) in one substrate's dialect. One per substrate; the harness
imports no substrate, a binding imports both.
_Avoid_: adapter, integration, wrapper.

## Sessions and durability

**Domain typology** — the reusable subject-matter concepts and recurring situations a plugin uses to recognize and investigate what may matter (for example, operational processes or software behavior). It is paired with a **target formalism** but does not contain facts or nouns from a concrete **domain**.
_Avoid_: domain, target-domain, use case, scenario.

**Target formalism** — the artifact family a plugin projects into (Gherkin, SDCPN, assurance arguments, BPMN): the representational half of a plugin's pairing, not the plugin unit by itself.
_Avoid_: target-domain; bare "target" where family vs instance is ambiguous.

**Domain** — the concrete system or situation the person knows and the model describes (a particular packaging line or truck fleet). Unknown before the conversation and discovered during it; never itself a plugin unit. Its facts populate the workpiece, while the plugin's **domain typology** supplies reusable ways to recognize and investigate them.
_Avoid_: domain typology, target-domain, use case.

**Target-document** — the durable unit sessions attach to: one concrete domain under one plugin's domain-typology / target-formalism pairing, plus its capture store and session history. Its authoritative state is the capture store plus session logs, never the rendered artifact (renders are derived and disposable). Endures independently of any session; completion is a derived status, not a write gate.
_Avoid_: spec, workpiece, case, target-output.

**Session** — one substrate conversation: the full log of entries (user, agent, tool calls,
injected state). Per-session state is exactly the evidence log, the swept high-water mark, and the
pending-affordance slot. Sessions go quiet rather than close; any session is resumable.
_Avoid_: sitting, conversation (as a distinct concept).

**Capture store** — the durable, session-independent truth of a target-document: captures,
issues, events. Written only by atomic sweep application; statuses and projections derive from it
at read time.

**Re-entry briefing** — the state message injected when a session resumes after the world moved:
computed facts only (unswept tail, world-moved delta, open issues, pending affordance). Authored
on behalf of the user in the transcript, distinguished from true user entries in the data model,
and never citable as capture evidence.
_Avoid_: sync message, forced re-sweep.

## Interaction

**Affordance** — a structured interactive element (question form, choice strip, questionnaire)
emitted into the stream as a rendered enhancement. Not a state machine; its payload is session
evidence like any other entry.
_Avoid_: exchange, exchange pair, terminal.

**Capture** — extraction of structured evidence (envelope plus plugin-typed payload) from session
entries. Produced by sweeps, never written directly during conversation.
_Avoid_: extraction, harvest.

**Sweep** — an idempotent pass over a settled range of session entries that produces captures;
re-sweeping never double-captures. (`apply-sweep` in the capture store names only the atomic
storage half.)

**Settlement** — the agent-judged event marking a range of conversation ready to sweep. Always
range-level.
_Avoid_: exchange completion.

**Interpretation render** — the harness-owned affordance showing current captured state. The
harness frames envelope semantics; the plugin's renderer supplies the content view, with a
plain-JSON default.

## Envelope and packs

**Intermediate representation (IR)** — the elicited conceptual model a target-document
accumulates, the middle of three registers: typed **assertions** (active captures) fold, by a
pure plugin-declared fold, into the **model** (node instances with slot states), which
**projections** consume without rereading the transcript. A derivation, recomputable from active
captures, never a persistence surface. Defining a plugin's IR means writing its kind and
must-know tables.
_Avoid_: knowledge store, domain model (as a stored unit), staging area.

**Runbook IR** — Mission 3's structurally typed Markdown workpiece: filled during elicitation and
consumed during PN construction, with explicit unknowns, assumptions, conflicts, omissions, and
losses. It is an experiment in an intermediate representation, not yet the typed three-register
**IR** above: it is not folded from captures, does not require kinds/slots/grades, and is not a new
persistence surface.

**Capture envelope** — the domain-free wrapper around an opaque plugin payload: harness-minted id,
evidence spans, epistemic status, confidence, value-xor-absence, alternatives grouping, one
`supersedes` link. The hourglass waist. Status (`active | superseded | retracted`) derives at read
time.

**Evidence span** — a capture's provenance: a **quoted excerpt** (primary, model-facing citation)
plus a **pointer** (session id + entry range). Anchors only on true user and user-affordance
entries.

**Epistemic status** — `explicit | inferred | tentative | defaulted | external-lookup`: how a
capture's content relates to what the user said. Distinct from confidence; excluded from capture
identity; one per capture.

**Grade** — how narrow a slot value's interpretation space is. Per-slot; distinct from confidence
(`firm | hedged | speculative`).

**Basis** — the provenance carrier for non-user-grounded captures (`declared-default` or
`documented-transformation`), required exactly when epistemic status is `defaulted` /
`external-lookup`; structurally exclusive with evidence spans.

**Absence state** — a first-class capture value where an answer would be: `unknown-to-user |
not-yet-decided | not-applicable | explicitly-absent | declined | deferred`. Never null.

**Supersession** — explicit correction, single-hop over active heads only: the creation-time
`supersedes` link (sweep-time) and the resolution record (issue-time). Superseded captures stay
visible.

**Resolution record** — the capture-store event that alone closes a `conflicting` issue (and, with
no successor, expresses retraction). Must cite the true user's utterance.

**Issue** — typed, stored backpressure: `missing | ambiguous | conflicting | invalid |
unsupported | unmapped | low-confidence`. Produced by plugin ops (payload level) or the harness
(envelope level). Closes only explicitly.

**Advisory** — a computed, ephemeral, non-blocking fact surfaced to the agent. Never stored; never
gates anything.

**Pack** — a unit within a plugin: **ProjectionPack** (`project` + `validate`, optional
`reconcile`, annotated shapes, typed loss reports). The guidance-and-runbook cells replaced the
retired ElicitationPack.

**Demand row** — one row of a plugin's must-know table: a slot on a kind, its required precision,
whether "not applicable" is accepted, and why the model needs it. Kind-level only.

**Pattern** — a discretionary, kind-indexed heuristic under a plugin's `patterns` key: a machine trigger (declared kind, optionally one unsatisfied demanded slot), `when` text, and an `ask` question. It may use the plugin's domain typology but never names a concrete domain.

**Runbook** — the structurally typed, human-readable definition for eliciting and constructing through one plugin's **domain typology** / **target formalism** pairing. It pairs universal repertoire teaching with the plugin's purpose, investigation typology, target guidance, IR template, transformation knowledge, completion, and checks in a nested Markdown hierarchy. `kickoff`, `trajectory`, and `close` are lifecycle regions inside the runbook, not its whole definition; the existing YAML field named `runbooks` keeps that narrower code-level meaning. Structural headings do not require captures or IR contents to use closed semantic types. Mission 3 delivers the first runbook through one Flue skill and disclosed resources; that packaging is not part of the term's definition.

**Key** — one fixed, harness-owned heading of the YAML plugin/repertoire precursor: the harness
defines, teaches, and ships a default; a plugin specialises it in a cell. Four groups: contract
data, guidance, runbook, machinery. Rendered key → harness default → plugin cell. Mission 3 mines
this authoring structure as evidence; it does not restore the renderer as the runbook architecture.

**Repertoire** — generally applicable elicitation concepts, directives, procedures, judgment activations, caveats, and failure knowledge: how an expert-knowledge interview goes well regardless of domain typology or target formalism. The current YAML is the harness's evidence-admitted filling of guidance and lifecycle keys behind core's guarded `./prompts` subpath. A rendered runbook may incorporate this teaching without using that runtime.

**Mechanism type** — how a guidance key works on the interviewer: a **license** permits what the
model would hedge on; a **technique** is a form of question or move; an **attention** key names
what to notice; an **anchor** is a judgment to check against. Each guidance key has exactly one.

**Posture** — the interaction stance `kickoff` produces from the expert's appetite, time, intended
use, and tolerance for proposed assumptions. Varies the trajectory; continuously re-read; never
stored. Not a state machine.

**PluginContext** — the narrow injected context through which a plugin receives harness
capabilities. Its entire world at runtime; the four operations stay pure.

**Storage port** — the harness-defined contract for the capture store (atomic sweep application,
envelope invariants as store-level refusals), implemented by the binding. Plugins are
storage-blind. In code its type is `CaptureStore` (`packages/core/src/evidence/capture-store.ts`).

## Simulation and evaluation

**Situation pack** — the interviewee-side bundle defining a user-to-be-simulated: situation,
scenario, persona. Private to whoever plays the user; never authored from or shaped to mirror the
IR.
_Avoid_: fact pack, persona pack.

**Answer key** — the modeller-side list of facts the reference net needs. Sits on the
elicitor-team side of the wall; never part of the situation pack.

**Walking skeleton** — a build proving a transport or integration end-to-end on the real substrate
with stubbed internals.

**Logic-prototype** — a prototype locking down mechanism semantics in isolation, without the full
host substrate.
