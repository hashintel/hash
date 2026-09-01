# SDCPN Construction

Read this only when constructing, revising, or checking a net. Consume the current process-model workpiece; do not reread the transcript as the primary model.

Construction translates recorded operational meaning into SDCPN structure. It may choose a representation, introduce a visibly named approximation, or report a loss. It may not invent operational facts to make the net complete.

## Construction boundary

Before constructing, confirm that the workpiece states what the model must support and contains a usable process spine: what flows, what admits it, what happens and in what order, what changes the path, what resources are occupied, and what outcome ends or hands off the case. If materially different nets remain possible because one operational distinction is missing, formulate the smallest resolving question. Ask it only when interactive elicitation is available; in construct-only execution, report it as the required re-entry and stop the unsupported path.

When Petrinaut construction tools are mounted, their accepted schemas and the inspected resulting definition are the authority for payload fields and net state. Use the tools for every net change; do not emit a free-form net JSON substitute. When tools are absent, leave construction-ready notes and do not claim a loadable net.

## Mapping principles

- Operational conditions in which things wait, remain available, or occupy a state may become places.
- Operational events and activities may become transitions, factored into start/progress/finish only when their timing or resource semantics require it.
- Ordering, branching, joining, triggers, and practiced decision rules may become arcs, guards, and priorities.
- A distinction among kinds of things may become a colour or typed element only when the recorded operation treats the distinction differently.
- Continuous change while no discrete event occurs may become dynamics on a real-valued element when a rate, threshold, or objective makes it consequential.
- Initial populations, arrivals, calendars, and external inputs may become scenario state, parameters, or source transitions.
- Shared reusable resources are acquired, made unavailable while held, and released. Consumable inputs do not return. Read-only inputs remain available.
- A physical location becomes net structure only through its recorded operational effect; it is not automatically a place.
- Waiting is derived from the conditions and activities around it. Do not create a queue node merely because the account says that something waits.
- Qualitative goals, political judgments, unsupported policies, data bindings, and validation criteria may remain workpiece-only and must be named as losses when the net cannot hold them.

## Tool sequence when mounted

1. Inspect the latest net definition before changing it.
2. Add only workpiece-supported types and tunable parameters.
3. Add places and transitions and establish their stable identifiers before connecting them.
4. Add connections using the tool's accepted arc schema and positive token multiplicities.
5. Re-inspect after each dependent stage and once at the end.
6. Correct rejected calls in the same conversation or state why construction remains partial.

The exact tool names and payload schemas come from the mounted capabilities, not this reference.

## Construction patterns

Patterns are candidate transformations whose premises must already be present in the workpiece. They do not supply missing facts.

### Timed work

When an activity occupies time and that distinction matters, use a start event, an in-progress state, and a completion event. Duration may be constant, parameterized, sampled, or driven by recorded context. If only a typical value is known, retain it as a named approximation or parameter; do not invent a tail.

Preserve what is occupied while work is in progress. A reserved resource is unavailable between start and completion and returns in the recorded state when work ends or fails.

### Conditional or probabilistic outcome

Represent mutually exclusive outcomes with distinct enabled completions or branches. Use a recorded rule, condition, parameter, or probability. If no probability is supported, do not manufacture an even split; retain a symbolic parameter, use a non-probabilistic condition if one exists, or report the gap.

A sampled value and its branch guards must implement the stated probability convention correctly. Do not reuse the predecessor draft's unchecked `sample >= probability-of-success` example, which would invert the usual probability under a uniform sample.

### Contended resource

Represent the available instances in a shared resource state. A work-start transition acquires the required count; competing work cannot use those instances while held; success, failure, cancellation, or recovery returns them when the workpiece says they become available again. Preserve wear, qualification, location, or other changed state on return when operationally consequential.

Compile practiced contention rules into guards or priorities only when their selecting conditions are recorded. Otherwise report the missing rule.

