# SDCPN Construction

Read this only when constructing, revising, or checking a net. Consume the current process-model workpiece; do not reread the transcript as the primary model.

Construction translates recorded operational meaning into SDCPN structure. It may choose a representation, introduce a visibly named approximation, or report a loss. It may not invent operational facts to make the net complete.

## Construction boundary

Before constructing, confirm that the workpiece states what the model must support and contains a usable process spine: what flows, what admits it, what happens and in what order, what changes the path, what resources are occupied, and what outcome ends or hands off the case.

If materially different nets remain possible because one operational distinction is missing, formulate the smallest resolving question. Ask it only when interactive elicitation is available; in construct-only execution, report it as the required re-entry and stop the unsupported path.

When Petrinaut construction tools are mounted, their accepted schemas and the inspected resulting definition are the authority for payload fields and net state. Use the tools for every net change; do not emit free-form net JSON. When tools are absent, leave construction-ready notes and do not claim a loadable net.

## Mapping principles

| Recorded operational meaning | Possible SDCPN interpretation |
| --- | --- |
| Things that flow, are acted on, or do work | Typed tokens and colour elements when distinctions change behavior |
| Initial populations, arrivals, departures, calendars, and external inputs | Initial marking, parameters, boundary conditions, or source and sink transitions where representable |
| Logical activities | Transitions, factored into start, in-progress state, and completion only when timing or resource semantics require it |
| Waiting, availability, and occupied state | Places derived from the activities and conditions on either side, not independently elicited queue nodes |
| Ordering, branching, joining, triggers, and practiced decision rules | Arcs, guards, priorities, and explicit enabling state |
| Resource consumption, reservation, release, and read-only use | Consumed tokens, held and returned resource tokens, or read behavior |
| Continuous change | Dynamics on real-valued colour elements when a rate, threshold, or objective makes it consequential |
| Metrics and objectives | Simulation metrics where representable; qualitative goals and unsupported weights remain in the workpiece |
| Data bindings and validation criteria | Workpiece obligations until a separate integration represents them |

A physical location becomes target structure only through its recorded operational effect; it is not automatically a Petri-net place. A simulation scenario is assembled from initial state, boundary conditions, parameters, and candidate policies rather than represented as one process node.

## Petrinaut tool sequence

When the corresponding tools are mounted:

1. Call `getLatestNetDefinition` before changing the net.
2. Add only workpiece-supported token types and tunable parameters with `addType` and `addParameter`.
3. Add places and transitions with `addPlace` and `addTransition`; establish stable identifiers before connecting them.
4. Add connections with `addArc`. Arc weights are positive token multiplicities, not switches for mutually exclusive modes.
5. Re-inspect with `getLatestNetDefinition` after each dependent stage and at the end.
6. Correct rejected calls in the same conversation or state why construction remains partial.

The mounted schemas, not this prose, govern exact payload fields.

## Construction patterns

Patterns are candidate transformations whose premises must already be present in the workpiece. They do not supply missing facts.

### Timed work

When a logical activity occupies consequential time, represent start, in-progress state, and completion separately. Preserve what remains occupied while work runs. Use a constant or named parameter when only a typical duration is supported; do not invent a distribution family or tail.

### Conditional or probabilistic outcome

Represent mutually exclusive outcomes with distinct enabled paths. Use a recorded rule, condition, parameter, or probability. If no probability is supported, do not manufacture an even split; preserve a symbolic parameter, use a non-probabilistic condition when available, or report the gap.

### Contended resource

Hold available instances in shared resource state. A work-start transition acquires the required tokens; competing work cannot use them while held; success, failure, cancellation, or recovery returns them when the workpiece says they become available. Preserve changed wear, qualification, location, or other consequential state on return.

Compile practiced contention rules into guards or priorities only when their selecting conditions are recorded.

### Consumed, reserved, and read inputs

- **Consumed or transformed:** remove the input from its source state and produce only the outputs the workpiece records.
- **Reserved:** remove or lock availability at start, carry the association through work, and return the input at release.
- **Read:** allow the activity to depend on the input without making it unavailable to other work.

Confirm that the target's actual arc semantics implement the intended use; syntactic convenience does not override operational meaning.

### Gate, release, trigger, or prerequisite

Represent the observable enabling condition and the event or actor that changes it. Use a guard, state place, external source, or timed event appropriate to the workpiece. Preserve overrides rather than silently weakening the gate.

### Batch, lot, load, or grouped movement

Represent formation by the recorded count, clock, or combined release rule. Preserve whether the group stays together and any split, merge, setup, or capacity cost. Do not infer a preferred batch size from a maximum.

### Mode change

Represent source and destination availability states with directional transitions when setup, changeover, restart, handover, or reconfiguration changes behavior. Attach time, material, scrap, or capacity loss to the direction where it occurs.

### Event, failure, retry, and recovery

Represent disruptions separately from normal progress when they befall the process rather than advance it. Place the return path at the recorded retry scope: failed activity, repeated subsequence, whole-case restart, diversion, or scrap. Preserve the work, state, and occupied resources that survive or reset.

### Continuous quantity and threshold

Carry a changing quantity in state with the supported evolution law. Fire consequential behavior at the recorded threshold and add a reset only when one is supported. Omit a floating continuous variable that affects no objective or process behavior.

### Spatial transfer

Represent transfer as an activity when location change consumes time or resources. Reserve transport capacity when contended and preserve origin-to-destination dependence when supported.

### Hidden waiting

Derive waiting from unavailable resources, unmet prerequisites, calendar state, batching, transport, policy, or disruption. An intermediate place may be required, but its meaning comes from those surrounding conditions rather than an elicited queue object.

## Inference, approximation, and target loss

Name every representational choice not directly supported by the operational account. Preserve its reason, consequence, and route to checking in the workpiece.

Potentially acceptable when purpose-relative and visible:

- collapsing several named micro-steps when no objective depends on their internal order;
- representing an unknown rate as a parameter rather than a value;
- using a constant for variation judged immaterial to the stated purpose;
- choosing one of several behaviorally equivalent net factorizations; and
- supplying layout positions that carry no operational meaning.

Not acceptable:

- filling an empty workpiece concern from generic operations knowledge;
- averaging conflicting or context-dependent values;
- interpreting “unknown” as a conventional distribution;
- treating a posted rule as practiced behavior;
- inventing release, recovery, retry, or branch semantics; or
- claiming a net is loadable, valid, or simulated without corresponding tool evidence.

Record workpiece material the target or current tools cannot faithfully carry, including qualitative objectives without usable metrics, policy whose deciding condition remains tacit, live data bindings not connected by the current path, validation judgments outside net semantics, and contextual distinctions collapsed by an accepted simplification.

## Existing-net analysis and bounded change

Start from the changed or disputed workpiece material and inspect the current net before mutation. Identify the elements whose meaning depends on that material and the desired delta.

Do not claim general net revision unless mounted capabilities can update or remove existing structure. With an add-and-inspect subset, apply only genuinely additive changes that preserve the intended existing structure; otherwise stop after analysis and describe the unsupported update or removal. Never simulate replacement by adding competing elements beside obsolete ones.

After a supported change, report what was added, what was only inspected, which objective consequences changed, and which assumptions or losses opened or closed.
