# provenance questions

## Example situation

Suppose the prior elicitation established:

> “There is one washdown crew shared by both lines. If both lines need washing, the crew normally handles the order with the earlier due date first.”

The projected SDCPN contains:

- a place or resource representation for the washdown crew;
- capacity one;
- transitions that reserve and release it;
- contention logic representing the practiced priority rule.

During the demo, the reviewer selects that area and asks:

> “Why is there only one washdown crew, and why does Line 1 get priority here?”

The system needs to traverse backwards from those net elements to the basis for those decisions.

Then the reviewer says:

> “That changed in July. We now have a second contract crew on night shifts, but daytime still has one crew.”

The system asks several targeted questions, updates its understanding, and changes only the relevant net region.

## Option A: provenance directly on model fields

The smallest design is to attach source references directly to fields in the semantic workpiece.

```yaml
resources:
  - id: washdown-crew
    name: Washdown crew
    capacity:
      value: 1
      applies_when: daytime
      epistemic_status: explicit
      support:
        - conversation_id: initial-elicitation
          turn_id: user-12
          quote: We only have one washdown crew during the day.
    contention_rule:
      value: earliest-due-order-first
      epistemic_status: explicit
      support:
        - conversation_id: initial-elicitation
          turn_id: user-15
          quote: We normally send them to whichever order is due first.
```

The projection manifest then says:

```yaml
net_elements:
  - id: washdown-crew-available
    produced_from:
      model_item: washdown-crew
      fields:
        - capacity
  - id: reserve-washdown-crew
    produced_from:
      model_item: washdown-crew
      fields:
        - capacity
        - contention_rule
```

The provenance query is straightforward:

```text
washdown-crew-available
→ washdown-crew.capacity
→ initial-elicitation / user-12
```

### What happens during revision

The new review turns modify the resource:

```yaml
capacity:
  daytime: 1
  night: 2
```

Each value receives its own source reference. The projector produces a new desired net, and a structural diff patches the existing net.

### Advantages

- Fewest moving parts.
- No separate capture assertion store.
- Easy to explain.
- Enough for many “why?” questions.
- Source references stay beside the meaning they support.

### Weaknesses

It becomes awkward when:

- several statements jointly support one field;
- one statement supports several model items;
- two people disagree;
- a statement is corrected rather than merely refined;
- the reviewer adds contextual truth rather than replacing the original account;
- we need to preserve what the model believed in version 1.

For example, “one crew” was not actually false—it remained true during the day. A simple overwrite risks treating contextual refinement as correction.

This design works best if FE-1476 only needs a narrow, clean revision with little disagreement.

---

## Option B: first-class assertions inside the semantic workpiece

The middle design gives claims their own stable identities but keeps them inside the same semantic workpiece. There is no generic capture-to-model fold subsystem.

```yaml
assertions:
  - id: assertion-washdown-day-capacity
    subject: washdown-crew
    predicate: available-count
    value: 1
    applies_when:
      shift: day
    epistemic_status: explicit
    lifecycle_status: active
    support:
      - conversation_id: initial-elicitation
        turn_id: user-12
        quote: We only have one washdown crew during the day.

  - id: assertion-washdown-priority
    subject: washdown-crew
    predicate: practiced-contention-rule
    value: earliest-due-order-first
    epistemic_status: explicit
    lifecycle_status: active
    support:
      - conversation_id: initial-elicitation
        turn_id: user-15
        quote: We normally send them to whichever order is due first.

model:
  resources:
    - id: washdown-crew
      capacity_by_shift:
        day:
          value: 1
          derived_from:
            - assertion-washdown-day-capacity
      contention_rule:
        value: earliest-due-order-first
        derived_from:
          - assertion-washdown-priority
```

This creates a three-stage provenance path:

```text
net element
→ semantic model field
→ assertion
→ conversation evidence
```

The assertion is logically separate from the model field, but it does not need a separate storage system or generic plugin architecture.

### What happens during revision

The reviewer’s first statement creates a tentative assertion:

