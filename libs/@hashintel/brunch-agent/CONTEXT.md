# Brunch — domain language

Vocabulary for Brunch, an elicitation system in which a universal core and formalism-specific plugins compose one model-facing agent that interviews a person, maintains a recoverable account of what they know, and constructs a target representation from it.

## Language

### Package authority

**Core**:
The universal authority: context-, domain-, editor-, and formalism-independent elicitation semantics, the always-on prompt, the `elicitation` capability, and the evidence contracts. Owns nothing that names a formalism or a concrete situation.
_Avoid_: harness, kernel

**Plugin**:
A contribution bundle pairing one **domain typology** with one **target formalism**: the prompts, skills, tools, and mounting it has earned, and nothing for symmetry. It names concepts from its typology, never facts or nouns from a concrete **domain**.
_Avoid_: extension, pack, formalism-only plugin, symmetric inventory

**App**:
The directive-marked registration and host-composition point that selects core and plugin contributions, carries transport and client-tool results, and owns deployment diagnostics. It owns no modelling semantics.
_Avoid_: host, shell, server (as a shell name)

**Binding**:
The substrate-facing adapter that implements core's evidence mechanics in one substrate's dialect. Core imports no substrate; a binding imports both.
_Avoid_: adapter, integration, wrapper

**Transport**:
The wire projection between a **UI** and the agent: ingress validation and reply encoding, never a binding or substrate import.

**Substrate**:
The agent runtime the system is built on (Flue), including its skill packaging, tool registration, persistence, and model provider.
_Avoid_: harness (for Flue), platform, host

**UI**:
Whatever affords user interaction: rendering, input, and reply capture. A chat panel qualifies.
_Avoid_: frontend, client, host

### Model-facing primitives

**Prompt**:
Always-present content carrying identity and the invariants that must bind for the whole mounted lifetime of a contribution. Core returns the universal prompt; a plugin may add a compact **append**.
_Avoid_: system prompt fragment, instructions (as a unit name)

**Append**:
A plugin's optional always-on prompt contribution: scoped specialization and pre-activation guardrails, earned only by invariants that apply across all of its skills. Never a second persona and never skill procedure.

**Skill**:
Reusable procedure and judgment for a recognizable job or capability, disclosed progressively: one catalog line, then instructions on activation, then resources on demand. A skill may direct activation of another skill.
_Avoid_: runbook, loader, workflow

**Capability skill**:
A skill whose method is meaningful independently of any job, such as `elicitation`. Core's contributions are capability skills.

**Job skill**:
A skill that accomplishes one recognizable user outcome, such as `sdcpn-modelling`, owning its workpiece, target review and revision, construction, checks, and tool orchestration, and activating capability skills when it needs them. A plugin contributes the smallest set of job skills its real jobs earn.
_Avoid_: task skill, lifecycle skill, one-skill-per-plugin

**Resource**:
A supporting file packaged inside a skill and read only when its branch requires it. A **reference** carries detailed teaching; a **template** carries a recording shape.
_Avoid_: include, transclusion

**Tool contract**:
The semantics and constraints of one executable operation: inputs, locally expressible preconditions, outputs and failures, and exactly what evidence a result establishes. Ownership follows semantic capability, not where execution happens.
_Avoid_: function, action

**Disclosure state**:
How far a contribution has reached the model: always present, catalogued, activated, resource-read, or callable. Independent of package authority and of primitive type.

### Elicitation

**Elicitation**:
Acquiring and improving an epistemically responsible account from a person through adaptive conversation: recognizing cues, choosing the next probe, handling correction and contextual variation, preserving authorship and uncertainty, and judging when evidence suffices. Excludes target review, target mutation, construction, and tool execution.
_Avoid_: interviewing (as the whole), intake, questionnaire

**Domain typology**:
The reusable subject-matter concepts and recurring situations a plugin uses to recognize and investigate what may matter, such as operational processes or software behavior. Paired with a **target formalism**; never contains facts from a concrete **domain**.
_Avoid_: domain, target-domain, use case, scenario

**Target formalism**:
The artifact family a plugin constructs into, such as SDCPN or Gherkin. The representational half of a plugin's pairing, not the plugin itself.
_Avoid_: target-domain, bare "target" where family and instance are ambiguous

**Domain**:
The concrete system or situation the person knows and the model describes. Unknown before the conversation and discovered during it; its facts populate the **workpiece**, never a plugin.
_Avoid_: domain typology, use case

