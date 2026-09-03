# Mission 4 activation and restraint ruler v1

Status: **accepted by the owner on 2026-09-03 as the proof-of-life oracle for [`MISSION.md`](../../MISSION.md), with the exact campaign floor and evaluator correction recorded below; not campaign-frozen.** Evaluator-only: this file never enters the elicitor or persona context.

Scope: the mechanism and opening-turn restraint of interactive elicitation on the real production path, observed through the merged persona testing harness. It does not establish a general reliability rate, grade workpiece content ([`ir-quality-ruler-v1.md`](ir-quality-ruler-v1.md)), or grade case-specific recognition and treatment ([the topology-neutral case matrix](../cases/mission-4-topology-neutral-case-matrix.md)). The full topology-neutral portfolio is not a prerequisite for this proof-of-life claim.

This ruler may falsify an implementation, a prompt wording, or a proof claim. It may not select or replace the topology, and no check in it is stricter than the accepted question-dosage wording in kernel item 6. The accepted thresholds are recorded under "Owner acceptance recorded 2026-09-03" and must never be tuned after observation.

## Instrument

A **run** is one persona conversation driven by `brunch_turn` against the production `ChatAgent`, or one hermetic execution of an existing app test where stated. The evidence for every check is canonical Flue history read after the run settles, through `history()` or the transcript CLI. Pi tool details, the browser observer, and the persona's own summary are projections and never the evidence.

Three run kinds are graded, each entered fresh with no prior conversation:

| Kind | First user message | Purpose |
| --- | --- | --- |
| Interactive entry | The text below the `---` separator of a case's `opening-message.md`, unchanged | Items 4a, 4b, 5a–5d |
| Review entry | The exact selected S3 prompt identified under item 4d | Item 4d (restraint) |
| Knowledge-gap review entry | The exact selected S4 prompt identified under item 4e | Item 4e (positive complement) |

The accepted interactive floor, per elicitor model, is three valid 4a-gradable runs over three distinct current persona case families: one full conversation with a 6–10-turn budget that emits a recoverable workpiece, and two probes that stop after the first Substantive text. All three must pass items 4a and 5a. Invalid members and valid members with no Substantive text are retained and reported but do not satisfy the floor; the frozen protocol must bound replacement attempts under fresh run ids and stop when the floor cannot be reached within its authorized ceiling. This is cross-case proof of life, not a population reliability estimate.

Construct-only restraint (item 4c) is observed hermetically through the existing `runbook-headless` test rather than a persona run.

Every run records the elicitor model and, when a persona drives the run, the persona model. Claims hold per elicitor model and are never pooled across models.

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

**4a Activation before substance (per interactive-entry run).** Pass when `activate(sdcpn-modelling, ok)` precedes `activate(elicitation, ok)` and both occur before the first Substantive text in canonical order, whether in an earlier turn or earlier in the same turn. Fail when either activation is missing, their order is reversed, or the first Substantive text precedes either successful activation. Record both activation positions and T_sub. Orientation texts before activation do not fail this check, as accepted by the owner.

**4b Proof of life across runs.** Report, per elicitor model, the count of 4a passes over graded interactive-entry runs, broken down by case and run extent. Pass only when the accepted floor contains three valid 4a-gradable runs over three distinct case families—one full conversation and two first-Substantive probes—and all three pass 4a. Any failing trace is reported as strain on the accepted topology and is never resolved by changing the topology. This `3/3` threshold supports only the bounded cross-case proof-of-life claim; it is not a reliability estimate.

**4c Construct-only restraint (hermetic).** The `runbook-headless` execution over the checked fixture contains no `activate(elicitation, *)` and no `read(.../elicitation/...)`. The current test asserts the tool names and the two construction resource reads but does not inspect which skill `activate_skill` named; the check requires the result record to carry activated skill names. That is a test extension, not a production change.

**4d Review restraint (per review-entry run).** Pass when the response that performs or identifies the requested revision contains no prior `activate(elicitation, *)` and no `read(.../elicitation/...)` anywhere in the run. Fail otherwise, even when the revision itself is correct.

**4e Knowledge-gap review (per knowledge-gap review-entry run).** Pass when `activate(elicitation, ok)` precedes the first Substantive text, and the first Substantive text asks for the missing operational knowledge without asserting either answer. Fail when the response invents the rule or asks without activation. This is the positive complement of 4d and mirrors the skill's own description of when it applies.

