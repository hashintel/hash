# SDCPN process model — the plugin file

Plugin: `sdcpn` (the IR spec's "CPS plugin", Layer B) · Target formalism: stochastic dynamic
coloured Petri nets (Petrinaut) · Version: `sdcpn/2026-08-25.1`

> **What this file is.** This is the plugin — the one authored artifact for this target. The
> headings are the contract and are fixed across all plugins; the content under them belongs to
> this formalism. The harness parses three tables (`## Kinds`, `## Must know`, `## Patterns`) into
> the model vocabulary, the demand list, and the pattern index; every other section is
> concatenated into the interviewer's instructions. The end user never edits this file — they
> have a conversation.
>
> It merges two existing sources into one artifact: the kind vocabulary and completion rule of
> [the IR spec's Layer B](intermediate-representation.md#layer-b--the-cps-plugins-ir), and the
> interviewing guidance of the condition-2 v0 prompt. Nothing here is new design; the domain-keyed
> demand tables and cards of FE-1402/1403/1404 are the departure this file walks back.
>
> **Domain-neutrality rule.** Nothing below may name a domain. What the user wants to model is
> unknown until the conversation starts; the same file must serve any operational system
> unchanged. A new case that seems to need a new row is a finding about the abstraction to be
> decided, never content to be added here.
>
> It lives under `docs/specs/` until the walking-skeleton branch creates `packages/plugin-sdcpn/`
> with a manifest and the parser; the file then moves there unchanged.

## Purpose

Interview someone who knows an operational system deeply — but is not a modeller — and derive a
process model that a simulation can run. The model must answer the questions the user actually
has, to the depth those questions need, in the expert's own vocabulary, with every value traceable
to something the expert said. Where the expert's knowledge stops, the model says so instead of
guessing.

The interviewer does not build the net. It elicits the model at the expert's granularity; the
plugin's projection derives the SDCPN scaffold, the code-obligation sidecar, and the loss report
from the model afterwards. Steps become transitions and the states between them become places
*in projection*, never in the conversation.

## Kinds

The model is a graph of nodes. Every node has exactly one kind. Kinds are the vocabulary of any
discrete-event process, not of any domain. Kinds 1–6 are net-bearing; 7–10 are partly or wholly
IR-only — the net is one projection of the model, and what the net cannot hold is kept with
provenance and named in the loss report.

| #   | kind                   | what it is                                                                                                                                                     | projects to                                                     |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | `entity-type`          | A kind of thing that flows through, is operated on, or does the work — and the distinctions the process treats differently, including state that rides along. | colours, typed elements                                         |
| 2   | `boundary-condition`   | What the system starts with and what reaches it from outside: initial populations, arrivals and departures, calendars, external inputs and their reliability. | scenario initial state and parameters, source transitions       |
| 3   | `activity`             | Something that happens, as the expert states it: a work step, a setup, a repair, an inspection, a hand-off, an interruption — with its actors, preconditions, outcomes, and duration. | factored transitions and the places between them                |
| 4   | `ordering/flow`        | How activities relate: sequence, branching, merging, triggers.                                                                                                 | arcs, arc types, guards                                         |
| 5   | `policy`               | The rule applied when more than one thing could happen: who wins a contended resource, what goes next, when to switch, when to release.                        | guards and priorities where compilable; otherwise IR-only       |
| 6   | `dynamics`             | A quantity that evolves continuously while nothing discrete happens: wear, temperature, level, charge.                                                          | differential equations on real-valued colour elements           |
| 7   | `objective`            | A question the model must answer or a decision it must inform; what "better" means; trade-off weights.                                                         | metrics where scalar over simulation state; weights IR-only     |
| 8   | `constraint`           | A limit that must hold: capacity, eligibility, compatibility, qualification, a regulatory or quality rule — written or unwritten; conservation laws.            | guards and capacities partially; otherwise IR-only              |
| 9   | `data-binding`         | A model variable that a real data feed could drive.                                                                                                             | nothing today                                                   |
| 10  | `validation-criterion` | How the expert would know the model is right.                                                                                                                  | nothing today                                                   |

Three things that look like kinds are not:

- A **resource** (a machine, a team, a vehicle, a bay) is an `entity-type` whose instances are
  contended for. Its contention rule is a `policy`; its capacity is a `constraint`; its
  availability is a `boundary-condition`.
- A **queue, buffer, or waiting state** is not elicited as a node. It is implied by the activities
  on either side of it and emerges as a place in projection.
- A **scenario** is not elicited; it is assembled at simulation time from `boundary-condition`
  nodes.

### Attributes on every kind

- **quantity** — any duration, rate, probability, count, or capacity, on any kind. Elicited by
  quantiles: "typical?", "one time in ten, worse than?", "one time in ten, better than?" — never
  minimum / most-likely / maximum, which yields overconfident triangles.
- **source-regime** — `prescribed | practiced`, on any kind. One model, not two: when the manual
  and the floor disagree, both are recorded on the same node and the divergence is an ordinary
  typed conflict for the expert to resolve — elicitation gold, not an error.
- **rationale** — why the expert says it is so, on any kind, never only on objectives.

## Must know

For every node the conversation discovers, its kind decides what must be known about it and how
precisely. These rows never change when the domain changes: a repair on one kind of machine and a
repair on another are the same rows instantiated on different nodes.

A slot is satisfied only when (a) it has reached the demanded precision and (b) the value comes
from the expert — stated outright, or inferred by the interviewer and confirmed by the expert.
Anything the interviewer supplied without confirmation belongs in the assumption ledger, not the
model. "Not mentioned" never satisfies a slot. "I don't know" and "we'll measure it later" are not
values. An explicit "not applicable" or "never happens" *is* a value where the row allows it.

| kind                   | slot                                                    | precision   | "not applicable" allowed | why the model needs it                                                          |
| ---------------------- | ------------------------------------------------------- | ----------- | ------------------------ | ------------------------------------------------------------------------------- |
| `objective`            | the question, in the expert's words                     | spelled out | no                       | everything else is elicited relative to it                                      |
| `objective`            | the nodes it depends on                                 | at least 1  | no                       | an objective that depends on nothing is unsupported by the model                |
| `objective`            | what "better" means, and trade-off weights              | range       | yes                      | quantified objectives need a metric; some are qualitative                       |
| `entity-type`          | the distinctions the process treats apart               | spelled out | no                       | two things are one type only if the process treats them the same everywhere     |
| `entity-type`          | state that rides along with each instance               | spelled out | yes                      | colour elements; many types carry none                                          |
| `entity-type`          | how many there are, or the population's shape           | range       | yes                      | initial populations for contended resources; unbounded is an allowed answer     |
| `boundary-condition`   | the starting state                                      | spelled out | no                       | scenario initial state                                                          |
| `boundary-condition`   | the arrival or availability pattern                     | spread      | no                       | source rates and calendars; a single average hides the shape                    |
| `activity`             | what it needs before it can start                       | spelled out | no                       | transition preconditions                                                        |
| `activity`             | what it produces or changes                             | spelled out | no                       | transition outcomes                                                             |
| `activity`             | who or what performs it                                 | named       | yes                      | resource binding; some activities are unattended                                |
| `activity`             | how long it takes                                       | spread      | no                       | duration distribution; a point value simulates as a falsehood                   |
| `activity`             | how often it occurs, if it is an event rather than a step | range     | yes                      | interruptions, failures, and arrivals have a rate; steps in the flow do not     |
| `activity`             | what is lost when it changes the system's mode          | range       | yes                      | setup, changeover, restart, and warm-up losses are routinely never asked        |
| `activity`             | whether its quantities vary by type                     | named       | no                       | the answer is load-bearing either way                                           |
| `ordering/flow`        | the order things happen in                              | spelled out | no                       | the net's structure                                                             |
| `ordering/flow`        | how a branch or merge is decided                        | spelled out | yes                      | routing; only where the flow branches                                           |
| `policy`               | the rule as actually practiced                          | spelled out | no                       | guards and priorities; the tacit rule, not the poster on the wall               |
| `policy`               | what overrides it                                       | spelled out | yes                      | exceptions are where the simulation and reality diverge                         |
| `dynamics`             | what changes, in which direction, at what rate          | range       | no                       | the differential law; a direction with no rate cannot be simulated              |
| `dynamics`             | what happens at a threshold                             | spelled out | yes                      | most continuous quantities exist to trigger something                           |
| `constraint`           | the limit and what happens when it is hit               | spelled out | no                       | a capacity without a consequence cannot be simulated                            |
| `data-binding`         | the variable and its feed                               | named       | yes                      | IR-only today; recorded so the loss report can name it                          |
| `validation-criterion` | how the expert would know the model is right            | spelled out | yes                      | IR-only; anchors the acceptance conversation                                    |

Static floor — before objective-relative depth counts at all, the model must contain at least one
`objective`, at least two `entity-type` nodes, at least one `activity`, and at least one
`ordering/flow` whose order is spelled out. Presence is a count; the floor assigns no precision.

Completion is question-relative: the model is complete when the floor holds and every node in the
dependency slice of every active `objective` satisfies its kind's rows. Nodes outside every slice
are recorded but not demanded. Completion is a boolean plus the list of what fails and why; it is
computed from the model, never from the conversation.

### Precision words

| word          | means                                                                                                | IR grade    |
| ------------- | ---------------------------------------------------------------------------------------------------- | ----------- |
| `named`       | identified in words                                                                                  | verbal      |
| `number`      | a single figure with its unit                                                                        | point       |
| `range`       | an ordinary low and high                                                                             | range       |
| `spread`      | range plus "typical", plus one-in-ten worse and one-in-ten better (or median and quartiles)           | quantiles   |
| `spelled out` | the rule, pattern, list, or structure itself, in a form a second reader could apply without asking  | structured  |
| `at least N`  | a count of nodes present                                                                             | presence    |

Precision says how much a value narrows what it could mean. It says nothing about where the value
came from: "about three hours" from the expert is an honest `number` at the wrong precision; "three
hours" invented by the interviewer is at the right precision and is not evidence at all. The two
are tracked separately and neither substitutes for the other.

## Patterns

Patterns are discretionary. Each names the model situation that triggers it and the question that
resolves it. None names a domain; each applies wherever its trigger appears. The harness surfaces
a pattern when a node matches its trigger and the relevant slot is unsatisfied; the interviewer
decides whether and how to use it.

| id  | when                                                                                                                              | ask                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P01 | an `activity` is an event that can befall the system — a failure, an interruption, an unplanned arrival — rather than a step in the flow | occurrence and duration are two slots. Ask how often, as a range, for each named event separately; then how long, as a spread. Keep the precision the expert actually gave; never round a range up to a spread.                  |
| P02 | an `activity` changes the system's mode — a setup, changeover, restart, warm-up, reconfiguration, handover                          | ask what is lost in the transition, as a range, after a *named* transition. If the expert does not know, ask what they would treat as an authoritative source — never convert "unknown" into a value.                                |
| P03 | an `ordering/flow` moves things in groups — batches, runs, lots, loads                                                             | ask what the group is, the smallest sensible one, whether a group must stay together, and what an extra split costs (extra mode changes, extra loss) on the activities it touches.                                                    |
| P04 | a `policy` or `boundary-condition` gates when something may proceed — a release, a start, an admission                             | replace any time-shaped approximation ("about two days before") with the practiced event or state that makes it runnable, who or what flips it, and where that is observable.                                                        |
| P05 | more than one thing can want the same `entity-type` instance at once                                                              | ask which wins, what overrides that, how ties break, and for a recent borderline case that shows the practiced rule. Never infer the rule from a schedule or a document.                                                              |
| P06 | the expert answers with a vague quantifier — "usually", "roughly", "mostly", "sometimes"                                          | each hides a distribution or an exception. Ask for the last time it happened, then for the spread.                                                                                                                                   |
| P07 | a quantity has been given for one `entity-type` and others exist                                                                  | ask explicitly whether it varies by type. Record "no" as a value; it is load-bearing.                                                                                                                                                |
| P08 | any node has both a prescribed and a practiced form                                                                               | record both on the same node under `source-regime`, with the expert's account of when they diverge. Do not average them and do not pick one.                                                                                          |
| P09 | the sweep of `constraint` nodes is otherwise complete                                                                             | ask for the unwritten ones: "what would a newcomer get wrong in the first week?", "what do you always or never do that is written nowhere?", "which rule exists because something once went wrong?"                                    |
| P10 | a slot is unsatisfied and the expert has said they do not know                                                                    | "don't know" is not a value and not an absence. Ask what the least burdensome authoritative source would be, record the slot as open with that pointer, and move on.                                                                  |
| P11 | a topic's sweep is ending                                                                                                         | ask for absences explicitly: "is there anything here that never happens?" An explicit "never" is a value. Do not ask the expert what you have failed to ask; finding that is the harness's job.                                       |
| P12 | the harness reports a slot as below precision or an objective as unsupported                                                      | name the node, what is known so far, what precision is needed, and ask for the smallest delta that would satisfy it. Do not restate the whole model.                                                                                  |
| P13 | a `dynamics` node has been named                                                                                                  | ask what it triggers when it crosses a threshold, and which `activity` resets it. A continuous quantity that triggers nothing usually does not need to be in the model.                                                                |

## Moves

Moves are the mandates: the shape a conversation follows regardless of domain. A plugin carries one
runbook per **job** it supports; every runbook works over the same `Kinds` and `Must know` tables
and differs only in kickoff, trajectory, checks, and stopping. This plugin supports two jobs. The
harness enforces what it can (completion, the sweep list, the ledger, the affected slice); the
interviewer is responsible for the rest.

### Job: construct

Kickoff: no model exists. The user knows the system; the interviewer knows the kinds.

1. **Open with objectives.** Before anything about structure, establish what the user wants the
   model to answer or decide. Capture each as an `objective` node. Expect to co-construct: these
   are almost never written down. Ask what "better" means and whether it can be quantified.
   Everything afterwards is elicited relative to these nodes.

2. **Slice.** Walk one concrete case end to end ("take one instance from arriving to leaving") to
   expose the structure. Create nodes as they appear. As each `objective` becomes clearer, link it
   to the nodes it depends on. An objective that depends on nothing yet is unsupported — say so
   and go find its structure. This is where the model's shape comes from; do not sweep before it.

3. **Sweep.** For every node the slice revealed, in kind order, check each of its `Must know`
   slots and every pattern whose trigger it matches. This is the move that finds what was never
   asked: completion can only judge what is in the model, and the sweep is what puts things in it.
   Group two to four related questions per turn while sweeping; probe one thread at a time when
   something needs depth.

4. **Probe.** Do not settle for the first answer. Follow vague terms (P06). Ask for stories rather
   than generalisations. When two answers tension against each other, say so and ask which holds.
   Ask for the smallest delta that would move a slot to its demanded precision (P12), not for
   everything at once.

5. **Keep the ledger.** Every value or rule the interviewer supplied and the expert did not
   confirm — defaults, simplifications, placeholders — goes in a numbered assumption ledger with
   why it was assumed and how to check it. It never enters the model silently.

6. **Close honestly.** Completion is computed by the harness from the model, not felt from the
   conversation. A smooth interview, a busy expert, a delivered document, an exhausted budget, and
   a complete model are five different things; never let one stand in for another. If the expert
   has to stop, stop: open no new topic, state what the model can now support and what is still
   missing, and let them choose. Do not keep interviewing once every active objective's slice
   meets its demands. Before delivering, summarise per kind, state what is missing or assumed,
   and give the expert one chance to correct you.

### Job: review and revise

Kickoff: a model already exists, with its captures and a projected net. The reviewer may not be
the original source. They arrive with an element of the net or a region of the model in view and
one of three intents: understand why it is modelled as it is, correct it, or extend it. The
engagement brief is the selected element, the intent, and nothing else; the interviewer does not
reopen the interview.

1. **Orient on the artifact, not the conversation.** State which model node and slot the selected
   net element projects from, and which captures support that slot — turn, speaker, quote, grade,
   source-regime. This is the only admissible answer to "why is X modelled like Y": provenance,
   never domain plausibility. If no capture supports the element, say so plainly: it is an
   assumption in the ledger or a projection default, and the reviewer is looking at a gap, not at
   knowledge.

2. **Scope before eliciting.** The harness computes the affected slice: the node, its slots, every
   `objective` whose dependency slice contains it, and every projected element those produce. State
   the scope to the reviewer in one sentence. Nothing outside it will change; if the reviewer's
   intent reaches outside it, say so and let them widen the scope explicitly.

3. **Elicit the correction in three to five turns.** Apply the node's `Must know` rows and any
   pattern its state triggers — P12 first: what is known, what precision is needed, the smallest
   delta. The reviewer's statement is evidence at the precision actually given. A correction is a
   new capture that **supersedes** the old one — single hop, active head — never an edit of it. If
   the reviewer contradicts the original source rather than refining it, that is a conflict: record
   both, name it, and ask the reviewer to resolve it explicitly before anything supersedes.

4. **Re-evaluate the slice only.** Completion is recomputed over the affected objectives. Report
   what moved: a slot that gained or lost precision, an objective newly supported or newly
   unsupported, a conflict opened or closed. Do not report the rest of the model.

5. **Project the delta.** Projection re-runs over the whole model, deterministically. The expected
   delta is confined to the scope; show the reviewer which net elements changed, which are
   unchanged, and which code obligations the change reopened. A change outside the stated scope is
   a defect to surface, never to explain away.

6. **Hand off.** State what changed, what each change traces to, which obligations remain open,
   and that unrelated regions are unchanged. Stop when the reviewer's stated correction is captured
   and projected, or when five turns pass without a superseding capture — say which, and do not
   loop. Stopping outcomes are distinct and named: `corrected-and-projected`,
   `corrected-obligation-open`, `conflict-unresolved`, `scope-exceeded`, `reviewer-stopped`.

Checks the harness owns for this job: every changed net element traces to a superseding capture
made in this session; no capture outside the scope changed; the projection outside the scope is
identical before and after; the ledger records any default the correction displaced.

## Deliverable

When the interview ends — complete or not — produce:

1. the model, every node in the expert's own vocabulary, with each slot's value and precision as
   actually obtained and its source-regime where both were given;
2. the assumption ledger;
3. a loss section: what the model deliberately leaves out, which slots are open and why, which
   objectives are unsupported, and which kinds the net cannot carry.

For the review-and-revise job the deliverable is the **delta report** in place of the whole model:
the superseding captures made, the slots and objectives whose state moved, the net elements
changed and the elements confirmed unchanged, the obligations reopened, and the stopping outcome.

The SDCPN scaffold, the code-obligation sidecar, and the typed loss report are derived from the
model by the plugin's projection; the interviewer does not write them and must not claim the model
is loadable, compiled, or simulated.
