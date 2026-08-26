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
_Avoid_: kernel, core, elicitor (as a shell name — "elicitor" may name the whole system). Exempt name: the package `packages/core` (spec §12.2) — the avoidance applies to "core" as a prose shell name, not to the package path. "Kernel invariants" renamed **harness invariants** (spec §14.1). The former exempt compound "kernel card" is retired with the card (ADR-0006).


**Plugin**:
The innermost shell: target-defining policy, one per **target formalism** (`gherkin`, `sdcpn`) and never per domain — the domain is unknown when a conversation starts. Authored as cells under the harness-owned **keys** (ADR-0007): contract data (`ontology`, `schema`, `patterns`), guidance cells, runbook cells, and the `checks` / `tools` machinery, with `project` / `validate` as code (ADR-0005, ADR-0006). A plugin fills cells and adds no key; what it leaves blank, the **repertoire** supplies. Receives harness capabilities by injection; mechanism stays in the harness.
_Avoid_: extension, pack (a pack is a unit _within_ a plugin), domain plugin, scenario plugin

**Binding**:
The substrate-facing adapter between harness and substrate: implements the harness's named substrate-capability list (tool registration, instruction assembly, persistent state, affordance emission, suspend-for-reply, private model call) in one substrate's dialect. One per substrate; the harness imports no substrate, a binding imports both. Bindings vary in size — each absorbs what its substrate lacks or forbids.
_Avoid_: adapter (generic), integration, wrapper

### Sessions & durability

