# Operational-Process and SDCPN Elicitation

This reference adds operational-process and SDCPN-specific guidance to `universal-elicitation.md`. Apply both under the same registers. The additions below do not restate or replace universal elicitation guidance.

The registers are not a questionnaire or phase sequence. **Recognition** suggests what may be present. **Operations** select ways to investigate an active gap. **Coverage** says what the operational account may need to explain. **Verification** checks the current interview and workpiece. Petri-net construction mechanics remain in `pn-construction.md` and are not interview vocabulary.

## Directives

### Build the operational account the purpose needs

For the person's simulation question, comparison, or decision, establish what should improve or be avoided, what may be varied, how outcomes are judged, and what observation would make the model credible enough for its intended use.

Every objective needs a traceable dependency on process material. Do not collect operational detail merely because the target could represent it, and do not record the person's prediction of an objective's answer as process structure.

### Keep target structure backstage

Ask about work, things, people, resources, conditions, decisions, time, failures, and outcomes in the person's vocabulary. Places, transitions, arcs, colours, tokens, firing, target schemas, and workpiece headings may guide attention but must not become the language or order of ordinary questions.

### Preserve operational context

A value without its applicable item, activity, direction, mode, operating regime, calendar, load, location, resource, or other condition may simulate as a falsehood. Preserve context when the operation treats cases differently. Keep quantities at the granularity the operation or available source can observe, and do not average distinct regimes merely to obtain one parameter.

### Treat operational patterns as hypotheses

Recurring operational shapes expose conditional information needs; they do not generate facts or model elements. Ask whether a shape is present and let the person's account supply its structure and vocabulary.

## Recognition

Recognition entries identify possibilities to test, not facts to record automatically or reasons to abandon the active conversational thread.

### Language and account signals

- **“It depends”** may indicate a branch, practiced decision rule, contextual quantity, or distinction among kinds of work or resource.
- **“Sometimes it breaks,” “we have to wait,” or “it arrives unexpectedly”** may indicate a disruption, blocked prerequisite, unavailable resource, calendar, or uncontrolled boundary input.
- **“Always” or “never”** may indicate a constraint, policy, enforcement mechanism, or unexamined exception.
- **Warming up, wearing down, charging, filling, cooling, or draining** may indicate continuous change, a consequential threshold, or a directional mode change.
- **Duration that crosses a shift, opening window, or calendar boundary** may depend on availability rather than work time alone.
- **A person, machine, team, vehicle, bay, tool, dataset, or location named in passing** may participate as performer, contended resource, prerequisite, information source, transport concern, boundary, or merely context.
- **Approval, instruction, receipt, schedule, threshold, or event language** may identify what starts or enables work rather than an ordinary process activity.

### Operational situation patterns

#### Timed work

An activity occupies time or timing affects the objective. Possible distinctions include start and finish, what remains unavailable while it runs, typical versus tail duration, and dependence on load, kind, calendar, location, or resource availability.

#### Conditional or probabilistic outcome

An activity is not guaranteed to succeed or different next states may follow. Possible distinctions include what decides the outcome, what each path produces, whether an observed rate exists, which contexts alter it, and what recovery follows.

#### Contended resource

Several activities or cases want the same person, machine, bay, vehicle, tool, space, or capability. Possible distinctions include count, indivisibility, joint staffing, eligibility, reservation and release, practiced priority, tie-breaking, overrides, and changed state on return.

#### Consumed, reserved, or read input

An activity may consume or transform an input, reserve it so others cannot use it until release, or read it without making it unavailable. The same named thing may play different roles in different activities.

#### Gate, release, trigger, or prerequisite

Work becomes enabled by an observable event or condition. Possible distinctions include what is observed, who or what changes it, where it is visible, whether it is external, and what can override it.

#### Continuous quantity and threshold

A level, temperature, charge, wear state, count, or other quantity changes while no discrete activity occurs. Possible distinctions include direction and rate, noise or spread, consequential thresholds, triggered effects, and reset behavior.

#### Mode change

Setup, changeover, restart, warm-up, handover, reconfiguration, or cleaning changes what can happen next. Possible distinctions include direction, time, scrap, material, capacity, and effects beyond the local activity.

#### Batch, lot, load, or grouped movement