**Register**:
One of five semantic addresses classifying what elicitation guidance does: Directives, Recognition, Operations, Coverage, Verification. Registers are not phases, question order, skills, schemas, or file topology.

**Workpiece**:
The recoverable, domain-primary, cold-readable account the agent maintains during elicitation and revision and consumes during construction. Each operational claim has one authoritative home, with its evidence and epistemic treatment beside it.
_Avoid_: runbook IR, IR, intermediate representation, target-document, spec, requirements graph

**Epistemic annotation**:
A distinction attached to a workpiece claim where it carries information: expert evidence, working account, agent inference, assumed, unknown, not yet asked, declined, deferred, conflict, correction, contextual coexistence, omitted, loss. Optional labels, not mandatory fields or a closed type system.
_Avoid_: slot, grade, typed claim

**Correction**:
A later account that replaces an earlier one, leaving one active claim with enough history to explain the change. Distinguished from **contextual coexistence** before any reconciliation.

**Contextual coexistence**:
Differing accounts that each hold under a selecting condition such as person, time, mode, direction, or policy regime. Both remain active beside their conditions; never averaged.
_Avoid_: conflict (when the selector is known)

**Unknown**:
Asked, and the person does not know. Distinguished from **not yet asked**, which is relevant and identified but not yet addressed. Absence alone establishes neither.

**Construction**:
Selecting and recording a target representation from the current workpiece through mounted tools. Construction may infer a representation from recorded meaning; it may not invent operational facts. Losses it opens are construction findings, not new evidence.
_Avoid_: generation, realization, projection (reserved for future automatic traceable projection)

**Construct-only execution**:
The runtime branch in which the workpiece is the complete input and no interview occurs; a consequential gap is reported as a re-entry question, never asked or invented.

**Evidence level**:
One of three non-collapsible claims about a constructed artifact: tool-schema acceptance, agent-reviewed structural correspondence, and behavioral execution or stronger analysis. Report every level reached; none implies the next.

### Evidence and capture

**Session**:
One substrate conversation: the full log of user, agent, tool, and injected entries. Sessions go quiet rather than close.
_Avoid_: sitting, conversation (as a distinct concept)

**Capture**:
Mechanically extracted source evidence from a settled range of session entries: an immutable, quote-anchored, domain-opaque envelope. Produced only by a sweep and never written during conversation.
_Avoid_: extraction, harvest, typed claim

**Capture envelope**:
The domain-free wrapper around an opaque payload: minted id, evidence spans, epistemic status, confidence, value or absence, and one supersedes link. Status derives at read time.

**Evidence span**:
A capture's provenance: a quoted excerpt plus a pointer to the session entry range. Anchors only on true user entries.

**Capture store**:
The durable, session-independent record of captures, issues, and events, written only by atomic sweep application.
_Avoid_: knowledge store, database (as a concept)

**Sweep**:
A harness-owned, idempotent pass over a settled entry range that produces captures; re-sweeping never double-captures. The interviewer neither receives nor schedules it.

### Suspended concepts

**Affordance**:
A structured interactive element such as a question form or choice strip emitted into the stream, whose reply is session evidence. Suspended; re-enters only with a complete vertical path from model invocation to rendered reply.
_Avoid_: exchange, terminal

**Structured question**:
A core-owned operation for single-select, multi-select, or questionnaire forms, rendered by a **UI** without acquiring semantic ownership. Suspended re-entry candidate.

**Settlement**:
The agent-judged event marking a range ready to sweep. Suspended with the interviewer-scheduled sweep.
_Avoid_: exchange completion

**Observer**:
A hypothetical background consolidation mechanism over captured evidence. Absent by default; re-enters only under observed foreground revision strain.
_Avoid_: fold, background agent

### Evaluation

**Situation pack**:
The interviewee-side bundle defining a simulated person: situation, scenario, persona. Private to whoever plays the user and never shaped to mirror the workpiece.
_Avoid_: fact pack, persona pack

**Answer key**:
The modeller-side list of facts a reference model needs. Stays on the evaluation side, never inside interviewer or interviewee inputs.

**Control**:
The immutable comparison population: Mission 3's frozen prospective campaign and its exact source revision. Never written to, relocated, or aggregated with later runs.
_Avoid_: baseline (when it would be modified or extended)

**Frozen instrument**:
The exact committed prompts, skills, resources, built bundle, case, ruler, and protocol whose hashes fix a campaign. Changing one byte is a new instrument.

**Campaign**:
A versioned protocol run of the frozen instrument through the production agent, retaining raw traces, manifests, and invalid members separately from graded workpieces.
