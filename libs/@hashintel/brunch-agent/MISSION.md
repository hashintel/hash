# Mission 3 — structurally typed runbook to headless PN

## Status

Live. This file is execution authority.

Required design input:
[`docs/specs/structurally-typed-elicitation-runbooks.md`](docs/specs/structurally-typed-elicitation-runbooks.md).
The specification defines the meaning and first architecture of the runbook; this mission decides
what to build and prove. If the real path contradicts the design, stop and surface the evidence
rather than satisfying the document by construction.

Later concerns are clustered in [`MISSION.next.md`](MISSION.next.md). That file is the canonical
draft of upcoming work, not a mission; do not implement it. Host-continuity work, Petrinaut
read/write tools, typed IR maps, observer-triggered sweeps, and any join to Mission 2's capture
store are not this mission.

A now-retired side quest authorized one bounded Mission 3 remediation: a construct-only headless
conversation may mount the minimal Petrinaut mutation subset needed to replace free-form net JSON
with validated construction. Packaging and hermetic callback execution passed, but the single
real-model run failed to construct a non-empty net because the provider-facing open-object schema
lost the canonical array shape. The evidence is recorded in the implementation proof and carried
into Mission 5. Those tools stay absent from ordinary interview and `/api/chat` panel
conversations; live-net integration and the typed map remain Mission 5.

## Imperative

Prove that one production Flue `ChatAgent` can use a **structurally typed elicitation runbook** to
conduct or replay an interview, maintain a structured-but-not-strictly-semantically-typed
**runbook IR**, and use that workpiece to generate Petri-net JSON that Petrinaut accepts. Bare IR
below means this Markdown workpiece, not the existing typed three-register IR.

The runbook combines two authored knowledge layers: universal elicitation teaching (the useful
content behind the repertoire) and SDCPN target-formalism guidance (what to investigate, notice,
deepen, preserve, transform, and check). Deliver them through one Flue skill with progressively
disclosed resources, not through a large undifferentiated system prompt, a skill catalog, or the
old plugin runtime.

Condition 5's typed-capture path demanded too much in-loop semantic judgment and produced ordinary
question turns on the order of minutes. This mission recovers its researched teaching and authoring
discipline while testing structural typing as the sufficient first lever. It does not improve
capture quality and does not fold Mission 2's ledger.

## Throughline

One headless pass through the Mission 1 production door:

`createFlueClient → send initial modelling request → ChatAgent activates the runbook skill and reads elicitation + IR resources → (driver send → wait → history()) × interview turns → recover filled IR → driver sends construct-from-IR request → ChatAgent reads PN-construction + check resources and returns PN JSON → wait → history() → petrinaut-core parse/validate`

Skill activation and resource reads occur inside model turns initiated by `send`; the headless driver
does not invoke them before dispatch. The same agent owns elicitation, IR maintenance,
construction, and validation. These are lifecycle
phases, not separate agents. Construction may expose a gap and route the same agent back to
elicitation; the runbook describes the return without inventing a workflow engine.

During elicitation, work in the expert's vocabulary and maintain the IR. Read PN-construction
material only when constructing or checking the net. The IR is the seam: generation consumes it
rather than treating the transcript as the model. Manual loading into Petrinaut remains enough to
inspect the drawing.

## Proof

This proof establishes that a structurally typed runbook package can teach one agent through the
real Flue path and yield a validatable Petri net. It does not establish a final heading catalogue,
a typed capture/IR system, canvas write tools, session-as-net, two brains, or an automated
repertoire-to-runbook compiler.

From the real brunch-agent entrypoint (the same `ChatAgent` / `/api/chat` door as Missions 1–2),
one production-path test or documented headless script observes all of the following:

1. The agent has one mounted runbook skill. Its concise catalog description and always-on
   instruction route the modelling lifecycle without embedding the full runbook in the system
   prompt.
2. Skill activation yields the shared lifecycle procedure. Flue's native skill-resource surface
   makes elicitation teaching, the IR template, PN-construction guidance, and checks readable
   without a bespoke loader.
3. The elicitation material visibly combines universal teaching and SDCPN target-formalism content
   under the structural responsibilities fixed by the design specification. Authored runbook
   content names situation typologies, not facts from the fixed operational scenario; those facts
   appear only in conversation inputs, the filled IR, and evidence expectations.
4. Interviewing uses the expert's vocabulary rather than places, transitions, arcs, or colours;
   construction guidance is not required to frame ordinary elicitation questions.
5. The conversation fills a recoverable Markdown IR whose structure, unknowns, assumptions,
   conflicts, and omissions are legible without opening the Petrinaut GUI.
6. The construction phase consumes that IR, reads the construction/check material, and produces PN
   JSON that `parseSDCPNFile` (or the current Petrinaut-core import equivalent) accepts. Missing
   canvas positions are allowed if the parser already treats them as recoverable.
7. The result names consequential inference, approximation, defaulting, omission, and
   unrepresentable material rather than silently hardening it.
8. The interviewer never calls a sweep tool and producing the IR/net does not write Mission 2's
   capture store.

Prefer that one throughline over a broad suite. Record the resource path taken and where the first
runbook helped, failed, or created attention strain. A fluent conversation by itself is not proof.

## Constraints

