# Process-Model Workpiece Template

This domain-primary workpiece is maintained during elicitation and revision and consumed during construction. It is structurally organized but not a closed semantic claim system. Follow the person's thread during the conversation; do not read these headings aloud as a questionnaire.

## Locality rule

Every operational claim has one authoritative home under the relevant purpose or operational concern. Keep exact expert wording, normalized interpretation, agent inference, uncertainty, assumptions, corrections, conflicts, and contextual variation beside that claim when those distinctions matter. Do not repeat the claim in a centralized evidence section or ledger.

Labels such as **Expert evidence**, **Working account**, **Agent inference**, **Assumed**, **Unknown**, **Not yet asked**, **Declined**, **Deferred**, **Conflict**, **Correction**, **Contextual variation**, **Omitted**, and **Loss** are optional annotations, not mandatory fields or a closed type system. An assumption states why it was introduced and how it could be checked. A correction identifies the account it replaces without leaving both active. Contextual coexistence keeps each account beside the condition selecting it.

Use the cross-cutting issue ledger only when an unresolved matter affects several authoritative claims or needs a later return path. Ledger entries reference those claims; they do not summarize them again.

Whenever this workpiece changes substantially, emit the full current document in a fenced block whose language tag is exactly `runbook-ir`. Emit the full latest document again before a construction handoff and before workpiece-only delivery.

```markdown
# Process-Model Workpiece

## Purpose and posture

### What the model must answer, compare, or support

### Who will use it and how

### Boundary, horizon, and accuracy expectation

### Available time and assumption appetite

### What the result must not claim

## Operational account

These are filing homes, not interview order. Use only the sections relevant to the stated purpose; keep a consequential omission visible. Place each operational claim once and attach evidence or epistemic annotations at that location when needed.

### Goals, measures, constraints, and thresholds

### Boundary conditions, triggers, prerequisites, and initial state

### Participants, locations, flowing things, and resources

### Activities, inputs, outputs, and resource use

For each load-bearing input, preserve whether it is consumed or transformed, reserved and later released, or read while remaining available. Describe each activity locally here; put its place in the ordered case only in the process-spine section below.

### Case and process spine: flow, branching, joining, failure, retry, and recovery

Give the authoritative cold-readable ordered account in the person's vocabulary. Begin with a concrete case: what admits it to the process, what flows, which named activities occur and in what order, what decisions or conditions change the path, where it waits and why, what failure and recovery do to the case, and what outcome or handoff ends it. Reference activity and resource entries instead of restating their local details.

#### Primary case: <person's name for the case>

##### Trigger or admission

##### Ordered account and references

##### Branches, joins, waits, failures, recovery, and outcomes

##### Objective dependencies

#### Additional or contrasting case: <name>

Add only when a different case exposes structure the primary case does not.

### Time, quantities, arrivals, and stochastic behavior

### Policies, exceptions, practiced rules, and contextual regimes

### Validation evidence and data sources

## Cross-cutting issue ledger

Use only for an unresolved matter that affects several concerns or needs later re-entry. In one compact entry, reference the authoritative claim locations, state what remains unresolved and what it prevents, and name the evidence or event that would re-enter it. Do not copy the affected claims here.

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

State whether no construction was attempted, construction is blocked, a partial net exists, or a net was constructed and checked through mounted tools. Do not infer simulatable status from workpiece quality alone.
```

## Maintenance guidance

- Prefer the person's terms for names and process descriptions.
- Update the claim at its authoritative location when understanding changes; do not append a competing summary elsewhere.
- Keep evidence and epistemic treatment local even when a cross-cutting issue references the claim.
- Update the authoritative case-and-process-spine section when ordering or case behavior changes; reference local activity and resource claims rather than repeating them.
- Empty sections may be removed when irrelevant. Use **Not yet asked**, **Unknown**, or **Omitted** only when that state itself matters to later work.
- Construction consumes this workpiece. If construction needs transcript archaeology to recover a load-bearing fact, the workpiece is incomplete at that point.
