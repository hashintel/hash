# Mapping the Ledger to an SDCPN

Read this before constructing, revising or checking a net.

Construction translates the Ledger's entities and claims into SDCPN structure. It may choose a representation, stand in for what the Ledger does not yet establish, introduce a visibly named approximation, or report a loss. It may not present an invented fact as elicited: every stand-in and assumption is labelled as yours.

## Building from an incomplete account

Build a fragment once the account supports an activity and something it changes; the rest of the process need not be known. Early on, sketch everything the USER has described across the operation, then deepen where the purpose needs it.

Where a fact the fragment needs is missing, use a stand-in rather than waiting:

- an unknown quantity, rate, duration or threshold becomes a net parameter holding a placeholder value, named so it reads as provisional;
- an unknown trigger, arrival, decision or outcome becomes an externally supplied event or input place that a scenario or the USER can drive;
- an unknown branch rule becomes distinct outcome paths gated on a named parameter or external input, never an invented probability;
- unknown internal steps become one activity, noted as collapsed.

Record each stand-in as an `assumed`, `tentative` claim on the entities it concerns, and anchor a reflection from that claim to the net elements standing in. Ask for the missing fact when it bears on the purpose; when the USER supplies it, supersede the claim and replace the stand-in. When a missing distinction would give materially different structure, build the likelier structure, label it, and ask which holds.

An explicit request to use sensible defaults, decide on the USER's behalf, make up a suitable example, or equivalent authorizes concrete purpose-bounded values; they remain labelled as yours.

When Petrinaut construction tools are mounted, their accepted schemas and the inspected resulting definition are the authority for payload fields and net state; the `petrinaut` skill covers how to use them. When tools are absent, leave construction-ready notes and do not claim a loadable net.

## Reading an entity

An entity's kind suggests a representation; its claims decide it. The map lists each current claim under every entity it concerns, so read all of an entity's claims together before choosing structure for it. One entity can become several net elements, and one element can carry several entities: a `resource` whose count the USER wants to vary is also behind a `lever`, and a `rule` the USER wants to compare becomes a parameter that selects between paths.

The stage each kind opens with tells you which layer of the net it usually reaches:

- **framing** reaches no element: it decides what the net is for;
- **scope** sets where the net stops, in time and in what it includes;
- **input** becomes something set before a run: parameters, initial state, experiment ranges;
- **system** becomes structure: types, places, transitions, arcs, guards, kernels and dynamics;
- **output** becomes something a run produces or is judged by: metrics and experiment objectives.

## Kind hints

| Stage   | Kind          | Usual counterpart                                                                                  | Watch for                                                                                 |
| ------- | ------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| framing | `purpose`     | No element; it decides what to build and an experiment's question                                  | What the result must not claim                                                            |
| scope   | `horizon`     | An experiment's `maxTime`                                                                          | Its unit, and the simulation time unit it converts to                                     |
| scope   | `boundary`    | Source and sink transitions, externally supplied input places, scenario initial state              | What crosses it in each direction                                                         |
| input   | `lever`       | A net parameter; a scenario parameter when it varies between runs or regimes                       | A count is an `integer` parameter, a proportion a `ratio`, a continuous quantity a `real` |
| input   | `limit`       | The range of the lever it bounds                                                                   | A bound across several levers cannot reach an experiment                                  |
| input   | `optimum`     | No element; an experiment over its levers                                                          | It needs its directions; when it balances several, the USER says how                      |
| system  | `thing`       | A token type, with colour elements when its attributes change behaviour                            | Distinctions that change nothing stay in the Ledger                                       |
| system  | `location`    | No element of its own; separate places or a transfer activity where position changes behaviour     | A location whose capacity can run out is a resource                                       |
| system  | `resource`    | A place whose tokens are acquired and returned, its capacity as initial tokens                     | Consumed, reserved or read                                                                |
| system  | `activity`    | A transition; start, in-progress place and completion when its duration matters                    | What it holds while it runs                                                               |
| system  | `actor`       | A resource when only how many are free matters; a rule when it decides                             | Rarely a place of its own                                                                 |
| system  | `rule`        | A guard, predicate lambda or priority                                                              | Posted and practiced versions; a rule the USER compares is a lever                        |
| system  | `event`       | A transition that takes no time; a source transition or stochastic rate when it comes from outside | What it interrupts, and what survives it                                                  |
| system  | `flow`        | A path through places and transitions, not one element                                             | Checked as a candidate structural path                                                    |
| output  | `metric`      | A saved metric                                                                                     | Last-frame, accumulated or peak; accumulation needs a place or attribute                  |
| output  | `direction`   | The objective metric and direction of an experiment                                                | Which metric, and which way                                                               |
| output  | `target`      | A metric reported against its value                                                                | Reported, not enforced                                                                    |
| output  | `threshold`   | A metric reported against its bound                                                                | Never an objective penalty; an operation that acts at the level is a rule                 |
| output  | `externality` | A metric when the net can measure it; otherwise a recorded loss                                    | Who or what it affects                                                                    |

Waiting, availability and occupied state are places derived from the activities and conditions on either side, not separately elicited queue nodes. A simulation scenario is assembled from initial state, boundary conditions, parameters and candidate policies rather than represented as one process node; when the USER names such a regime, save it as a scenario so later runs and experiments can name it. Data bindings and validation criteria stay in the Ledger until a separate integration represents them.

