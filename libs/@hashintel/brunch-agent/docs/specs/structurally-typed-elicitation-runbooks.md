# Structurally typed elicitation runbooks

Status: **accepted design input for Mission 3**. Live execution authority remains
[`MISSION.md`](../../MISSION.md). This specification records the shared meaning of “runbook” and
the first architecture to test; it is not evidence that the design works. Reorient the mission if
the real Flue path contradicts it.

Unless explicitly identified as the existing typed three-register IR, **IR** below means the
**runbook IR**: Mission 3's structurally typed Markdown workpiece.

## Decision report

The following decisions were reached before implementation.

1. **A runbook is the model-facing definition of an elicitation and modelling lifecycle, not only
   its kickoff / trajectory / close instructions.** Those lifecycle stages are one nested part of
   the runbook.
2. **Mission 3 optimizes for structural typing and treats semantic typing circumspectly.** The
   Markdown hierarchy and repeated entry shapes may be strict while their contents remain prose.
   Mission 3 does not require captures, IR fields, or runbook entries to participate in a closed
   semantic type system.
3. **The reusable split is universal repertoire versus target-formalism runbook.** Universal
   teaching explains generally useful elicitation judgment. A target-formalism runbook says what
   that judgment should attend to, pursue, preserve, transform, and check for SDCPN modelling. It
   is not keyed to a concrete situation such as a truck fleet or semiconductor fab.
4. **The two authored layers may merge into one model-facing projection.** Mission 3 will author
   that first projection directly. It will not build a compiler or revive the old plugin renderer
   before a second real consumer creates strain.
5. **One `ChatAgent` owns the lifecycle.** Elicitation, IR maintenance, PN generation, and
   validation are phases and capabilities of one agent, not separate agents.
6. **One Flue skill carries the runbook.** A small always-on instruction routes to one mounted
   runbook skill. The skill holds the shared lifecycle procedure and progressively discloses bulky
   or phase-specific reference as supporting resources. This does not create a skill catalog.
7. **Elicitation and PN construction stay separated in the information hierarchy.** They may ship
   in the same skill package, but construction material is read only when the lifecycle reaches
   construction. During elicitation the agent works in the expert's vocabulary and maintains the
   IR; it does not interview through places, transitions, arcs, or colours.
8. **The runbook IR is the shared workpiece.** It is structurally typed Markdown filled during
   elicitation and consumed by PN generation. It is not the existing typed three-register IR,
   Mission 2's capture store, a fold result, or a persisted typed-claim register.
9. **Completion and verification are first-class runbook content.** The runbook states what enough
   looks like and how to check the IR and generated PN, borrowing Jetty's job / done / check
   discipline without copying Jetty's runtime model.
10. **Headings work because this agent is taught their meanings.** Markdown hierarchy is not
    assumed to invoke an undocumented schema already known by the model. Whether later code
    validates or composes the hierarchy is deferred.

Rejected first shapes:

- the narrow definition of runbook as only `kickoff`, `trajectory`, and `close`;
- one runbook per concrete scenario or operational domain;
- reviving closed kinds, slots, proposal types, precision ladders, fold tables, or mechanically
  fired completion rules in order to author Mission 3;
- multiple agents for interviewing and PN generation;
- a growing catalog of micro-skills;
- a new runbook projection engine before direct Markdown authoring has been exercised;
- an undifferentiated large system prompt as the target architecture;
- relying on supposedly pre-trained semantics of particular heading names.

Deferred decisions:

- the final heading catalogue and exact resource boundaries;
- whether repeated use earns an automated repertoire + target-formalism projection;
- which, if any, runbook or IR concepts later become semantically typed;
- whether later lifecycle phases warrant distinct skills or agents under observed strain;
- canvas mutation and programmatic PN loading;
- a capture-to-runbook or capture-to-IR join.

## Problem statement

