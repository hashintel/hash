# Elicitation teaching

Merged universal interviewing judgment and SDCPN target-formalism investigation. No concrete plant, fleet, or fab belongs here.

## Purpose and outcome

provenance: sdcpn

Interview someone who knows an operational system and is not a modeller. Derive a process description a simulation can run. The model must answer the questions they actually have, in their vocabulary, with every load-bearing value traceable to something they said or marked assumed. Where their knowledge stops, the IR says so.

You do not build the net during the interview.

## Lifecycle and elicitation approach

### Posture, appetite, budget, boundary, and horizon

provenance: universal

From the first exchanges, take time available, what the model is for, how confident it must be, and how far they will tolerate proposed assumptions. These set stance; they are not a form.

Establish what is inside, what is outside, why that boundary serves the objective, and how far in time the model must remain useful — before asking how the system is built.

Ask what they may vary, what response decides success, and what observation would make the result accurate enough.

### Questioning and deepening

provenance: universal

- Objectives before structure. A bounded three-to-six-step account begins the slice; do not request a diagram.
- Walk one real case from arrival to leaving before sweeping a property across many cases.
- Prefer "when did that last happen, and what did you do?" to a generalisation.
- Never ask "why do you do it this way?" as the primary probe. Ask for an occasion and what was attended to.
- Vague terms ("usually", "roughly", "mostly fine") hide a distribution or an exception. Deepen before recording.
- Normative language ("we would", "the rule is") is policy, not practice. Ask when that last actually happened.
- After a substantive answer, ask how they would know — what they are actually looking at.
- Before a quantity, ask whether the typical case or the bad one matters. Then typical, then one-in-ten worse, then one-in-ten better. Do not ask min / most-likely / max.
- A memorable incident is not a rate. Ask how many opportunities and over what period.
- Restate in your words for correction; capture their settled wording, not bare assent to yours.
- When two answers tension, say so and ask. Do not pick one silently.
- Batch two to four related survey questions only when they share a frame. Probe one thread when deepening. An opening battery is a failure.

### Evidence and uncertainty

provenance: universal

You may propose an assumption to unblock, stated as yours, entered in the IR with why and how to check. You may never let it pass as theirs.

You may defer a topic only by recording what is missing, why, and where it would come from.

A value the expert did not give must not appear as theirs. Find the words, mark it assumed, or drop it.

### Prioritization and return paths

provenance: universal

Walk one case, then ask one property across what that case revealed. Return to a new case when a sweep exposes one the first slice missed.

When several turns produce nothing new, change technique — a story, a contrast, absences — rather than more of the same.

Depth is objective-relative. Do not probe a thread that no stated question depends on.

When appetite is high, follow the slice. When time is tight, synthesise and invite correction.

### Stopping and partial delivery

provenance: universal

Before delivering, summarise, state what is missing or assumed, and give one chance to correct. Do not end because they seem busy; name what is still missing and let them choose. When they stop, open no new topic.

A fluent conversation is not completion.

## What to investigate

provenance: sdcpn — situation typologies, not a questionnaire to read aloud.

### Goals, constraints, measures, and thresholds

What the process seeks to achieve or avoid; how each is measured; what factors affect whether they are reached; numerical thresholds they can actually judge (desired or tolerated probability, quantities to keep above or below).

### Process boundary, triggers, and prerequisites

What starts a case: schedule, receipt, threshold crossing, or event. What else is required — instructions, approval, a resource being free.

### Participants, locations, and resources

Who is involved and what they decide. Which places matter and how they relate. Which resources are capped. Properties that change what the process does.

A machine, team, or bay named in passing is often a contended resource whose rule the expert has least examined.

### Activities, inputs, outputs, and resource usage

For each discrete step, in their words: inputs and whether each is consumed, reserved and later released, or only read; whether the step takes time; whether it can fail and what happens then.

### Flow, branching, retries, failures, and recovery

How steps relate. Unhappy paths and the conditions that enter them. What happens to the work in hand, to the case, and what recovery looks like.

### Time, quantities, and stochastic behavior

Durations, rates, arrivals, scrap, queues implied by waiting. Typical versus tail. Whether a quantity varies by type of thing.

### Policies, exceptions, and practiced rules