Work moves or is processed in groups. Possible distinctions include the grouping unit, minimum or preferred size, count-versus-clock release, whether members stay together, splitting or merging, and the cost of breaking the group.

#### Spatial transfer

A change of location consumes time, capacity, or a transport resource or changes eligibility. Possible distinctions include what moves, origin and destination, duration by direction, transport contention, and whether the transfer is inside the modeled boundary.

#### Event, failure, retry, and recovery

A disruption befalls the operation rather than advancing normal work, or a case repeats part or all of its process. Possible distinctions include occurrence, affected work and resources, duration, retry scope, surviving state, rollback or compensation, retry limit, diversion, and terminal outcome.

#### Policy under pressure

More than one action is possible or more than one claimant wants the same capability. Possible distinctions include posted and practiced rules, local judgment, tie-breaking, exception authority, and the conditions selecting a different rule.

#### Hidden waiting

A gap between activities may be caused by unavailable input, contention, a calendar, release policy, batching, transport, approval, or recovery. Waiting is evidence to explain through surrounding behavior, not automatically an activity or independently elicited node.

## Operations

Use the universal Operations as the primary interviewing repertoire. These additions bind them to operational-process concerns.

### Choose the case unit before slicing

When several things flow, ask which unit makes one concrete case intelligible—an order, item, batch, patient, vehicle, request, or another term the person supplies. Follow it from admission or trigger to termination or handoff.

### Link the slice to the objective

As the case unfolds, note which activities, decisions, resources, conditions, and outcomes the stated objective depends on. If the objective depends on nothing yet recorded, continue the case rather than collecting detached detail.

### Expose the process spine

Ask what starts the case, what happens next, what each activity needs and changes, how branches are decided, where waiting occurs and why, and what ends the case. A list of activities without order, triggers, or outcomes is not a process spine.

### Sweep operational concerns, not headings

After a slice, choose one property that matters to the objective and examine it across the relevant things already discovered. Useful sweeps include duration, input-use mode, availability, contextual variation, practiced policy, failure and recovery, boundary behavior, or evidence quality.

### Distinguish consumed, reserved, and read inputs

For each load-bearing activity and input, ask whether the input is used up or transformed, made unavailable and later released, or observed while remaining available. If reserved, establish when and in what state it returns.

### Sweep what can befall an activity

Across the activities exposed by a slice, investigate relevant disruptions: work-item failure, deadline expiry, unavailable resource, external event, and constraint violation. Establish what happens to the work, the case, occupied resources, and recovery.

### Test practiced policy with a borderline case

When a stated rule decides what happens next, ask about the last contested or exceptional case to expose tie-breaking, overrides, and the conditions selecting a different practiced rule.

### Close a resource account

For a contended resource, establish usable instance count or an honest unknown, eligibility, joint requirements, acquisition, unavailability while held, release, changed state on return, and the rule used when demand exceeds availability.

### Close a mode change in both directions

Ask whether A-to-B differs from B-to-A and whether losses propagate beyond the local activity. Preserve time, material, capacity, and sequencing consequences separately when the operation does.

### Turn waiting into a causal question

Ask what the case is waiting for and what observable event makes it able to continue. Record the surrounding prerequisite, resource, policy, calendar, batch, transport, or disruption rather than treating waiting itself as an activity.

### Ask what is conserved

When quantities enter and leave a process, ask what total should remain constant, where loss is possible, and which units the operation uses. Treat the answer as a constraint only when the person's account supports it.

### Establish retry scope

Ask whether failure repeats one activity, a subsequence, or the whole case; diverts or scraps the case; and which work, state, and occupied resources survive or reset.

### Establish validation from observable behavior

Ask what observation, replay, historical comparison, or expert judgment would make the model credible for its intended question. Preserve validation evidence separately from the process behavior it tests.

## Coverage

Coverage identifies what the process-model workpiece may need for the stated purpose and downstream SDCPN construction. It is neither question order nor a demand to populate irrelevant categories.

### Purpose, goals, measures, constraints, and thresholds

Preserve what the model must answer or compare, for whom, what should improve or be avoided, what may be varied, what “better” means, and any importance, trade-off, safety condition, tolerated probability, or threshold the person can actually judge. Qualitative goals must not be forced into invented scalar weights.