Mission 3 originally said to mount a “comprehensive runbook and IR template,” while the repository
used *runbook* at incompatible scopes. The inherited glossary gave the word only to three lifecycle
keys; `CONTEXT.md` now carries the broader definition settled here. Earlier YAML artifacts
distribute the broader agent definition among repertoire, guidance, patterns, contract data,
runbook cells, and machinery.

The old system contains valuable teaching compiled from interviewing literature, baseline runs,
and SDCPN modelling research. It also concentrates semantic judgment in typed capture mapping,
kind/slot assignment, folding, and completion machinery. The resulting condition-5 path produced
ordinary question turns on the order of minutes. Mission 3 must recover the teaching and the
legible authoring shape without treating that semantic machinery as the destination.

The desired experiment is:

> Can one Flue agent follow a thoroughly structurally typed, human-readable runbook; maintain a
> structured but not strictly semantically typed IR; and use it to generate a validatable Petri
> net without the old typed-capture kernel?

## Sources already earned

### Universal elicitation teaching

The harness repertoire and its research sources already establish useful general material:

- objectives before structure;
- question-relative completeness;
- appetite, budget, boundary, horizon, and accuracy;
- concrete incidents before generalization;
- how to elicit quantities, ranges, spreads, cues, exceptions, and practiced rules;
- how to handle contradiction, ambiguity, burden, and disagreement;
- licenses for proposing, deferring, batching, and pressing without trapping;
- smells, rabbit holes, and failure modes;
- kickoff, trajectory, close, and honest partial delivery.

Primary local syntheses include
[`elicitation-strategy-literature.md`](../reference/research/elicitation/elicitation-strategy-literature.md),
[`frontier-model-elicitor-failure-catalogue.md`](../reference/research/elicitation/frontier-model-elicitor-failure-catalogue.md),
and the current [`repertoire.yaml`](../../packages/core/src/repertoire.yaml). Their content is
source material; Mission 3 does not restore the repertoire runtime.

### Target-formalism teaching

The SDCPN material already identifies reusable typologies of modelling situations rather than
concrete scenario facts:

- goals, constraints, measures, and thresholds;
- process boundaries, triggers, approvals, and prerequisites;
- actors, locations, resources, and their consequential properties;
- activities, inputs, outputs, duration, success, failure, retry, and branching;
- consumed, reserved, and read-only inputs;
- shared-resource contention and practiced policies;
- discrete events, continuous dynamics, mode changes, thresholds, and probabilistic outcomes;
- recurring PN construction patterns for timed work, branching, and related structures;
- formalism-specific caveats, failure modes, losses, and validity checks.

The current [`plugin-sdcpn/plugin.yaml`](../../packages/plugin-sdcpn/plugin.yaml), its archived CPS
guidance and replays, and the independently written process-to-PN notes converge on this shape.
The archived guidance also records the important correction that its former `domain` tag was a
mis-tag: the useful cards describe model-situation types that lift to the target-formalism level
without naming an operational domain.

### External resonance

Jetty's runbook model contributes three useful properties: a human-readable unit, an explicit
outcome, and self-checking. Its concise formula—skill plus definition of done plus verification—
is adapted here rather than copied.

OpenAI's Realtime prompting guide independently demonstrates that an agent definition benefits
from explicit behavioral heading families. Its reference structure names Role and Objective,
Personality and Tone, Language, Reasoning, Message Channels, Preambles, Verbosity, Tools, Unclear
Audio, Entity Capture, Long Context Behavior, and Escalation. Mission 3 does not copy that flat
catalogue: role/objective, reasoning, tools, capture, long-context behavior, and escalation inform
the runbook responsibilities above; presentation and channel concerns remain universal or
shell-facing; unclear audio waits for the voice path. The list is evidence for legible
organization, not evidence that models secretly parse a fixed heading schema.

## Lexicon