**Target formalism**:
The artifact family a plugin projects into (Gherkin scenarios, SDCPNs, assurance arguments, BPMN) — the unit a plugin is written for (ADR-0006). The family half of the former bare "target".
_Avoid_: target-domain (retired — "domain" now names the expert's operational system, below), target-paradigm; bare "target" where family/instance is ambiguous

**Domain**:
The operational system the expert knows and the model describes — a packaging line, a truck fleet, a coating plant. Unknown before the conversation starts and discovered during it; never a plugin unit, a key, a row, or a noun in a plugin definition.
_Avoid_: target-domain, use case (as a synonym), scenario (a scenario is assembled from boundary conditions at simulation time)

**Target-document**:
The durable unit sessions attach to: one target formalism, its capture store, and its session history. Named by its purpose — its authoritative state is the capture store plus session logs, never the rendered artifact (renders are derived, cacheable, disposable). Endures independently of any session; never locks — completion is a derived status, not a write gate.
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
An idempotent pass over a settled range of session entries that produces captures. Re-sweeping a range never double-captures. Disambiguation: the capture store's `apply-sweep` command names only the storage half — atomically applying a sweep's proposals; the sweep proper is the capture-producing pass, which does not exist yet (FE-1392).

**Settlement**:
The agent-judged event marking a range of conversation (a vein closing) ready to sweep. Always range-level, never per-question.
_Avoid_: exchange completion

**Interpretation render**:
The harness-owned affordance form showing current captured state — the harness frames envelope semantics; the plugin's renderer definition (typed against its own payload shapes) supplies the content view when provided, with a harness default (plain JSON view) otherwise.
_Avoid_: digest (brunch's form)

### Envelope & packs

**Intermediate representation (IR)**:
The elicited conceptual model a target-document accumulates — the middle of three registers (ADR-0003): typed **assertions** (active captures) are folded by a pure, plugin-declared fold into the **model** (the IR proper — node instances with slot states), which **projections** consume without rereading the transcript. Not a second store — the model is a derivation, recomputable from active captures at any time, never a persistence surface; the rendered artifact is one projection of the model, never the model itself. Defining a plugin's IR means writing its `Kinds` and `Must know` tables (ADR-0006); the fold derives from the kinds' slots. An earlier definition read the capture set itself as the IR (ADR-0003 amends it); a later provisional contract declared typed model-schema / proposal-catalog / fold-table / demand-table objects (ADR-0006 retires that form).
_Avoid_: knowledge store, domain model (as a stored unit), staging area

**Capture envelope**:
The harness-defined, domain-free wrapper around an opaque plugin payload: harness-minted id, evidence spans, epistemic status, confidence, value-xor-absence, alternatives grouping, one `supersedes` link. The hourglass waist. No stored status — envelope status (`active | superseded | retracted`) derives at read time from links and events.

**Evidence span**:
A capture's provenance link: a **quoted excerpt** (primary, the model-facing citation currency) plus a **pointer** (session id + entry range, harness-derived — entry identity is harness-side vocabulary only). Anchors only on true user and user-affordance-payload entries.

**Epistemic status**:
`explicit | inferred | tentative | defaulted | external-lookup` — how a capture's content relates to what the user actually said. Distinct from confidence; excluded from capture identity. One status per capture, coupled structurally to the provenance shape (see Basis) — per-field status is unrepresentable by design (FE-1390; FE-1405's central input, consumed without amendment: the structure that wanted per-field status lives below the status, in proposal interiors).

**Grade**:
How narrow a slot value's interpretation space is — "fewer readings remain." Per-slot orderings read by the fold, promotion, and demands ("this anchor demands the `range` rung"). Never claim strength: that is confidence (`firm | hedged | speculative`, envelope-side, orthogonal by design). Two sources: **form grades** from the standard-interiors library's ladders (e.g. verbal < point < range < quantiles), **composition grades** plugin-declared (e.g. Gherkin's given-only < given-when < full-gwt). Coined by the FE-1405 arc (`docs/specs/plugin-contract.md`, provisional).
_Avoid_: confidence (for narrowing), precision (unqualified)

**Basis**:
The provenance carrier for non-user-grounded captures: `declared-default` or `documented-transformation`, required exactly when epistemic status is `defaulted` / `external-lookup` and structurally exclusive with evidence spans (FE-1390 coined the field for what spec §5/C5 states in prose).
_Avoid_: evidence (for these two statuses — evidence spans cite the user)

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
A unit within a plugin: **ElicitationPack** (retired as a name under ADR-0007 — the guidance and runbook cells replace it) or **ProjectionPack** (`project` + `validate`, optional `reconcile`, annotated shapes, typed loss reports). Packs are shapes-to-fill plus behavioral guidance, per Principle v2.

**Demand row**:
One row of a plugin's `schema` key (the `Must know` table under ADR-0006): a slot on a kind, its required precision, whether "not applicable" is accepted, and why the model needs it. Kind-level only — every node of that kind discovered in conversation is checked against it (ADR-0006).
_Avoid_: demand clause, scope expression, objective row

**Pattern**:
A discretionary, kind-indexed heuristic under a plugin's `patterns` key with a **machine-matchable trigger on node state**: the model situation that triggers it and the question that resolves it. A trigger the harness cannot match against node state (a vague quantifier, an expert who does not know) is guidance — a technique or a movement — not a pattern (ADR-0007). Surfaced by the harness when a node matches the trigger and the relevant slot is unsatisfied; the interviewer decides whether to use it. Never names a domain.
_Avoid_: card, kernel card (retired — ADR-0006 replaced Detects/Goal/Questions/Artifacts cards with pattern rows), technique card

**Runbook**:
The three runbook keys — `kickoff`, `trajectory`, `close` — for one **job** (`construct`, `review and revise`), the harness default for each interleaved with the plugin's cell. The one place procedure is stated; `kickoff` produces a **posture**, `trajectory` names movements by bias, `close` is honest stopping and never the decision to stop (completion rule 15). Jobs are harness vocabulary; a plugin fills one set of runbook cells per job it supports (ADR-0007).
_Avoid_: mandate (as the unit name), mode, workflow

**Key**:
One of the fixed, harness-owned headings of plugin authoring (ADR-0007): the harness defines the concept it names, teaches it, and ships a default; a plugin specialises it in a cell written in the harness's terms and never a domain's. Rendered key → harness default → plugin cell. Keys come in four groups — contract data, guidance, runbook, machinery — and the catalogue is a working set until a co-authoring cycle changes none (decision 9).
_Avoid_: heading (for the authoring unit), section, property (unqualified)

**Repertoire**:
The harness's own filling of every guidance and runbook key — what it teaches every plugin about interviewing — shipped as `packages/repertoire`, rendered by bindings, never imported by a plugin. Admitted by evidence, not by plausibility; never rescoped without run evidence.
_Avoid_: quiver (retired name), strategy library, kernel

**Mechanism type**:
How a guidance key works on the interviewer: a **license** permits what the model would otherwise hedge on; a **technique** is a form of question or move; an **attention** key names what to notice; an **anchor** is a stated judgment to check against. Each guidance key has exactly one (ADR-0007 decision 3).

**Posture**:
The interaction stance `kickoff` produces from the expert's appetite, time, intended use, and tolerance for proposed assumptions — explore, synthesise-and-invite-correction, or propose-and-question-only-high-impact. Varies the trajectory; continuously re-read; never stored (ADR-0007). Not a state machine.
_Avoid_: mode (as a stored state), appetite (for the stance itself)

**Kernel card**:
Retired (ADR-0006). The pack-content unit of elicitation guidance — Detects / Goal / contrastive Questions / Artifacts, brunch `BEHAVIORAL_KERNELS.md` lineage — is replaced by **pattern** rows and by guidance cells; the harness-shipped **generic strategy quiver** named in spec §11.5 is designed as the **repertoire** (ADR-0007), which is not pattern-shaped.
_Avoid_: card, kernel card (in new writing)

**PluginContext**:
The narrow injected context through which a plugin receives harness capabilities (the ask API, envelope, issue queue, sweep bookkeeping). The plugin's entire world at runtime; the four operations remain pure (snapshot-in/deltas-out) regardless.

**Storage port**:
The harness-defined contract for the capture store (atomic sweep application, envelope invariants as store-level refusals), implemented by the binding for its deploy target. Plugins are storage-blind. In code the port's type is `CaptureStore` (`packages/core/src/capture-store.ts`) — grep for that, not for "storage port". Scope includes the **session-log archive** (archive-on-read; spec §9.6): session logs live with the target-document, retained indefinitely — the substrate's conversation store is the live transport copy, never the provenance record.

### Strategic control

**Concern**:
A durable question, invariant, risk, assumption, design axis, or obligation that can govern work
across several temporary activities.
_Avoid_: issue (an issue can be one temporary activity acting on a concern)

**Steering projection**:
A bounded map, issue, proof, or decision activity created to investigate or act on a concern. The
qualified term keeps steering usage distinct from the IR's projection register.
_Avoid_: projection (unqualified in strategic-control prose), concern record

**Operative force**:
What a governing concern presently requires work to preserve, avoid, test, or account for.
_Avoid_: status, priority

**Commission**:
The relationship by which a strategic owner gives a map its intended contribution, governing
concerns, and related-map context.
_Avoid_: request, assignment

**Landing**:
A map's terminal account of its outcome, strategic changes, durable dispositions, affected maps,
and residual uncertainty. Landing precedes reconciliation and does not itself close a commissioned
map or resolve its concerns.
_Avoid_: closure, completion report

**Journey**:
The causal strategic change between a map's commission and landing that future navigation still
needs, excluding operational chronology.
_Avoid_: history, activity log

### September demo

**Demo shell**:
A retired proposal for a one-off September application (FE-1362). ADR-0004 replaced it with two
application-owned surfaces in `hashintel/hash`: `apps/brunch-agent` runs the remote Brunch server,
while `apps/petrinaut-website` owns the user-facing integration. Reusable Brunch and Petrinaut
libraries remain mutually unaware.
_Avoid_: using "demo shell" for the accepted topology

**Artifact boundary**:
The inter-library contract retained by ADR-0004 and amended by ADR-0005: the plugin projects a
versioned net scaffold plus scenario, code obligations, and loss report; the application realizes
the obligations through Petrinaut's client tools and compiler. Applications may compose both
libraries, but neither reusable library consumes the other.
_Avoid_: file handoff (undersells it), integration (generic)

**Code obligation**:
A field-addressed requirement emitted with a projection scaffold for TypeScript that cannot be
derived deterministically. It names the semantic intent, available net symbols, supporting capture
ids, and acceptance checks. The sidecar obligation is authoritative; a matching comment in the
draft code field is human- and agent-facing context, not the machine contract.

**Artifact realization**:
The model-assisted application step that fulfills code obligations through Petrinaut client tools,
repairs against compiler diagnostics, and stops only at deterministic compilation and simulation
gates. It is downstream authoring over a projection, not a fourth IR register or a plugin operation.

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
A build that proves a transport or integration end-to-end on the real substrate (e.g. a real Flue agent + web UI) with stubbed internals. The term names the proof shape, not a disposal policy: the FE-1389 skeleton is retained as a durable CI gate, and its integration test pins runtime semantics nothing else does (do-not-weaken; see the Flue patterns audit).

**Logic-prototype**:
A prototype that locks down mechanism semantics (e.g. capture sweeps, settlement) in isolation, without the full host substrate.
