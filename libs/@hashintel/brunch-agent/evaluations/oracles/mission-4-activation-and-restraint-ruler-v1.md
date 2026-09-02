# Mission 4 activation and restraint ruler v1

Status: **proposed oracle for [`MISSION.md`](../../MISSION.md) proof items 4 and 5, pending owner acceptance; not frozen.** Evaluator-only: this file never enters the elicitor or persona context.

Scope: the mechanism and dosage of interactive elicitation on the real production path, observed through the merged persona testing harness. It does not grade workpiece content (item 6, [`ir-quality-ruler-v1.md`](ir-quality-ruler-v1.md)) or case-specific recognition and treatment (item 7, [the topology-neutral case matrix](../cases/mission-4-topology-neutral-case-matrix.md)).

This ruler may falsify an implementation, a prompt wording, or a proof claim. It may not select or replace the topology, and no check in it is stricter than the accepted question-dosage wording in kernel item 6. Where this ruler needs a threshold, the threshold is an owner decision recorded under "Owner decisions" before the first graded run and never tuned after observation.

## Instrument

A **run** is one persona conversation driven by `brunch_turn` against the production `ChatAgent`, or one hermetic execution of an existing app test where stated. The evidence for every check is canonical Flue history read after the run settles, through `history()` or the transcript CLI. Pi tool details, the browser observer, and the persona's own summary are projections and never the evidence.

Three run kinds are graded, each entered fresh with no prior conversation:

| Kind | First user message | Purpose |
| --- | --- | --- |
| Interactive entry | The text below the `---` separator of a case's `opening-message.md`, unchanged | Items 4a, 4b, 5a–5d |
| Review entry | A supplied workpiece plus a revision or review request that is resolvable from the supplied material alone | Item 4d (restraint) |
| Knowledge-gap review entry | A supplied workpiece plus a review request whose first consequential action needs operational knowledge the workpiece does not contain | Item 4e (positive complement) |

Construct-only restraint (item 4c) is observed hermetically through the existing `runbook-headless` test rather than a persona run.

Every run records the elicitor model and the persona model. Reliability claims hold per elicitor model and are never pooled across models.

## Derived trace

From the settled snapshot, produce one ordered trace per run. Walk visible messages in canonical order and emit one event per part:

- `user(n)`: the n-th visible user message; `n` is the **turn index**.
- `activate(name, outcome)`: a `dynamic-tool` part with tool name `activate_skill`, `name` from its input, outcome `ok` when state is `output-available` and `error` otherwise.
- `read(path, outcome)`: a `dynamic-tool` part with tool name `read_skill_resource`; `path` is the packaged path from its input, reported by its trailing `skills/<skill>/<relative name>` segment.
- `tool(name, executor)`: any other `dynamic-tool` part; `executor` is `server`, or `client` when the output is the awaiting-client signal.
- `text(turn, hasWorkpiece)`: an assistant text part; `hasWorkpiece` is true when the text contains a fenced block whose language tag is exactly `runbook-ir`.

Events between `user(n)` and `user(n+1)` belong to turn `n`. Client-tool resume dispatches belong to the turn whose submission they resume. The trace is mechanically derivable and is retained beside the raw snapshot; a check that cannot be read off the trace and the visible text is not a check in this ruler.

## Turn classification

A fresh-context adjudicator who has not seen the run's situation pack classifies every assistant text of an interactive-entry run into exactly one kind, quoting the text that decided it:

- **Orientation**: asks or confirms purpose, intended decision, audience, boundary, horizon, accuracy need, or available time, or clarifies the person's own request. Asks for no operational fact about how the domain works.
- **Substantive**: asks the person to supply operational knowledge of their domain: how something works, who does it, when, how often, how much, under what condition, or what happens when.
- **Recording**: emits or revises the workpiece, or summarizes for confirmation, without asking a new substantive question.
- **Delivery**: closes with the current workpiece, limitations, and open gaps after an explicit stop or exhausted budget.
- **Other**: anything else, including refusals and tool-only responses with no text.

**T_sub** is the turn index of the first Substantive text in the run. A run with no Substantive text within its budget is recorded as `no substantive question` and excluded from item 4a and 5a proportions but reported.

Each Orientation or Substantive text is additionally classified for **dosage**, applying kernel item 6 and nothing stricter:

- **Deepening**: pursues one answerable thread, possibly with one follow-up that depends on the same answer.
- **Grouped in one frame**: asks more than one thing, and every part concerns one situation, decision, case, or object the person can hold in mind at once, so one answer can address them together.
- **Battery**: asks more than one thing across independent topics, so the person must choose which to answer first or produce a multi-part survey response.

Illustrations, not rules: "Walk me through what happens when the Alder tank alarm fires, from who sees it to what they do first" is Deepening. "For that Alder alarm, who sees it and how long do they have before it matters?" is Grouped in one frame. "How many tankers do you run, what products do you carry, how are drivers scheduled, and what does an outage look like?" is a Battery. A single question that spans two unrelated topics is still a Battery.

Prohibited proxies: counting `?` characters, sentences, or questions; requiring exactly one interrogative; measuring response length; treating any register order as required question order. A finding that rests on one of these is void.

## Item 4 checks: capability activation