| Term | Definition |
| --- | --- |
| **Universal repertoire** | Generally applicable elicitation concepts, directives, procedures, judgment activations, caveats, and failure knowledge. It teaches *how to elicit* without naming a target formalism or concrete scenario. |
| **Target-formalism runbook** | Human-readable guidance for eliciting and constructing one artifact family, initially SDCPN: what to investigate, notice, deepen, preserve, transform, and check. |
| **Rendered runbook** | The model-facing combination of universal repertoire and target-formalism content, organized by a known Markdown hierarchy. In Mission 3 it is authored directly rather than compiled. |
| **Runbook skill** | The one Flue skill package that delivers the rendered runbook, lifecycle procedure, IR template, construction guidance, and checks through progressive disclosure. |
| **Legacy YAML runbook cells** | The existing schema field named `runbooks`, containing `kickoff`, `trajectory`, and `close` cells per job. It keeps its code-level name but represents only the lifecycle region of the broader runbook concept. |
| **Structural typing** | Required heading families, nesting, repeated entry shapes, and completion fields whose contents may remain prose. Structure determines where meaning belongs without closing its semantic vocabulary. |
| **Semantic typing** | Closed kinds, slots, values, proposal types, grades, firing predicates, or fold rules that require content to be classified into a formal semantic system. Deferred in Mission 3. |
| **Runbook IR** | The structurally typed Markdown workpiece filled from the conversation and consumed by PN generation. It can represent unknowns, assumptions, caveats, and unresolved questions without typed capture claims. It is an experiment in an intermediate representation, distinct from the existing typed three-register **IR**. |
| **Lifecycle phase** | A mode of work performed by the same agent: orient, elicit, maintain/review the IR, construct the PN, and check/deliver. A phase selects relevant runbook material; it is not a separate agent. |
| **Situation typology** | A recurring model-relevant shape—timed work, probabilistic outcome, contended resource, threshold trigger—applicable across concrete operational domains. |

## Architecture

### One agent, one lifecycle

The production `ChatAgent` remains the sole model-facing agent. It has access to the knowledge and
tools required across the lifecycle. Phase separation is informational and procedural; it does not
introduce a handoff, a second conversation, or a second durable identity.

The lifecycle is allowed to loop. PN construction or checking may expose an IR gap, after which the
same agent resumes elicitation and amends the IR before regenerating. The runbook must describe
that return path without inventing a state machine.

### Two authored knowledge layers

The universal repertoire and target-formalism runbook remain conceptually separate because their
ownership and reuse differ:

```text
universal repertoire: how elicitation goes well
+
target-formalism runbook: what SDCPN elicitation and construction require
=
rendered runbook: what this agent reads
```

Mission 3 authors the rendered result directly. During co-authoring, material may migrate upward
when it proves generally useful, or downward when a supposedly universal instruction depends on a
formalism. This migration is an editorial decision informed by use, not a runtime dispatch system.

Concrete situation facts never migrate into either authored layer. They populate the IR instance.

### Flue information hierarchy

The first implementation uses Flue's native surfaces.

#### Always-on instruction

Keep only what every lifecycle phase needs:

- the agent's identity and objective;
- the requirement to activate and follow the runbook skill;
- the shared workpiece role of the IR;
- the fact that this is one looping lifecycle;
- stable transport and client-tool-result instructions.

Universal does not mean always loaded. Bulky universal reference belongs in the skill when it is
needed only during this modelling lifecycle.

#### Skill instructions

One skill body carries the primary procedure:

- the lifecycle and its phase transitions;
- which supporting resource to read for each phase;
- clear completion criteria for each phase;
- shared evidence and vocabulary boundaries;
- how to return from construction/checking to elicitation;
- how to produce the best useful partial result when the user stops.

This is the in-file step tier from the writing-for-agents hierarchy.

#### Supporting resources

Supporting resources carry disclosed reference. The first package needs these conceptual roles;
exact filenames and boundaries may change under observed sprawl:

1. **Elicitation teaching** — merged universal repertoire and SDCPN-specific investigation,
   heuristics, patterns, caveats, and failure modes.
2. **IR template** — the workpiece and instructions for maintaining it.
3. **PN construction** — transformation principles and reusable SDCPN construction patterns.
4. **Checks** — IR sufficiency, PN structural validity, loss review, and delivery criteria.

Flue already keeps these resources lazy and exposes them through `read_skill_resource`. Mission 3
must use that affordance rather than build a bespoke loader.

#### Tools

Tools remain separate executable capabilities mounted on the same agent. A skill teaches when and
why to use them; a tool performs application code. Mission 3 does not add canvas mutation tools.
PN parsing/validation may remain in the headless drive if that is the smallest real boundary.

### Elicitation and construction separation

The runbook contains both interviewing and PN-construction knowledge, but not at the same
information tier.

During elicitation:

- ask in the expert's vocabulary;
- use objectives and concrete cases to determine depth;
- recognize situation typologies without proposing PN internals as the user's account;
- maintain the IR, including uncertainty and open questions.

During construction:

- read the construction resource;
- infer PN structure from the filled IR;
- apply reusable transformation patterns;
- name approximations, omissions, defaults, and unrepresentable material;
- validate the generated PN.

The runbook IR is the seam. Construction guidance must not cause schema-shaped questioning, and
the interview transcript must not become the generation input once the runbook IR is available.

## Structural schema

The first rendered runbook is structurally typed by heading family and nesting. The exact titles
may evolve during Mission 3, but all responsibilities below must have a legible home.

```text
Purpose and outcome
├─ what the formalism is for
├─ what the resulting model should answer
└─ what it must not claim

Lifecycle and elicitation approach
├─ posture, appetite, budget, boundary, and horizon
├─ questioning and deepening
├─ evidence and uncertainty
├─ prioritization and return paths
└─ stopping and partial delivery

What to investigate
├─ goals, constraints, measures, and thresholds
├─ process boundary, triggers, and prerequisites
├─ participants, locations, and resources
├─ activities, inputs, outputs, and resource usage
├─ flow, branching, retries, failures, and recovery
├─ time, quantities, and stochastic behavior
├─ policies, exceptions, and practiced rules
└─ validation criteria

Target-formalism guidance
├─ lenses and heuristics
├─ situation typologies and patterns
├─ caveats and rabbit holes
└─ failure modes

Intermediate representation
├─ template
├─ meaning of each section
├─ evidence and uncertainty conventions
└─ unknowns, assumptions, and unresolved questions

PN construction
├─ mapping principles
├─ reusable construction patterns
├─ inference and approximation
├─ projection loss
└─ worked examples

Completion and checks
├─ elicitation sufficiency
├─ IR checks
├─ PN validity
├─ loss and uncertainty review
└─ stopping outcomes
```

### Repeated guidance entries

A repeated item can be structurally constrained without assigning semantic enums. A situation
pattern should make the following questions answerable, using nested headings or an equivalently
legible shape:

```text
Pattern name
├─ notice when
├─ information needed
├─ questions that may help
├─ record in the IR
├─ transform to PN, when applicable
├─ caveats
└─ checks
```

Not every entry needs every child. Structural validation should require only children whose absence
would make that entry unusable. Mission 3 should begin with authoring discipline and observable
agent use; it should not build a general schema validator unless drift appears immediately.

### Runbook IR template

The runbook IR template is organized enough that:

- a reader can locate each kind of knowledge without interpreting a bag of notes;
- the agent can update one section without rewriting the whole document;
- unknown, tentative, assumed, conflicting, and intentionally omitted information remain visible;
- construction can consume it without rereading the conversation;
- it does not require every statement to name a closed kind, slot, grade, or proposal type.

The first template should resemble the investigation structure where that improves legibility, but
it must not turn the interview into a questionnaire. Conversation follows the expert's thread; the
IR is organized after or alongside that conversation.