### Consumed, reserved, and read inputs

- **Consumed or transformed:** remove the input from its source state and produce only the outputs the workpiece records.
- **Reserved:** remove or otherwise lock availability at start, carry the association through work, and return the input at release.
- **Read:** allow the activity to depend on the input without making it unavailable to other work.

Confirm that target arc semantics actually implement the intended mode; syntactic convenience does not override operational meaning.

### Gate, release, or prerequisite

Represent the observable condition that enables work and the event or actor that changes it. A relative-time approximation such as “about two days before” should not replace a recorded practiced condition. External conditions may belong in scenario inputs rather than the core process net.

### Batch, lot, load, or grouped movement

Represent formation by the recorded count, clock, or combined release rule. Preserve whether the group must stay together and any recorded split, merge, setup, or capacity cost. Do not assume a preferred batch size when only a maximum exists.

### Mode change

Represent setup, changeover, restart, warm-up, handover, or reconfiguration as a transition between modes when those modes change availability or behavior. Preserve directional time, material, scrap, capacity, and cascade losses; A-to-B and B-to-A are not interchangeable unless the workpiece supports that simplification.

### Event and recovery

Represent disruptions separately from normal progress when they befall the process rather than advance it. Preserve occurrence, affected state, occupied resources, duration, recovery, retry, and terminal outcome as supported. One memorable event does not establish its rate.

### Threshold on a changing quantity

Represent the recorded quantity, direction and rate of change, variation if relevant, consequential threshold, triggered event, and reset. If crossing nothing changes and no objective observes the quantity, omit it or retain it only in the workpiece rather than adding unsupported dynamics.

### Hidden waiting

Derive waiting from unavailable resources, unmet prerequisites, calendar state, batching, transport, policy, or disruption. The net may contain an intermediate place, but its meaning comes from those surrounding conditions rather than an elicited queue object.

## Inference, approximation, and defaults

Name each representational choice not stated directly in the operational account. Preserve its reason, consequence, and how it could be checked.

Potentially acceptable when purpose-relative and visible:

- collapsing several named micro-steps into one transition when no objective depends on their internal order;
- representing an unknown rate as a parameter rather than a value;
- using a constant for variation judged immaterial to the stated question;
- choosing one of several behaviorally equivalent net factorizations;
- supplying layout positions that carry no operational meaning.

Not acceptable:

- filling an empty workpiece concern from generic knowledge of operations;
- averaging conflicting or context-dependent values;
- interpreting “unknown” as a textbook distribution;
- treating a posted rule as practiced behavior;
- inventing release, recovery, retry, or branch semantics;
- collapsing tool-schema acceptance, agent-reviewed structural correspondence, and behavior observed through execution or stronger analysis into an unsupported claim that the net is valid, runnable, or simulated.

## Existing-net analysis and bounded change

Start from the changed or disputed workpiece material and inspect the current net before any mutation. Identify the elements whose meaning depends on that material and report the desired delta.

Do not claim general net revision unless the mounted capabilities can update or remove existing structure. With the current add-and-inspect subset, apply only genuinely additive changes that preserve the intended existing structure; otherwise stop after analysis and describe the unsupported update or removal operations. Never simulate replacement by adding competing places, transitions, arcs, types, or parameters beside obsolete ones.

After any supported change, report what was added, what was only inspected, which objective consequences moved, and which assumptions or losses were opened or closed. This is behavioral guidance, not a claim that an external harness computes an affected slice, guarantees unaffected structure, or enforces provenance automatically.

## Construction losses

Report workpiece material the target or current tools cannot faithfully carry, including qualitative objectives without a usable metric, policy whose deciding condition remains tacit, live data bindings not connected by the current path, validation judgments outside net semantics, contextual distinctions collapsed by an accepted simplification, and any operational gap that prevented construction.

A loss remains part of the delivered workpiece. It does not disappear because the net parser accepts the result.