## Origin and status

| Record         | In the net                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `confirmed`    | Built; an `inferred` or `assumed` origin stays named in its reflection                                         |
| `tentative`    | Built, with a reflection naming what awaits the USER's agreement                                               |
| `open`         | A placeholder parameter or externally supplied input, named as provisional                                     |
| `conflicted`   | Each account kept visible: alternative paths gated on a parameter, or the element held back, with a reflection |
| `out-of-scope` | Omitted; where something crosses that line, it is a `boundary`                                                 |

## Construction patterns

Patterns are candidate transformations whose premises must already be present in the USER's account. They do not supply missing facts; stand-ins mark where facts are missing.

### Timed work

When a logical activity occupies consequential time, represent start, in-progress state, and completion separately. Preserve what remains occupied while work runs. Use a constant or named parameter when only a typical duration is supported; do not invent a distribution family or tail.

### Conditional or probabilistic outcome

Represent mutually exclusive outcomes with distinct enabled paths. Use a recorded rule, condition, parameter, or probability. If no probability is supported, do not manufacture an even split; use a named parameter, a non-probabilistic condition when available, or an externally supplied outcome.

### Contended resource

Hold available instances in shared resource state. A work-start transition acquires the required tokens; competing work cannot use them while held; success, failure, cancellation, or recovery returns them when the account says they become available. Preserve changed wear, qualification, location, or other consequential state on return.

Compile practiced contention rules into guards or priorities only when their selecting conditions are recorded.

### Consumed, reserved, and read inputs

- **Consumed or transformed:** remove the input from its source state and produce only the outputs the account establishes.
- **Reserved:** remove or lock availability at start, carry the association through work, and return the input at release.
- **Read:** allow the activity to depend on the input without making it unavailable to other work.

Confirm that the target's actual arc semantics implement the intended use; syntactic convenience does not override operational meaning.

### Gate, release, trigger, or prerequisite

Represent the observable enabling condition and the event or actor that changes it. Use a guard, state place, external source, or timed event appropriate to the account. Preserve overrides rather than silently weakening the gate.

### Batch, lot, load, or grouped movement

Represent formation by the recorded count, clock, or combined release rule. Preserve whether the group stays together and any split, merge, setup, or capacity cost. Do not infer a preferred batch size from a maximum.

### Mode change

Represent source and destination availability states with directional transitions when setup, changeover, restart, handover, or reconfiguration changes behavior. Attach time, material, scrap, or capacity loss to the direction where it occurs.

### Event, failure, retry, and recovery

Represent disruptions separately from normal progress when they befall the process rather than advance it. Place the return path at the recorded retry scope: failed activity, repeated subsequence, whole-case restart, diversion, or scrap. Preserve the work, state, and occupied resources that survive or reset.

### Continuous quantity and threshold

Carry a changing quantity in state with the supported evolution law. Fire consequential behavior at the recorded threshold and add a reset only when one is supported. Omit a floating continuous variable that affects no objective or process behavior.

### Observation and command

When the account lets a physical condition and what the system knows of it diverge, represent them apart: the condition, the latest reading with its age, and the decision taken on that reading. Likewise separate issuing a command from its delivery, acceptance and physical effect where any of these can fail or lag. Collapse them only as a labelled simplification when no objective depends on the gap.

### Spatial transfer

Represent transfer as an activity when location change consumes time or resources. Reserve transport capacity when contended and preserve origin-to-destination dependence when supported.

### Hidden waiting

Derive waiting from unavailable resources, unmet prerequisites, calendar state, batching, transport, policy, or disruption. An intermediate place may be required, but its meaning comes from those surrounding conditions rather than an elicited queue object.

## Inference, approximation, and target loss

Name every representational choice not directly supported by the operational account. Preserve its reason, consequence, and route to checking as a reflection anchored to the net elements, claims and entities it concerns.

Acceptable when visible:

- a stand-in for a missing quantity, trigger, outcome or rule, as described above;
- collapsing several named micro-steps when no objective depends on their internal order;
- using a constant for variation judged immaterial to the stated purpose;
- choosing one of several behaviorally equivalent net factorizations; and
- supplying layout positions that carry no operational meaning.

Not acceptable:

- presenting generic operations knowledge, or a stand-in, as the USER's account;
- averaging conflicting or context-dependent values;
- interpreting “unknown” as a conventional distribution;
- treating a posted rule as practiced behavior;
- building invented release, recovery, retry, or branch semantics as if elicited, instead of a labelled stand-in; or
- claiming a net is loadable, valid, or simulated without corresponding tool evidence.

Record, as reflections, account material the target or current tools cannot faithfully carry, including qualitative objectives without usable metrics, policy whose deciding condition remains tacit, live data bindings not connected by the current path, validation judgments outside net semantics, and contextual distinctions collapsed by an accepted simplification.

## Existing-net analysis and bounded change

Start from the changed or disputed operational material and inspect the current net before mutation. Identify the elements whose meaning depends on that material and the desired delta.

The net is a draft. When changed or newly established meaning does not fit the current representation, revise that representation with the update and remove tools: give a place a type that carries the needed quantity, replace a transition, remove superseded structure. Make the revision as one bounded change and never leave obsolete elements beside their replacements.

After a supported change, report what was added, what was only inspected, which objective consequences changed, and which assumptions or losses opened or closed.
