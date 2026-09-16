# SDCPN Construction

Read this only when constructing, revising, or checking a net. Consume the current process-model workpiece; do not reread the transcript as the primary model.

Construction translates recorded operational meaning into SDCPN structure. It may choose a representation, introduce a visibly named approximation, or report a loss. It may not invent operational facts to make the net complete.

## Construction boundary

Before constructing a fragment, confirm that the workpiece states the model's purpose and supports an activity with an adjacent state or relationship. Check the flow, ordering, enabling conditions, resource use and quantities that determine that fragment's meaning. The whole process's admission, outcomes and exception paths need not yet be known.

If a missing operational distinction would materially change this fragment, formulate the smallest resolving question. Ask it only when interactive elicitation is available; in construct-only execution, report it as the required re-entry and stop the unsupported path. Continue with independently supported fragments. Keep unresolved boundaries explicit; never invent a trigger, source, sink, release rule or numeric default to close them.

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

When `mutate_petrinaut_net` is mounted, names such as `addPlace` and `addArc` are operation types inside that tool's `operations` array, not separate tools. Use this sequence, waiting for each proposal's results before the next:

1. Settle the supported account with one `mutate_workpiece` call that declares its evidence by literal text, and reuse the submitted Markdown with the returned `revisionId`, `sha256` and `evidence[]` locators; do not reread the body. Only when a basis needs a span that output did not return, call `read_workpiece` with `includeContent: false` and `locateTexts` against the settled revision. Complete required skill-resource reads here, before browser tools.
2. Call only `read_petrinaut_net`. Copy `output.observation.toolCallId` and `output.observation.sha256` into the next batch's `observation`. Inspect `extensions` before authoring extension-specific content.
3. Call only `mutate_petrinaut_net` with a bounded, ordered chunk for the next supported connected fragment. Include only the types, parameters and differential equations that fragment needs, before their dependants; places and transitions before arcs. Dependency ordering applies within the fragment, not to a separate whole-model catalogue-building phase. Each operation has its own `operationId` and references an entry in `bases` by `basisId`. Several operations may share one supported basis.
4. After code or code-dependency changes, call only `read_petrinaut_diagnostics`. Repeat a pending read until settled; repair reported errors from a fresh net observation. Structural acceptance is not compiler success.
5. After adding or restructuring nodes, call only `layout_petrinaut_net` once diagnostics are settled. Use `askUserFirst: false` only if this conversation built the net from an empty canvas; otherwise request confirmation. Type/parameter/dynamics-only changes do not need layout.
6. Read the net again before another mutation or a live explanation, and at delivery. A failed batch may have committed a prefix: inspect its outcomes and the current net, then submit only the needed repair and unattempted work against the new observation. Do not replay the whole batch.

If a different runtime mounts individual mutation tools instead, use those exact mounted schemas with the same dependency ordering and available checks. Do not translate the batch envelope into invented tool names.

### Minimal batch example

Illustrative values only: suppose the settled account says “Items wait until processing consumes them.” `mutate_workpiece` returned revision `workpiece-1`, hash `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`, and span `[0,42)`. A subsequent browser read returned call `net-read-1` and hash `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`. The flat batch shape is:

```json
{
  "observation": {
    "toolCallId": "net-read-1",
    "baseHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "bases": [{
    "basisId": "waiting",
    "basis": {
      "kind": "declared",
      "revisionId": "workpiece-1",
      "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "locators": [{ "start": 0, "end": 42 }],
      "rationale": "Represent the recorded waiting state and its processing handoff.",
      "scope": "operation"
    }
  }],
  "operations": [
    {
      "operationId": "waiting-place", "basisId": "waiting", "type": "addPlace",
      "input": { "id": "waiting", "name": "Waiting", "colorId": null, "dynamicsEnabled": false, "differentialEquationId": null, "x": 0, "y": 0 }
    },
    {
      "operationId": "processing-transition", "basisId": "waiting", "type": "addTransition",
      "input": { "id": "process", "name": "Process", "inputArcs": [], "outputArcs": [], "lambdaType": "predicate", "lambdaCode": "", "transitionKernelCode": "", "x": 200, "y": 0 }
    },
    {
      "operationId": "waiting-input", "basisId": "waiting", "type": "addArc",
      "input": { "transitionId": "process", "arcDirection": "input", "placeId": "waiting", "weight": 1, "type": "standard" }
    }
  ]
}
```

Use actual returned IDs, hashes and locators in live calls, and an account that supports every operation; this shape example supplies no operational evidence or initial marking.

### Keep incidental choices small

Required `x` and `y` are provisional presentation values: place new nodes on a rough grid, then use layout. For a new type, `iconSlug: "circle"` and a simple CSS `displayColor` are sufficient visual choices. These choices carry no operational meaning. Optional metadata, visualizers and port fields are unnecessary for a simple root-net chunk; use them only when the task needs their capability. Existing component endpoints must be observed, not invented.

For separately wired transitions, start with empty `inputArcs` and `outputArcs`, then use `addArc` operations. Uncoloured places use `colorId: null`; disabled dynamics use `dynamicsEnabled: false` and `differentialEquationId: null`. Keep code strings empty only where their schema permits the built-in behaviour; coloured outputs or a meaningful guard/rate require the corresponding code. Arc weights are token multiplicities, never branch probabilities.

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