- Consume
  [`docs/specs/structurally-typed-elicitation-runbooks.md`](docs/specs/structurally-typed-elicitation-runbooks.md):
  broad runbook definition, structural-before-semantic typing, universal + target-formalism
  authorship, one-agent lifecycle, one skill, and lazy phase-specific reference.
- Mission 1's chat door stays the door: Petrinaut panel → `transport-aisdk` → Flue `ChatAgent`.
  Do not rewrite the panel onto `@flue/react`. The adapter still must not depend on core, binding,
  or plugins.
- Use Flue's documented happy paths: `useSkill`, `activate_skill`, packaged supporting resources,
  `read_skill_resource`, existing tool mounting, and the JS-API drive pattern. No custom prompt or
  resource loader.
- Author the first rendered runbook directly in Markdown. Do not build a key renderer, compiler,
  projection engine, or generic schema framework before a second real consumer creates strain.
- Keep the system instruction to identity, routing, lifecycle invariants, transport facts, and the
  requirement to activate the runbook. Bulky teaching belongs in the skill package.
- One model-facing agent and one runbook skill. No skill catalog, subagent topology, workflow
  engine, TUI, or second server.
- Keep elicitation and construction in separate information regions. Conversation follows the
  expert's thread; IR headings do not become an opening questionnaire; PN internals remain
  construction vocabulary.
- Author runbook resources at the target-formalism level. Concrete scenario facts belong only to
  the run input and filled IR; do not bake a truck fleet, semiconductor fab, or any other test case
  into reusable teaching.
- Structural typing may fix headings, nesting, repeated entry shapes, completion criteria, checks,
  unknowns, and losses. Do not require closed kinds, slots, proposal types, precision grades,
  firing predicates, fold rules, or typed completion algebra.
- Restore the useful drive pattern from condition 5 (`createFlueClient` over the app router), not
  its SDCPN elicitor, `brunch_ask`, sweep, fold, or completion accounting.
- The IR template is a teaching workpiece, not ADR-0003 register 2 and not a projection of captures.
  Do not call `applyCaptureSweep` or join Mission 2's store.
- No Petrinaut canvas mutation tools on ordinary interview or `/api/chat` panel conversations and
  no typed FE map. The active side quest alone may mount its six-tool subset on a construct-only
  headless conversation; generation still uses inference from structured prose.
- The app may import `@hashintel/petrinaut-core` to parse/validate PN JSON. It must not import
  `@hashintel/petrinaut` UI.
- Update user-facing docs only where exercised behavior changes.

## Fog-line

Do not design past these questions before running the smallest path that can answer them:

- The first exact Markdown heading catalogue and which repeated entries need required child
  headings rather than authoring convention alone.
- The smallest sufficient boundary between skill instructions and supporting resources. The
  conceptual roles are fixed; exact files move only in response to observed sprawl, missed routing,
  or phase contamination.
- The skill's name/description and the smallest always-on instruction that reliably cause
  activation and resource routing over a long conversation.
- How the filled Markdown IR is recovered from the real conversation: one last-turn artifact, a
  resource-like document returned in output, or another shape already supported by the path. Do
  not create a persistence surface to answer this.
- How to exercise the lifecycle's construction-discovered-gap return without manufacturing a
  workflow state machine.
- Whether `parseSDCPNFile` is sufficient “Petrinaut accepts,” or the path exposes a smaller/larger
  import check.
- Which instructions initially believed universal prove SDCPN-specific, and which SDCPN guidance
  earns migration upward. Record the editorial move; do not automate it.

Resolve each at the real boundary and record the observed answer in code/tests and mission-close
evidence. A longer fog-line after the first run is calibration, not failure.

## Stop or reorient

Stop and surface evidence before continuing if:

- the runbook is implemented from the old narrow `kickoff` / `trajectory` / `close` definition or
  the broader design specification is treated as optional;
- the system prompt becomes the full research/runbook corpus instead of a concise router;
- more skills, another agent, a custom loader, or a workflow engine appear to solve an unobserved
  future problem;
- construction material leaks into ordinary interviewing and produces schema-shaped or PN-shaped
  questions;
- concrete scenario facts enter authored runbook resources instead of the conversation/IR instance;
- the agent cannot reliably activate the skill or read the relevant phase resource on the real
  path;
- the IR cannot support PN generation without rereading the transcript as the primary model;
- a closed kind/slot/proposal/precision/firing/fold/completion system re-enters merely to make the
  first template feel rigorous;
- producing the IR or PN requires writing Mission 2's capture store or implementing template fill
  as apply-sweep;
- plugin-sdcpn, repertoire runtime, fold, completion, or `brunch_ask` re-enter as the teaching
  vehicle;
- canvas mutation tools appear on the interviewer;
- the drive becomes a TUI or second server instead of `createFlueClient` against the live door;
- the adapter grows a dependency on core, binding, or plugins;
- ordinary teaching turns return to condition-5 latency (order-of-minutes) as the designed shape.

A need for one semantic commitment is not permission to restore the whole typed kernel. Name the
specific missing commitment and reorient from that evidence.

## Deferred

Mission 4 host continuity, Mission 5 typed map and Petrinaut read/write via existing `onToolCall`,
Mission 6 capture improvement, and whether capture and runbooks converge remain in
[`MISSION.next.md`](MISSION.next.md). Periodic PN generation and programmatic loading also remain
there. That draft does not supersede this mission.
