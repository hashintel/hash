# Formalism-Primary Workpiece Template Alternative

This workpiece candidate pairs with [`formalism-primary.md`](formalism-primary.md). It exists to compare Coverage indexing fairly; do not load it alongside the domain-primary `../workpiece-template.md` in one run.

It is structurally organized but not a closed semantic claim system. Follow the person's thread during the conversation; do not read these headings aloud as a questionnaire.

## Locality rule

Every operational claim has one authoritative home under the relevant target concern. Keep exact expert wording, normalized interpretation, agent inference, uncertainty, assumptions, corrections, conflicts, and contextual variation beside that claim when those distinctions matter. Do not repeat the claim in a centralized evidence section or ledger.

Labels such as **Expert evidence**, **Working account**, **Agent inference**, **Assumed**, **Unknown**, **Not yet asked**, **Declined**, **Deferred**, **Conflict**, **Correction**, **Contextual variation**, **Omitted**, and **Loss** are optional annotations, not mandatory fields or a closed type system. An assumption states why it was introduced and how it could be checked. A correction identifies the account it replaces without leaving both active. Contextual coexistence keeps each account beside the condition selecting it.

Use the cross-cutting issue ledger only when an unresolved matter affects several authoritative claims or needs a later return path. Ledger entries reference those claims; they do not summarize them again.

Whenever this workpiece changes substantially, emit the full current document in a fenced block whose language tag is exactly `runbook-ir`. Emit the full latest document again before a construction handoff and before workpiece-only delivery.

```markdown
# Process-Model Workpiece

## Purpose and posture

### Who will use the model and how

### Boundary, horizon, and accuracy expectation

### Available time and assumption appetite

### What the result must not claim

## Target-relevant operational account

These concepts are filing and checking addresses, not interview order. Use only the sections relevant to the stated purpose; keep consequential unsupported material visible. Place each operational claim once and attach evidence or epistemic annotations at that location when needed.

### Objectives

For each objective: what the model must answer, compare, or support, and references to the operational material on which it depends.

### Entity distinctions

What flows, performs work, is contended, or carries state, including actors, resources, and consequential location distinctions.

### Boundary conditions

Initial state and populations, arrivals and departures, calendars, external inputs and events, admission triggers, and prerequisites outside the process.

### Activities

Named operational activities with preconditions, performers, inputs, consumed/reserved/read use, outputs, state changes, duration, success, failure, and contextual variation. Put local activity meaning here; put order in Ordering flow.

### Ordering flow and authoritative case spine

Give the cold-readable ordered account in the person's vocabulary: what admits a concrete case, which named activities occur and in what order, how branches and joins are decided, where waiting comes from, how failure/retry/recovery change the path, and what outcome or handoff ends it. Reference Activity and Entity entries instead of restating their local details.

#### Primary case: <person's name for the case>

##### Trigger or admission

##### Ordered account and references

##### Branches, joins, waits, failures, recovery, and outcomes

##### Objective dependencies

#### Additional or contrasting case: <name>

Add only when a different case exposes structure the primary case does not.

### Policies

Practiced decision and contention rules, prescribed alternatives, tie-breaking, release conditions, overrides, and contextual regimes.

### Constraints

Capacity, eligibility, compatibility, qualification, safety, conservation, and thresholds with their operational consequences.

### Metrics

What is measured, how it is observed, what better means, and supported trade-offs or priorities.

### Dynamics

Quantities that change while no discrete event occurs: direction, rate, variation, threshold, consequence, and reset.

### Data bindings

Variables a real data source could drive, their source, units, update behavior, and evidence gap. Do not claim a live binding unless one exists.

### Validation criteria

Observation, replay, historical comparison, or expert judgment that would make the model credible enough for its intended use.

## Cross-cutting issue ledger

Use only for an unresolved matter that affects several target concerns or needs later re-entry. In one compact entry, reference the authoritative claim locations, state what remains unresolved and what it prevents, and name the evidence or event that would re-enter it. Do not copy the affected claims here.

- **<issue>** — affects: <heading references>; unresolved: <gap, conflict, assumption, deferral, or other matter>; consequence: <what it prevents>; re-enter when: <source, observation, decision, or question>.

## Construction notes

Open this section when construction begins; do not use it to script ordinary elicitation. Reference authoritative workpiece claims rather than reproducing them.

### Candidate target structures

### Construction inferences, approximations, and defaults

### Questions reopened by construction

### Target-representation losses

## Delivery status

Summarize status by reference to the authoritative account and issue ledger; do not create a second model summary.

### What this workpiece currently supports

### Consequential gaps

### Net status

State whether construction was not attempted, blocked, partial, or tool-schema accepted; whether the inspected definition was structurally reviewed against the workpiece; and whether behavior was untested, observed in named simulations, or established to a stated scope by stronger analysis. Do not infer a higher level from a lower one.
```

## Maintenance guidance

- Prefer the person's terms for names and process descriptions even when filing them under target concerns.
- Update the claim at its authoritative location when understanding changes; do not append a competing summary elsewhere.
- Keep evidence and epistemic treatment local even when a cross-cutting issue references the claim.
- Update the authoritative ordering-flow section when case behavior changes; reference local activity and entity claims rather than repeating them.
- Empty sections may be removed when irrelevant. Use **Not yet asked**, **Unknown**, or **Omitted** only when that state itself matters to later work.
- Construction consumes this workpiece. If construction needs transcript archaeology to recover a load-bearing fact, the workpiece is incomplete at that point.

## Comparison pressure

This shape makes target obligations and formalism-indexed verification easy to find. It may also make the workpiece feel like a schema and may force actors, locations, resources, triggers, and process failures to be translated across several headings. Compare whether that translation burden is lower or higher than the domain-primary candidate's risk of hiding target distinctions.