## Structural typing boundary

Mission 3 admits:

- known Markdown heading families;
- nested section responsibilities;
- repeated named entries with stable child headings;
- explicit objectives, outputs, completion criteria, checks, unknowns, and losses;
- prose rules for recognizing and transforming situation typologies;
- parseable PN JSON as the generated artifact.

Mission 3 does not admit merely to make the runbook work:

- a closed ontology-kind catalog;
- kind/slot demand rows;
- a precision ladder that gates completion;
- capture proposal types;
- machine-indexed `on` / `slot` pattern triggers;
- a `firesWhen` enum;
- a capture-to-model fold;
- typed completion algebra;
- a new persistence surface;
- an automated repertoire/runbook compiler.

If PN generation proves impossible without one of these, that is evidence at the fog-line. Surface
which semantic commitment is actually required rather than restoring the old stack as a unit.

## Mission 3 experiment

### Throughline

One headless run exercises the production `ChatAgent`:

```text
createFlueClient
→ send initial modelling request
→ ChatAgent activates one runbook skill
→ ChatAgent reads elicitation teaching and runbook IR resources
→ (driver send → wait → history) × interview turns
→ recover the filled structured runbook IR
→ driver sends construct-from-IR request
→ ChatAgent reads PN-construction guidance and checks
→ ChatAgent returns PN JSON
→ driver wait → history
→ parse / validate with Petrinaut
```

Activation and resource reads are model tool calls inside turns initiated by `send`; the headless
driver does not invoke them before dispatch. The runbook package is the main iteration surface. Edit it in response to observed misses, rerun,
and record which structural or instructional change affected the result.

### What this establishes

A successful run establishes that one agent can use a structurally typed runbook and runbook IR
over the real Flue path to produce a validatable PN. It does not establish:

- that the heading catalogue is final;
- that progressive disclosure is optimal;
- that semantic typing is unnecessary forever;
- that the IR is suitable for automated capture;
- that the generated PN is correct for every scenario;
- that canvas tools or a product workflow exist.

## Verification design

### Structural checks

- One skill is mounted; no catalog growth is required.
- The skill description names the whole modelling-lifecycle trigger.
- Activation yields the lifecycle procedure.
- Supporting resources are listed and readable through Flue's native resource affordance.
- Each required runbook responsibility and IR section has one authoritative home.
- Universal and target-formalism material are distinguishable by content and provenance even where
  rendered together.

### Behavioral checks

- The agent activates the runbook on the production path.
- During elicitation it reads elicitation/IR material and speaks in the expert's vocabulary.
- PN construction material is not needed to frame ordinary interview questions.
- The conversation produces a recoverable filled IR without writing Mission 2's capture store.
- The construction phase consumes the IR rather than rereading the transcript as its primary
  model.
- A gap discovered during construction can route the same agent back to elicitation.
- PN output parses or validates through the Petrinaut boundary named by the mission.
- The result names consequential unknowns, assumptions, approximations, and projection losses.

### Evaluation loop

The runbook is improved empirically:

1. run a fixed elicitation situation through the headless path;
2. inspect the conversation, resource reads, filled IR, PN, and checks;
3. classify the miss as universal teaching, target-formalism guidance, IR structure, construction
   guidance, or tool/runtime behavior;
4. edit the single owning location;
5. rerun without adding semantic machinery unless the miss requires it.

A fluent conversation is not the oracle. The observable outputs are the resource path taken, the
IR content, the generated PN, validation results, and visible losses.

## Acceptance criteria

Mission 3's runbook design is successfully exercised when:

1. The production `ChatAgent` remains one agent and mounts one real runbook skill.
2. Its always-on instruction is a concise router and invariant set, not the full runbook.
3. The skill progressively exposes lifecycle procedure, elicitation teaching, IR template, PN
   construction guidance, and checks using Flue's native skill/resource surfaces.