```yaml
- id: assertion-washdown-night-capacity-review
  subject: washdown-crew
  predicate: available-count
  value: 2
  applies_when:
    shift: night
    effective_from: 2026-07
  epistemic_status: tentative
  asserted_by:
    role: reviewer
  support:
    - conversation_id: review-session
      turn_id: user-4
```

The agent might then ask:

1. Does daytime capacity remain one?
2. Is the contractor available every night or only on request?
3. What happens if both crews are already committed?
4. Does this replace the previous account, or add a night-shift exception?

After those answers, the assertion can become explicit and active. The original daytime assertion remains active because it was not corrected.

If the reviewer instead said:

> “The six-hour dark-to-light washdown was the old procedure. It is four hours now.”

That is a real supersession:

```yaml
- id: assertion-dark-to-light-four-hours
  subject: dark-to-light-washdown
  predicate: typical-duration
  value: PT4H
  lifecycle_status: active
  supersedes:
    - assertion-dark-to-light-six-hours
```

The old assertion remains visible for historical explanation, but it no longer drives the current model.

### Advantages

- Handles correction, refinement, contextual truth, and disagreement cleanly.
- Gives provenance a stable unit smaller than an entire model object.
- Allows one semantic item to depend on several assertions.
- Allows one assertion to support several semantic items.
- Makes reviewer authorship explicit.
- Supports versions without requiring a graph database.
- Fits the phrase “captured assertion” honestly.

### Weaknesses

- Requires us to define an assertion contract.
- Requires lifecycle decisions: active, superseded, tentative, conflict.
- Requires a small interpretation step from assertions into the current model.
- Can grow into the retired typed kernel if we type everything indiscriminately.

The restraint would be:

> Assertions only need enough shape to support provenance, correction, and the selected projection—not the old universal kind/slot/completion system.

This is my current recommendation for FE-1476.

---

## Option C: separate capture ledger and folded model

The fullest design makes assertions independent durable capture records:

```text
Flue conversation
→ extraction/sweep
→ capture assertion ledger
→ fold
→ semantic model
→ SDCPN projection
```

An assertion might look similar to Option B, but it is written into a capture store independently of the workpiece. The semantic model is then derived entirely by folding active assertions.

Revision becomes:

```text
new reviewer turns
→ new captures and supersession
→ fold model again
→ project desired net
→ diff
→ patch
```

### Advantages

- Strongest separation between evidence and interpretation.
- Full correction history.
- Potentially supports many sessions and many projections.
- The model can be regenerated from assertions.
- Closest to the original “requirements graph” idea.

### Weaknesses

This is where the large machinery returns:

- extraction must decide assertion boundaries;
- captures require semantic types;
- correction and conflict semantics must be defined;
- fold behavior must be deterministic enough to trust;
- capture granularity becomes consequential;
- in-loop extraction risks returning to Condition 5 latency;
- the fold and model must agree under evidence reordering;
- the live revision crosses more independently failing boundaries.

It could be the long-term architecture. It is a risky assumption to make the two-week demo depend on it.

---

# Why I prefer Option B

Option B takes the minimum useful property from the requirements-graph design—**first-class, source-linked, revisable assertions**—without requiring the full capture/fold architecture.

Conceptually:

```text
semantic workpiece
├── assertions: what people said, with source and lifecycle
└── model: what currently drives projection, with assertion references
```

It can be one JSON/YAML artifact or one document with a machine-readable region. “Graph” describes the relationships, not the storage technology.

The resulting durable package could be:

```text
review-artifact/
├── workpiece.json
│   ├── assertions
│   └── current semantic model
├── net.json
└── projection-manifest.json
```

The transcript remains durable in Flue history. For export and optimisation handoff, quoted excerpts and conversation/turn IDs can also be embedded in the workpiece so the package does not become meaningless if the live Flue store is unavailable.

## Full six-beat behavior under Option B

### 1. Show the completed workpiece

The “requirements graph” UI could initially be modest:

- objective and boundary;
- process spine;
- activities and resources;
- assertions and unresolved assumptions;
- links between assertions and model items.