### Process boundary, triggers, prerequisites, and initial conditions

Preserve what is inside and outside, what enters or leaves, what starts or resumes a case, calendars and availability, approvals or instructions, external events, initial populations, and the reliability of boundary inputs where consequential.

### Participants, locations, flowing things, and resources

Preserve who or what flows, performs, decides, supplies, occupies, or constrains the process; distinctions the operation treats differently; relevant carried state; counts and population shape; qualifications and compatibility; and how locations or transfers affect behavior.

### Activities, inputs, outputs, and resource use

For each consequential logical activity, preserve its operational name, prerequisites, performer, inputs, whether each input is consumed, reserved, or read, outputs and state changes, duration, success and failure outcomes, and contextual variation. One logical activity may later require several Petri-net elements; do not split it into target nodes during elicitation.

### Flow, branching, joining, failure, retry, and recovery

Preserve activity order, what decides branches and joins, what can interrupt normal flow, conditions for unhappy paths, retry and recovery scope, what happens to work and resources, and terminal outcomes.

### Time, quantities, arrivals, and stochastic behavior

Preserve durations, rates, counts, capacities, probabilities, arrival and availability patterns, relevant typical and tail behavior, contextual dependence, continuous quantities, direction and rate of change, variation, thresholds, and resets at the precision the evidence supports.

### Policies, exceptions, practiced rules, and contextual regimes

Preserve rules applied when more than one thing could happen, contention priorities, tie-breaking, release conditions, overrides, prescribed versus practiced accounts, and the context in which each account holds.

### Validation, evidence sources, and data bindings

Preserve how the person would know the model is credible, what observations or historical data could test it, which variables a real feed might drive, the source or dataset for each binding, who or what could answer missing values, and where evidence remains unavailable.

### Things not independently elicited as target nodes

- A queue, buffer, or waiting state is ordinarily explained by surrounding activities and conditions and may emerge as construction structure.
- A scenario is assembled from boundary conditions, initial state, parameters, and candidate policies at simulation time.
- A resource is an operational role combining relevant identity, capacity, availability, acquisition, release, and policy; it has no single universal target shape.
- A physical location becomes target structure only through a recorded operational effect; it is not automatically a Petri-net place.

## Verification

Apply these checks while eliciting and maintaining the workpiece. Construction and delivery checks live in `checks.md`.

### Purpose and process

- At least one simulation question, comparison, or decision is stated in the person's terms.
- Every objective depends on recorded process material or remains visibly unsupported.
- A concrete case has an admission or trigger, ordered activities, relevant branch conditions, and an outcome or handoff.

### Operational semantics

- Load-bearing inputs are distinguished as consumed, reserved and later released, or read while remaining available.
- A contended resource has count or an honest unknown, acquisition, unavailability while held, release, and practiced contention policy where required.
- Failure records the fate of the work, retry scope, surviving state, occupied resources, recovery, and terminal result where consequential.
- Hidden waiting has not silently become an activity or unexplained queue.
- Mode-change and spatial-transfer effects preserve direction and context where they differ.

### Quantities and context

- A duration, rate, probability, count, or threshold retains the item, activity, mode, direction, load, location, calendar, or other condition that selects it.
- A point value stands only where constancy or a purpose-relative simplification is supported and named.
- Prescribed and practiced regimes or contextual variants have not been averaged into one false value.

### Failure signals and repairs

- **Unsupported objective:** the model question depends on no recorded process material. Return to a concrete case that bears on it.
- **Dead process spine:** activities exist but their order, triggers, or outcomes do not. Continue the slice or ask the smallest connecting question.
- **Resource disappearance:** a reusable capability is acquired but its release or changed return state is missing. Re-enter resource-use Coverage.
- **Practice laundering:** a document's rule is recorded as practice without an operational case. Use a borderline or last-occurrence operation.
- **Context collapse:** values differing by item, direction, mode, location, load, or source regime become one unconditional value. Restore the selecting context.
- **Pattern-generated fact:** a situation pattern supplied structure the person did not establish. Remove or mark the assumption, then ask whether the pattern applies.
- **Target leakage:** questions are framed as places, transitions, arcs, or workpiece fields. Translate back to operational events, conditions, things, and consequences.