4. The runbook has the structural responsibilities defined above and incorporates both universal
   elicitation teaching and SDCPN target-formalism content.
5. A headless conversation yields a recoverable, structured-but-not-strictly-semantically-typed IR.
6. The same agent can use that IR and disclosed construction guidance to produce PN JSON.
7. Petrinaut accepts the output at the parser/validation boundary selected by the mission.
8. The path uses no sweep tool, capture-store write, plugin runtime, typed fold, or canvas mutation
   tool.
9. Evidence records where the first runbook structure helped, failed, or created attention strain.

## Constraints and non-goals

- One live mission and one model-facing agent.
- One runbook skill; no speculative skill catalog.
- Flue's system instruction, skill activation, supporting-resource, and tool happy paths.
- Direct Markdown authoring before automated projection.
- Target-formalism content, not concrete scenario content.
- Expert vocabulary during elicitation; PN vocabulary during construction.
- Structurally typed IR; no requirement for typed capture claims.
- No join to Mission 2's capture store.
- No revival of plugin-gherkin, plugin-sdcpn runtime, repertoire runtime, fold, completion
  controller, or `brunch_ask` as the teaching vehicle.
- No separate agent, subagent, workflow engine, TUI, second server, or canvas mutation surface.
- No claim that the existing YAML contracts remain architecturally authoritative. They are design
  evidence and source material.

## Assumptions

| Assumption | Confidence | Implicated decision | Validation |
| --- | --- | --- | --- |
| Stable Markdown hierarchy improves agent attention and authoring legibility. | medium | Structural typing as the main Mission 3 lever. | Observe use and omissions across fixed reruns. |
| One skill description can reliably route the whole lifecycle. | medium | One skill rather than a catalog. | Inspect activation and misses on the production path. |
| Flue supporting resources provide sufficient phase disclosure. | high for mechanism, medium for behavior | One package with lazy reference. | Observe `read_skill_resource` use and phase relevance. |
| Separating construction reference reduces schema-shaped interviewing. | medium | Elicitation/construction resource boundary. | Compare interview questions with resource reads and PN vocabulary leakage. |
| A structured prose IR contains enough information for inferred PN generation. | low-to-medium | Deferral of strict semantic typing. | Generate and validate the Mission 3 PN. |
| Universal versus target-formalism ownership can be discovered through co-authoring. | medium | Direct merged authoring before a compiler. | Record entries that migrate after real use. |
| One agent can loop between elicitation and construction coherently. | medium | Single-agent lifecycle. | Exercise at least one construction-discovered gap and return path if the fixed scenario exposes one. |

## Resolved questions

**Is the runbook only kickoff / trajectory / close?**  
No. Those are lifecycle subheadings inside a broader agent definition.

**Is the runbook universal or target-specific?**  
The universal repertoire and target-formalism content have separate authorship semantics and may
merge in the rendered runbook. Concrete scenario facts belong in the IR instance.

**Must the runbook revive the typed plugin contract?**  
No. Mission 3 preserves structural discipline and defers closed semantic typing.

**Does interviewing need a different agent from PN generation?**  
No. One agent owns the lifecycle; information disclosure distinguishes phases.

**Should everything live in the system prompt?**  
No as the target shape. The system instruction is the concise router; one skill and lazy resources
protect the information hierarchy. A large prompt remains a possible diagnostic baseline, not the
architecture to optimize around.

**Does one skill violate progressive disclosure?**  
No. Flue progressively discloses the skill body and each supporting resource separately.

**Are there two runtime projections?**  
Not initially. One skill package can contain phase-specific resources. Automated projections are
deferred until authored repetition or drift earns them.

**How is “done” represented without typed completion algebra?**  
Through explicit runbook completion criteria and checks, exercised against the IR and PN. Their
adequacy is an experiment result, not assumed proof.