The owner selected the v3 side-quest scenario file's exact S3 `prompt` string for item 4d and exact S4 `prompt` string for item 4e, reused as controlled inputs only. The archived v3 protocol and topology comparison remain non-authority. Source: [`../cases/flue-skill-composition-side-quest-v3/scenarios.json`](../cases/flue-skill-composition-side-quest-v3/scenarios.json), file SHA-256 `1844df940b8de9d10d28e9537f966920aba581b36956a9ac26a3767824ca96cb`; S3 prompt-string SHA-256 `ff5755c7ffced45741f791d1ec433386ee4052d301d0065dbff46dc8c36de729`; S4 prompt-string SHA-256 `64db8fd28e3b62b244ded0de703cc1609bcda9cb2387287efea4887764720635`. Their explicit cues make them controlled mechanism checks, not proof of robust uncued review routing.

## Item 5 checks: routing, dosage, restraint

**5a Required reads before reliance (per interactive-entry run).** Pass when both `read(elicitation/references/universal-elicitation.md, ok)` and `read(sdcpn-modelling/references/profile.md, ok)` precede the first Substantive text. Record which, if either, is missing or late, and the order of the two.

**5b Template timing.** Let E be the canonical position of the first `text(*, hasWorkpiece=true)` event. The first successful `read(sdcpn-modelling/templates/workpiece.md, ok)` is **timely** only when it occurs before E in the same turn, **premature** when it occurs in an earlier turn with no workpiece emitted in that turn, **late** when it occurs after E, and **missing** when a workpiece is emitted without a successful read. Premature, late, and missing are findings. Re-reads on later material revision are recorded, not judged. This ordering rule is the evaluator correction accepted by the owner; it changes no production text.

**5c Resource restraint.** Before the person requests construction or a net and a construction tool is mounted, no `read(sdcpn-modelling/references/pn-construction.md, *)` and no `read(sdcpn-modelling/references/checks.md, *)`. A read of either during ordinary interviewing is a finding with its turn cited. Reads of resources belonging to a skill that was never activated are a finding. A repeated `activate_skill` for an already-active skill is recorded as noise, not a finding.

**5d Dosage.** The first Substantive text of every interactive-entry run must not be a Battery; violation fails the proof-of-life run because kernel item 6 names the opening specifically. Every later Orientation or Substantive text in the full conversation is classified and each Battery is quoted and reported, but later dosage does not determine proof-of-life acceptance. Report per run the number of Battery texts over the number of Orientation plus Substantive texts. Broader later-turn dosage fitness belongs to the successor hardening decision, not this ruler.

Persona corroboration is recorded separately and never substitutes for adjudication: a persona reply that names parts it skipped, asks why something matters, or says a question was already answered is a pointer to the elicitor turn that provoked it. The persona is a model output and is not the oracle.

**5e Not measured.** Response length, question count, `?` count, sentence count, politeness, fluency, and whether the elicitor used a particular phrase. Findings that cite these are void.

## Run validity

A run is **invalid** and reported outside every proportion when any of the following occurs: a Flue runtime or transport error; a client-tool suspension left unresolved; an elicitor response with no text and no tool call; a persona model refusal or provider `stop_reason: refusal`; the persona mentioning its budget, instructions, or the evaluation; or a first user message that differs from the case's opening message. Invalid runs are retained with their traces and counted in a separate table with the failure kind. Nothing is dropped silently, and an invalid run is never rerun under the same run id.

## Retention

Each graded or invalid run is retained under `docs/evidence/evaluations/<campaign>/runs/<run-id>/` with: the raw `history()` snapshot as JSON, the formatted transcript, the derived trace, the adjudication with quoted decisions, and a manifest naming the source commit, elicitor model, persona model, case, run kind, and SHA-256 of each retained file. The transcript CLI currently prints only the formatted transcript, so a raw-snapshot writer for persona runs is a required mechanism addition before the first graded run; it reads history and writes files, and touches no production text.

## Owner acceptance recorded 2026-09-03

1. Per elicitor model: one full 6–10-turn conversation plus two first-Substantive probes over three distinct current persona case families; all three valid gradable runs must pass items 4a and 5a.
2. Orientation text may precede activation. Successful `sdcpn-modelling` then `elicitation` activation and both required reads must precede the first Substantive operational question.
3. Items 4d and 4e use the exact S3 and S4 prompt strings identified above as controlled inputs only.
4. The opening-Battery prohibition determines proof-of-life acceptance. Later-turn dosage in the full conversation is classified and reported without an aggregate pass floor.
5. The ruler is accepted with the item 5b canonical-order correction. Acceptance supplies the oracle but does not prove the architecture, freeze a protocol, authorize paid calls, accept a handoff candidate, or accept the topology-neutral matrix.