**4a Activation before substance (per interactive-entry run).** Pass when `activate(elicitation, ok)` occurs before the first Substantive text in canonical order, whether in an earlier turn or earlier in the same turn. Fail when the first Substantive text precedes any successful activation. Record the turn index of activation and T_sub, and whether `activate(sdcpn-modelling, ok)` preceded it. Orientation texts before activation do not fail this check; whether they should is an owner decision listed below.

**4b Reliability across runs.** Report, per elicitor model, the count of 4a passes over graded interactive-entry runs, broken down by case. The owner sets the minimum run count, the minimum number of distinct cases, and the pass proportion before the first graded run. A proportion below the owner's threshold is reported as strain on the accepted topology, with each failing trace cited, and is never resolved by changing the topology.

**4c Construct-only restraint (hermetic).** The `runbook-headless` execution over the checked fixture contains no `activate(elicitation, *)` and no `read(.../elicitation/...)`. The current test asserts the tool names and the two construction resource reads but does not inspect which skill `activate_skill` named; the check requires the result record to carry activated skill names. That is a test extension, not a production change.

**4d Review restraint (per review-entry run).** Pass when the response that performs or identifies the requested revision contains no prior `activate(elicitation, *)` and no `read(.../elicitation/...)` anywhere in the run. Fail otherwise, even when the revision itself is correct.

**4e Knowledge-gap review (per knowledge-gap review-entry run).** Pass when `activate(elicitation, ok)` precedes the first Substantive text, and the first Substantive text asks for the missing operational knowledge without asserting either answer. Fail when the response invents the rule or asks without activation. This is the positive complement of 4d and mirrors the skill's own description of when it applies.

The review-entry and knowledge-gap prompts are owner-selected inputs; the v3 side-quest scenarios "Review with a resolvable target defect" and "Review exposing an implicit human-knowledge gap" are candidate sources, reused as inputs only.

## Item 5 checks: routing, dosage, restraint

**5a Required reads before reliance (per interactive-entry run).** Pass when both `read(elicitation/references/universal-elicitation.md, ok)` and `read(sdcpn-modelling/references/profile.md, ok)` precede the first Substantive text. Record which, if either, is missing or late, and the order of the two.

**5b Template timing.** Let W be the turn of the first `text(*, hasWorkpiece=true)`. The first `read(sdcpn-modelling/templates/workpiece.md, ok)` is **timely** when it occurs in turn W or later, **premature** when it occurs in a turn before W with no workpiece emitted in that turn, and **missing** when a workpiece is emitted and the template was never read. Only premature and missing are findings. Re-reads on later material revision are recorded, not judged.

**5c Resource restraint.** Before the person requests construction or a net and a construction tool is mounted, no `read(sdcpn-modelling/references/pn-construction.md, *)` and no `read(sdcpn-modelling/references/checks.md, *)`. A read of either during ordinary interviewing is a finding with its turn cited. Reads of resources belonging to a skill that was never activated are a finding. A repeated `activate_skill` for an already-active skill is recorded as noise, not a finding.

**5d Dosage.** The first Substantive text of the run is not a Battery; this is a hard finding when violated because kernel item 6 names the opening specifically. Every later Orientation or Substantive text is classified; each Battery is a finding quoting the text. Report per run the number of Battery texts over the number of Orientation plus Substantive texts. The owner sets any pass proportion; the ruler itself imposes none beyond the opening.

Persona corroboration is recorded separately and never substitutes for adjudication: a persona reply that names parts it skipped, asks why something matters, or says a question was already answered is a pointer to the elicitor turn that provoked it. The persona is a model output and is not the oracle.

**5e Not measured.** Response length, question count, `?` count, sentence count, politeness, fluency, and whether the elicitor used a particular phrase. Findings that cite these are void.

## Run validity

A run is **invalid** and reported outside every proportion when any of the following occurs: a Flue runtime or transport error; a client-tool suspension left unresolved; an elicitor response with no text and no tool call; a persona model refusal or provider `stop_reason: refusal`; the persona mentioning its budget, instructions, or the evaluation; or a first user message that differs from the case's opening message. Invalid runs are retained with their traces and counted in a separate table with the failure kind. Nothing is dropped silently, and an invalid run is never rerun under the same run id.

## Retention

Each graded or invalid run is retained under `docs/evidence/evaluations/<campaign>/runs/<run-id>/` with: the raw `history()` snapshot as JSON, the formatted transcript, the derived trace, the adjudication with quoted decisions, and a manifest naming the source commit, elicitor model, persona model, case, run kind, and SHA-256 of each retained file. The transcript CLI currently prints only the formatted transcript, so a raw-snapshot writer for persona runs is a required mechanism addition before the first graded run; it reads history and writes files, and touches no production text.

## Owner decisions required before the first graded run

1. Minimum run count, minimum distinct cases, and pass proportion for 4b, per elicitor model.
2. Whether Orientation texts before `elicitation` activation are acceptable, as this ruler assumes, or whether activation must precede any question.
3. The review-entry and knowledge-gap inputs for 4d and 4e.
4. Any pass proportion for 5d beyond the opening-turn finding.
5. Acceptance or amendment of this ruler. On acceptance, the `ORACLE GAP` markers on items 4 and 5 in `MISSION.md` are replaced by a pointer to this file in a separate authority commit, and the trace derivation and 4c test extension are implemented afterwards.