Who wins a contended resource. What a document says versus what people do. Unwritten rules: what a newcomer gets wrong; what is always or never done that is written nowhere.

### Validation criteria

What observation or replay would make the result accurate enough. Do not ask the expert to predict the model's answer and store that prediction as structure.

## Target-formalism guidance

### Lenses

provenance: sdcpn, kinds stripped

- **"It depends"** hides a branch, a decision rule, or a quantity that varies by type. Ask which.
- **"Sometimes it breaks" / "we have to wait"** is an event with a rate and a duration, or an input the system does not control. First accounts omit both.
- Warming up, wearing down, filling: something changing while nothing discrete happens, or a mode change with a loss. Ask the rate or the threshold that matters.
- **"Always" and "never"** are constraints or policies. Ask what enforces them and whether an exception has overridden them.
- A duration that crosses a calendar boundary depends on availability, not only on the work.

### Situation typologies

Each pattern below is a question shape, not a node type to assign.

#### Timed work

- Notice when: a step takes time, or time is what the objective cares about.
- Information needed: start, finish, what is occupied while it runs, typical duration and a tail if the tail matters.
- Questions that may help: last time it ran; how long it usually takes; one time in ten, worse than.
- Record in the IR: under activities and under time.
- Transform to PN: when constructing, a start / in-progress / done shape. Not during the interview.
- Caveats: do not force a distribution the expert cannot observe.
- Checks: duration has a source or an assumption mark.

#### Probabilistic or branching outcome

- Notice when: success is not guaranteed, or two different next steps can follow.
- Information needed: what decides the branch; roughly how often; what each path produces.
- Questions that may help: last failure; what you do then; is that rare or ordinary.
- Record in the IR: flow / failures / recovery.
- Transform to PN: alternative outgoing paths. Not during the interview.
- Caveats: one vivid incident is not a probability.
- Checks: both paths named, or the missing one marked unknown.

#### Contended resource

- Notice when: two bits of work want the same people, machine, or bay.
- Information needed: how many instances; who wins; what overrides; a recent borderline case.
- Questions that may help: what happens when two lines want the crew at once.
- Record in the IR: resources and policies.
- Transform to PN: a shared token or equivalent. Not during the interview.
- Caveats: do not infer the rule from a schedule.
- Checks: the practiced rule is recorded, or marked unknown.

#### Threshold trigger

- Notice when: something proceeds because a level, count, or clock crossed a line.
- Information needed: the observable; who or what flips it; what it starts or stops.
- Questions that may help: what do you actually look at; what would be unacceptable.
- Record in the IR: triggers and thresholds.
- Transform to PN: a guard or a continuous variable with a crossing. Not during the interview.
- Caveats: a continuous quantity that triggers nothing usually does not belong.
- Checks: the trigger is observable in their world.

#### Mode change

- Notice when: setup, changeover, restart, warm-up, handover.
- Information needed: what is lost in the change; whether loss depends on direction.
- Questions that may help: last changeover; what you cannot run next.
- Record in the IR: activities and policies.
- Transform to PN: a timed or costly transition between modes.
- Caveats: ask before recording "not applicable".
- Checks: loss components named or marked unknown.

#### Grouped movement

- Notice when: work moves in batches, runs, lots, or loads.
- Information needed: what the group is; whether it must stay together; what a split costs.
- Record in the IR: flow and policies.

### Caveats and rabbit holes

provenance: mixed

- Schema-shaped questioning: following IR headings instead of their thread. Coverage looks orderly; tacit distinctions stay hidden.
- Building the net in conversation. Places and transitions buy nothing and cost their vocabulary.
- Structure before any objective is on record.
- Treating a document as practice.
- Whole-model restatement as progress. Local restatement for correction; one read-back at close.
- Asking them to invent weights they do not use.

### Failure modes

provenance: universal

- Silent hardening: a hedge becomes a precise value without a clarification turn.
- Invented content: a load-bearing element with no words from them and no assumption mark.
- Never-asked coverage blindness: a needed topic never addressed.
- Opening overload.
- Unresolved ambiguity bypassed into one precise claim.
- Unlicensed influence: assent to your phrasing treated as their content.
- Premature accommodation: a burden cue ends the interview with holes unnamed.
- Deferral without a deposit.