It need not be a graph visualization. Inspectable JSON plus a human-readable view may be enough for the first proof.

### 2. Examine the SDCPN

The SDCPN is projected from the `model` region, not composed from transcript prose.

Stable semantic IDs determine stable net IDs:

```text
resource:washdown-crew
→ place:resource:washdown-crew:available
```

### 3. Ask why

The reviewer selects or names a net element.

The system reads the projection manifest:

```text
place:resource:washdown-crew:available
→ model resource washdown-crew / capacity_by_shift
→ assertions A17 and A23
→ quoted turns user-12 and user-19
```

The model can explain in prose, but it is not inventing the chain.

### 4. Targeted re-elicitation

The selected element establishes scope. The agent receives:

- the relevant model item;
- its supporting assertions;
- neighboring constraints;
- the reviewer’s question.

It conducts 3–5 focused turns rather than reopening the entire interview.

### 5. Change the net

The settled turns produce new or superseding assertions. The current semantic model is updated.

Then:

```text
project whole small model deterministically
→ diff by stable IDs
→ reject unrelated churn
→ apply only changed mutations
```

We can explicitly test that IDs outside the selected impact set remain byte-for-byte unchanged.

### 6. Optimisation handoff

Chris and Yannis receive:

- revised `net.json`;
- scenario/parameter inputs;
- projection manifest;
- relevant assumptions and unresolved gaps;
- optionally the complete review artifact.

They do not need to inspect a Flue transcript to understand where the model came from.

# The reviewer-authority problem

The fact that the reviewer is **not the original expert** matters more than it first appears.

Suppose the original expert said:

> “Dark-to-light washdown takes six hours.”

The reviewer says:

> “I think it is four now.”

There are three possible products:

1. **Authoritative editing:** the reviewer may supersede the original assertion.
2. **Proposed revision:** the reviewer creates a candidate assertion requiring confirmation.
3. **Contextual alternative:** both claims remain active under different conditions.

A source-linked Markdown field can record the latest answer, but first-class assertions make these outcomes explicit. The net should probably change automatically only for an accepted authoritative correction or a clearly contextual refinement. A tentative disagreement might produce a preview or named conflict instead.

That authority policy is part of the demo semantics, not merely UI wording.

# Parallel work enabled by this boundary

Once the assertion, semantic item, stable-ID, and projection-manifest contracts are pinned, several tracks can proceed in separate worktrees:

1. **Baseline/evaluation track**  
   Run and grade the frozen elicitation baseline.

2. **Semantic workpiece track**  
   Build Option B from an existing Mission 3 IR and transcript.

3. **Projection/diff track**  
   Use a fixture workpiece to produce a stable net, manifest, and scoped diff.

4. **Provenance interaction track**  
   Build “why?” against a fixed projection manifest before live projection exists.

5. **Petrinaut mutation track**  
   Prove the minimal live client-tool patch path using a predetermined diff.

6. **Targeted re-elicitation track**  
   Rehearse 3–5-turn scoped revision against a fake workpiece adapter.

7. **Optimisation-handoff track**  
   Confirm the exact net/scenario package Chris and Yannis can consume.

These can be asynchronous because they meet at explicit artifacts. The contracts must be fixed first; otherwise parallel agents will each invent a different meaning of assertion, model item, and impact set.

## My present recommendation

For FE-1476:

- use **first-class assertions inside the semantic workpiece**;
- point assertions directly to durable conversation evidence;
- derive the current projectable model from those assertions without building a generic fold engine;
- generate a projection manifest alongside the SDCPN;
- reproject and diff rather than building a general incremental projector;
- defer a separate capture assertion ledger until the integrated slice reveals that the workpiece cannot carry the necessary evidence lifecycle.

The next question I would settle is:

> **Does the reviewer have authority to commit a correction directly, or are their changes proposals that require confirmation from an original domain expert or another named authority?**

That answer determines the assertion lifecycle and whether the live demo changes the canonical net immediately or first shows a proposed revision.
