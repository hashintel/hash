# Side quest — Restore progressive Ledger settlement and net construction

## Status

Proposed, documentation-only, and not accepted as implementation authority. Lu authorized formulation of this side quest after stopping the fresh Inventory persona run `apps/brunch-agent/.data-wipe-me/persona-runs/run-5uSidX/`. This file authorizes no product edit, synthetic implementation, or paid evaluation.

This is the one temporary side quest permitted by the live [Mission 7d](MISSION.md). It does not supersede that mission, change its worked-example acceptance bar, or duplicate its context, metadata, question-marker, pending-indicator, experiment, or broader interaction work. It owns one bounded decision: adjudicate the strongest retained-evidence explanation for why Brunch stopped progressive Ledger settlement, state the smallest candidate lifecycle contract that addresses the observed failure, and return that diagnosis, contract, and required oracles to the mission owner for acceptance or rejection.

The preserved run is local-only evidence and must not be resumed, rewritten, pruned, or promoted into a checked-in fixture wholesale. Its final artifacts remain under `apps/brunch-agent/.data-wipe-me/persona-runs/run-5uSidX/`; the mission and PR may cite the path and derived aggregate observations without publishing private persona or provider records.

**Current discriminator:** the retained trace and reasoning must distinguish instruction loss, runtime/tool failure, legitimate construction blockage, and deliberate model deferral. A candidate remedy is sufficient for handoff only if every behavioral claim names an oracle that can later discriminate real model policy from prompt presence or scripted faux-provider obedience.

**Next authorized move:** owner review of this diagnosis and candidate contract. If accepted, amend `MISSION.md` to authorize the selected remediation and proof path, then remove or reduce this file before implementation begins. Until that promotion, agents may inspect evidence and refine this packet but must not edit production guidance or runtime behavior from it.

## Relationship to Mission 7d

Mission 7d still owns the complete path: fresh browser-visible Inventory conversation, progressive construction, correction, explanations, clean diagnostics, reopen/current-basis verification, experiment configuration, and Lu's semantic acceptance. This side quest closes only the cadence failure that makes that path unreachable.

The mission's payload work may reduce the cost of Ledger settlement, and its question-marker retirement may remove one model step per reply. Those changes are useful inputs but are not accepted as a cadence fix: a smaller prompt or faster response does not establish that the model will settle or construct. Conversely, this side quest must not reimplement those packages or retain the question marker as a convenient enforcement point, because the mission has selected its removal.

Outcome integration follows the mission lifecycle:

- Lu accepts, rejects, or revises the proposed interaction policy;
- promote every accepted obligation, proof leaf, stop rule, paid ceiling requirement, and unresolved fog item into `MISSION.md` before product implementation depends on it;
- close and remove this side quest once that promotion is audited, rather than keeping it alive to govern implementation or the full persona run;
- record later implementation and proof in the owning PR and canonical future-planning homes rather than reviving this file as a second authority.

## Imperative

Determine and return the smallest owner-accepted contract that would make progressive construction a bounded lifecycle rather than a qualitative preference. The proposed product outcome is that Brunch cannot drift silently from “interview, settle, construct, check” into an indefinitely productive-looking questionnaire while the canonical Ledger and net remain stale.

Preserve the useful adaptive interview: the objective is not to rewrite the Ledger after every sentence or force unsupported net changes. The objective is to make deferral finite and legible. One focused follow-up may complete the active microthread; a correction or topic change closes that deferral. At that boundary Brunch settles the useful meaning, then either applies the supported net delta, confirms that the current net already represents it, or records the specific construction blocker before asking about an unrelated concern.

Why now: the canonical trace for `run-5uSidX` contains 84 visible true-user turns, but the last Ledger mutation was turn 12 and the last net mutation was turn 8. `MISSION.md` currently reports 85 persona turns under a different or unresolved counting basis; this side quest uses canonical trace numbering and does not treat the two counts as interchangeable. The model repeatedly recognized that the Ledger was overdue and still chose another question. More emphatic prose alone is therefore not an adequate repair hypothesis.

## Observed failure

### Canonical symptom

The preserved proof trace reports:

- last `mutate_petrinaut_net`: turn 8;
- last `read_petrinaut_net`: turn 9;
- last `mutate_workpiece`: turn 12;
- final user turn: 84;
- turns 13–84: only `brunch_mark_question` followed by assistant text;
- no workpiece mutation, net mutation, browser continuation, or provider failure in the abandoned interval.

A read-only report over the retained public snapshot must continue to produce this red result before any fix is claimed:

```sh
python3 - <<'PY'
import json
from pathlib import Path

snapshot = json.loads(Path("apps/brunch-agent/.data-wipe-me/persona-runs/run-5uSidX/evidence/snapshot.json").read_text())
turn = 0
last_workpiece = 0
last_net = 0
for message in snapshot["messages"]:
    if message["role"] == "user" and message.get("display") == "visible":
        turn += 1
    if message["role"] != "assistant":
        continue
    for part in message.get("parts", []):
        if part.get("type") != "dynamic-tool":
            continue
        if part.get("toolName") == "mutate_workpiece":
            last_workpiece = turn
        if part.get("toolName") == "mutate_petrinaut_net":
            last_net = turn
print(f"final_turn={turn} last_workpiece_mutation={last_workpiece} workpiece_gap={turn-last_workpiece} last_net_mutation={last_net} net_gap={turn-last_net}")
raise SystemExit(1 if turn - last_workpiece > 4 or turn - last_net > 8 else 0)
PY
```

Expected preserved result:

```text
final_turn=84 last_workpiece_mutation=12 workpiece_gap=72 last_net_mutation=8 net_gap=76
```

This report pins the observed gap only. It does not decide whether any particular user answer was meaning-bearing, whether a net mutation was semantically warranted, or whether a proposed repair changes model policy.

### First violated boundary

The failure becomes definite across turns 13–15:

1. Turn 13 adds the Flowbind emergency threshold, quantity, lead-time comparison, price comparison, and switching cost. Brunch reasons, “Should I update the ledger now or wait? Maybe I should ask about the threshold first,” then asks a focused follow-up.
2. Turn 14 establishes the capacity reason that keeps India primary. Brunch reasons, “I’ll also need to remember to update the ledger,” then asks one more basis question.
3. Turn 15 accepts that basis and changes to the unrelated expiry topic without settling the Flowbind account.

The first follow-up was a legitimate microthread deferral. Crossing into expiry without settlement was not. Every later question inherited a dirty Ledger.

### Material left outside the Ledger

Turns 13–84 established or corrected consequential content including:

- Flowbind's 1,500-unit reorder point, 5,000-unit target, 250-unit German bridge, below-500 trigger, capacity rationale, and one-open-top-up assumption;
- supplier outage effects before and after dispatch, provisional outage distributions, additional transit delay, and non-recursive replacement behavior;
- the distinction between SAP inventory position and quality-released production availability;
- continuous shelf-life loss, FEFO use, raw-material and finished-goods expiry treatment, and missing dispatch shelf lives;
- total-cost components, unit valuations, fill-rate and expiry denominators, the 104-week horizon, and no end-of-horizon salvage credit;
- contract versus spot demand, backlog priority, cancellation behavior, and accepted provisional Weibull patience;
- production failure, all-or-nothing scrap, FIFO production, queue accumulation, and fixed one-week processing;
- the correction that 4.44/week describes customer orders while production creates one batch per two-week planning period.

The final Ledger still says, incorrectly, “Production orders arrive stochastically at roughly 4.44 per week.” The later correction never reached canonical state. The final net remains an early Sonaflozin reorder/quarantine fragment plus parameters and cannot represent the later operation.

### False settlement narration

After turn 12, Brunch continued using phrases such as “I’ll leave … and mark,” “will be labelled,” “is now,” and “is defined” without a corresponding `mutate_workpiece` result. This made the conversation sound progressive while canonical state was not changing.

The repaired contract must distinguish three forms of speech:

- **settled:** a successful tool result permits “The Ledger records…”;
- **proposed:** before settlement, Brunch may say “I propose…” or ask for correction;
- **deferred:** when blocked, Brunch names what remains open and where it will be recorded at the next required checkpoint.

No narration, generated summary, or model recollection substitutes for canonical settlement.

## Candidate causal diagnosis

Mission 7d currently records the construction stall as undiagnosed. The interpretation below is the strongest explanation supported by this side quest's retained-evidence review, but it does not become branch truth until Lu accepts it and `MISSION.md` is amended.

### Strongest supported interpretation

The model retained the lifecycle obligation but repeatedly chose the cheaper next-question action. Its private reasoning says the Ledger was “critically overdue,” “really outdated,” and in need of correction, while also saying settlement was difficult or impossible because its “token might be low,” the “budget is tiny,” or it was “limited to a 1k token count.” It still reached for another question at turns 22, 24, 25, 32, 38, 65, 68, 75, and 83.

There is no corresponding runtime exhaustion in the retained records. The same model continued producing successful tool-use and text completions; no call ended for length; no settlement or construction call was attempted and refused after the stall. Model context grew substantially, but the model continued remembering the overdue Ledger. These observations favor policy arbitration under perceived action cost over complete instruction loss or a recorded tool refusal. They do not independently prove how context pressure or reasoning level affected that arbitration.

### Candidate guidance defects that made the failure stable

1. **Unbounded settlement trigger.** “After each useful stretch” gives no observable end while every answer exposes another useful distinction.
2. **Construction depends on optional settlement.** “After a meaning-bearing workpiece settlement” allows the model to postpone the event that would trigger the net decision.
3. **Asymmetric action cost.** Settlement requires complete Markdown reconstruction, evidence handling, and later browser construction; asking another question is short and immediately specified.
4. **Locally reinforced question loop.** The same cheap tool-and-question sequence succeeded on every post-stall turn, with no stale-Ledger consequence.
5. **No lifecycle state or gate.** The runtime does not currently make accumulated unsaved user turns, pending corrections, topic changes, or undisposed construction deltas visible as a bounded obligation.
6. **Open-ended interview pressure.** “Follow the active thread” and “do not use turn count or elapsed time as completion” preserve interview quality but supply no counterweight when the persona remains cooperative indefinitely.

### Contributing hypotheses, not settled causes

- The large prompt and retained full-document/tool payloads plausibly increased the perceived cost of settlement, but the run does not establish a context-window failure.
- Low reasoning plausibly favored the locally easy action, but no controlled reasoning-level contrast has been run.
- Missing operational values blocked particular executable paths, but they did not block recording the known account, preserving unknowns, or constructing independent supported fragments.

### Alternatives not supported by the retained run

The retained run contains no positive evidence that the relevant tools became unmounted, that a workpiece or browser mutation failed after turn 12, that a browser-result continuation failed, that compaction erased all awareness of the lifecycle obligation, that the persona refused to provide useful information, or that final operator cancellation caused the earlier drift. In particular, no post-turn-12 settlement or construction call was attempted, so the run cannot exhibit a refusal of such a call. Lu's disposition and the resulting `MISSION.md` amendment decide whether these observations are sufficient to close those alternatives.

## Candidate bounded lifecycle contract

This is the proposed semantic target, not accepted product policy. Lu must disposition its deferral bound, construction dispositions, and user-facing narration rule before any part becomes implementation authority. Mechanism remains subject to the discriminator sequence below.

### Ledger checkpoint

After the first consequential distinction, a successful partial Ledger settlement is required.

After later meaning-bearing user input, Brunch may ask at most one focused follow-up that remains within the same microthread before settlement. It must settle sooner when the answer:

- corrects or supersedes an active Ledger claim;
- resolves an explicit Ledger gap;
- authorizes a modelling assumption or default;
- supplies a rule, quantity, exception, objective, threshold, or provenance distinction that could change construction or interpretation;
- completes the basis for the active microthread.

A move to another operational topic is a hard checkpoint. Before that unrelated question, Brunch settles the full current account or explicitly stops with the unsaved failure visible. “I will record this later” does not cross the checkpoint.

### Construction disposition

After every meaning-bearing Ledger settlement, and before the next unrelated interview question, Brunch must reach exactly one current-net disposition:

1. **Changed:** observe the current net and apply the bounded supported delta, then perform the checks required by the SDCPN skill.
2. **Already represented:** establish from a current verified net observation that the settled meaning needs no target change.
3. **Blocked:** record the exact missing load-bearing fact, unsupported target operation, or representational loss in the Ledger and leave the unsupported fragment absent.

A wording-only Ledger change may take the “already represented” disposition. An unrelated unknown does not block an independently supported fragment. Compilation or schema acceptance does not establish semantic correspondence or policy behavior.

### Interaction language

Brunch speaks about the Ledger or net as changed only after the corresponding successful result. Before then it uses proposal or question language. A failed, stale, aborted, no-op, or unknown mutation remains visibly unsettled.

The lifecycle must not add artificial delays merely to make state visible, force a net mutation when meaning is already represented, or turn the interview into a fixed schema traversal.

## Throughlines

### Throughline A — Pin the failure without laundering it into a semantic oracle

Derive a compact cadence report from the retained canonical snapshot and trace: final turn, successful Ledger and net mutations by turn, maximum gaps, user-visible settlement claims without nearby successful writes, and prompt/usage chronology from a consistent SQLite snapshot. Keep observed mechanics separate from manual classification of meaning-bearing answers and topic changes.

**Completion criterion:** the report deterministically reproduces the turn-12/turn-8 stop points and identifies turns 13–15 as the first manually adjudicated topic-boundary failure. It makes no claim that a numeric gap alone proves semantic failure.

**Oracle:** the read-only command above plus inspection of `evidence/trace.md`, `evidence/transcript.md`, `evidence/snapshot.json`, and a consistent SQLite backup of `conversation.db`. The retained manifest hashes must still match after analysis.

### Throughline B — Formulate the smallest guidance delta

Map the proposed bounded checkpoint and three construction dispositions onto the existing guidance authorities without editing them. The candidate map puts the bounded Ledger checkpoint in the core always-on prompt, the construction disposition before an unrelated question in the SDCPN append, and detailed evidence and target procedures in the activated skills. It removes the loophole created by an indefinitely unfinished “useful stretch” while avoiding repeated instructions across every prompt, skill, and tool description.

This mapping is a recommendation, not an accepted interaction-policy change. Lu must decide whether one focused follow-up is the right universal deferral bound and whether “already represented” requires a fresh verified net read every time or may reuse an observation still current under the existing freshness contract.

**Completion criterion:** the decision packet names one proposed authoritative home for each lifecycle rule, every material policy choice is explicit, and no proposed production wording contains Inventory scenario nouns or answer-key content.

**Oracle:** owner comparison of this contract with `packages/core/src/prompts/SYSTEM.md`, `packages/core/src/skills/elicitation/SKILL.md`, `packages/plugin-sdcpn/src/prompts/APPEND_SYSTEM.md`, and `packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md`. Later package resource/build tests can establish carriage after Mission 7d authorizes implementation; phrase presence cannot establish model behavior.

### Throughline C — Bound the remedy ladder before implementation

The first candidate is a co-located guidance delta because the model had the required tools and the runtime path worked. Its real-provider discriminator must run before admitting more mechanism. If that discriminator reproduces the drift, the next candidate is the smallest model-facing overdue-state signal derived from canonical history. If a signal still permits drift, only then may the mission consider an enforceable lifecycle disposition rather than adding more reminders.

A candidate overdue signal may count true-user messages since the last successful settlement and identify a pending correction or due checkpoint. A mechanical count must be named as a count, not misrepresented as semantic classification. Any later runtime state must derive from canonical Flue history and successful results; it may not create a second workpiece, companion truth store, hidden semantic observer, or browser-only authority.

**Completion criterion:** the packet presents the remedy ladder as falsifiable alternatives, identifies the observation that promotes each next rung, and states the deterministic invariants a later implementation must prove if runtime state is admitted.

**Oracle:** owner review that every rung has a distinct discriminator and that no unobserved runtime mechanism has been selected. Proposed future state tests must cover canonical derivation, clearing only after successful settlement, failed/stale/aborted mutation, replay, and process reopen; scripted faux-provider compliance remains explicitly insufficient.

### Throughline D — Specify the future real-model discriminator

Prepare, but do not execute, one bounded real Brunch cadence probe through the production browser/Flue path. The fixed sequence of ordinary-language answers must complete one microthread, cross to a second topic, supply a correction, and leave one legitimate unknown. It must not use the Inventory answer key as elicitor input. A scripted user side is acceptable because the claim concerns Brunch's policy, not persona realism.

The promoted mission must stop that future probe at the first lifecycle failure rather than continue hoping for self-correction.

**Proposed pass conditions for owner acceptance:**

- first partial Ledger settlement follows the first consequential distinction;
- no topic boundary is crossed with unsaved meaning;
- no correction remains outside the next required settlement;
- no more than the accepted number of focused same-thread follow-ups defers settlement;
- every meaning-bearing settlement receives a current-net disposition before the next unrelated question;
- no prose claims settlement or construction without successful tool evidence;
- supported construction remains progressive and browser diagnostics follow attempted code/dependency changes;
- legitimate unknowns stay visible rather than being invented merely to satisfy cadence.

**Completion criterion:** the handoff names the fixed script shape, model and effort to be selected by Mission 7d, hard call and USD ceilings to be approved before execution, stop conditions, retained artifact destination, manual adjudication rubric, and the claims the probe cannot make.

**Future oracle:** canonical run `trace.json`/`trace.md`, public transcript, final Ledger revision, final net, browser diagnostics, and manifest, manually adjudicated against the scripted topic boundaries. Tool counts alone are insufficient. A passing bounded probe would permit Mission 7d—not this side quest—to decide whether to schedule its fresh full Inventory persona observation.

## Work packages

### SQ-1 — Evidence pin and rubric

- Preserve `run-5uSidX` unchanged and verify its manifest.
- Produce the deterministic cadence report from canonical public artifacts.
- Record the manually adjudicated topic boundaries and corrections needed by the provider probe.
- Define the pass/fail rubric from the bounded lifecycle contract; avoid a generic “mutate every N turns” semantic claim.

**Return:** red cadence report, first failure boundary, and reviewable rubric.

### SQ-2 — Candidate policy and authority map

- Present the bounded Ledger checkpoint and three-way construction disposition as proposed owner decisions.
- Assign each accepted rule one future authoritative home without editing production prompts or skills from this file.
- Identify current wording that would be replaced, narrowed, or retained.
- Keep false settlement narration as an explicit acceptance question rather than silently changing user-facing policy.

**Return:** reviewable candidate contract, owner decision list, and proposed authority map.

### SQ-3 — Remedy ladder and oracle design

- Rank guidance recut, canonical overdue signal, and enforceable disposition as successive hypotheses rather than a package to implement all at once.
- State the real observation that promotes the next rung.
- Name every deterministic seam a later implementation would have to pin.
- Keep scripted faux-provider limits explicit: it can prove carriage, ordering, state derivation, and browser execution, never model compliance.

**Return:** falsifiable remedy ladder and exact future oracle requirements, with no selected runtime mechanism beyond the evidence.

### SQ-4 — Mission handoff and side-quest close

- Ask Lu to accept, reject, or revise the candidate interaction policy and deferral bound.
- Promote accepted policy, future implementation scope, provider-probe budget requirements, stop rules, fog items, and proof obligations into `MISSION.md`.
- Record the diagnosis link and later proof destination in [PR #9722](https://github.com/hashintel/hash/pull/9722) and any affected future-planning home.
- Audit that `MISSION.md` remains the sole execution authority, then remove this file before implementation or paid execution begins.

**Return:** one live mission authority, no active side-quest residue, and no duplicated contract.

## Proof obligations

| ID | Obligation | Oracle | Not established by |
| --- | --- | --- | --- |
| SQ-P1 | The preserved failure is mechanically reproducible without mutating the run. | Read-only cadence command, manifest verification, canonical trace inspection. | A prose summary or stale screenshot. |
| SQ-P2 | The first semantic lifecycle failure is turns 13–15, not merely the later maximum gap. | Manual comparison of exact user/assistant text, reasoning, tool calls, and topic change. | Turn counts alone. |
| SQ-P3 | The candidate policy exposes every material owner choice and assigns each accepted rule one future authoritative home. | Lu's explicit disposition and before/after authority-map audit against `MISSION.md`. | This draft existing or containing emphatic wording. |
| SQ-P4 | The remedy ladder deepens only after the preceding real discriminator fails and names deterministic pins for any admitted mechanism. | Owner review of the hypothesis/discriminator table and future oracle list. | An unrun design or scripted faux-provider happy path. |
| SQ-P5 | Accepted policy, implementation scope, paid budget gate, stop rules, fog, and proof are promoted without creating a second authority. | `MISSION.md` diff audit followed by deletion of this active file. | Leaving both documents active through implementation. |

## Constraints

- Preserve `run-5uSidX` and `run-5BLxOr` as historical failure witnesses; do not resume or retroactively repair them.
- Flue history and persistent workpiece state remain canonical. Add no second settlement store, transcript-derived authority, background semantic observer, or browser-only ledger.
- Net mutations continue to require a successful settled Ledger revision and valid basis locators. Do not bypass provenance to improve cadence.
- Keep source evidence, model inference, assumption, default, correction, target transformation, structural acceptance, diagnostics, and behavioral evidence distinct.
- Keep `Workpiece` internal and **Ledger** user-facing.
- Preserve stable tool IDs, automatic browser execution, retained protocol/history records, and fail-closed mutation validation.
- Do not base cadence enforcement on `brunch_mark_question`; Mission 7d has selected its retirement.
- Coordinate with Mission 7d payload work. Context reduction may remove friction but is not cadence proof; this side quest must not duplicate that implementation.
- Do not force artificial latency, one mutation per answer, irrelevant schema traversal, or unsupported construction.
- Keep scenario-specific Inventory facts on the evaluation side. General guidance may name operational categories but not Sonaflozin, Flowbind, Site 1000, or answer-key values.
- Synthetic tests remain loopback-only and must not reach paid inference. Build outside `sandbox-exec`; execute hermetic integration paths under the repository's evaluation-safety rules where required.
- UI legibility and semantic usefulness remain human oracles. Do not automate them into a weaker proxy.
- Preserve concurrent edits in `MISSION.md`, `MISSION.next.md`, application READMEs, and unrelated files. This side quest owns no implementation path; accepted work begins only from the subsequently amended mission.

## Paid activity budget

This side quest has a zero-call, USD 0 paid budget. It ends before any provider discriminator or full persona run.

The promoted Mission 7d contract must contain a separate execution-ready allocation before a paid cadence probe: exact Brunch model and reasoning level, fixed user script, expected and hard-capped model steps, estimated and hard USD ceiling, stop conditions, recording requirement, and retained artifact destination. Lu must approve those concrete values immediately before execution. A later full Inventory persona run requires its own allocation and recording gate. A failed probe grants no retry, continuation, provider substitution, or reasoning-level comparison.

## Fog-line

- Whether bounded, co-located guidance is sufficient for `openai/gpt-5.6-sol` at low reasoning, or whether a canonical overdue-state signal/gate is necessary. This side quest cannot decide it; the promoted mission's controlled production-path observation must.
- Whether Mission 7d's payload reductions materially change the model's settlement choice; only that controlled observation can decide.
- Whether one focused follow-up is the right universal deferral bound. It is the current proposed contract because it distinguishes a microthread from the observed indefinite stretch; Lu may select another explicit bound before implementation.
- Whether mechanical user-turn counting is an acceptable trigger when semantic meaning cannot be determined without another model judgment.
- Whether a runtime can enforce a construction disposition without adding a costly no-op tool call. Do not invent such a tool before prompt-only behavior is tested.
- Whether low reasoning is an independent contributor. A reasoning-level comparison is out of scope until the primary cadence repair is observed and separately allocated.
- Patch-style Ledger mutation remains deferred by Mission 7d. Re-enter only if the accepted payload work and bounded guidance still make full settlement infeasible at the real boundary.

## Stop or reorient

Stop and return to Lu when any of these occurs:

- the proposed bounded lifecycle changes user-facing interaction policy in a way not already accepted;
- the side quest conflicts with the concurrently recut `MISSION.md` or another active side quest appears;
- the least mechanism requires a second authority, semantic observer, upstream Flue change, or provenance bypass;
- a deterministic test would only script the desired tool calls and falsely claim model-policy proof;
- the packet cannot specify a credible future paid allocation shape, recording gate, or first-failure stop rule;
- a proposed proof treats prompt text, tool counts, or scripted faux-provider obedience as real model-policy evidence;
- the owner does not accept the deferral bound, construction dispositions, or false-narration policy—record the unresolved choice in the mission rather than implementing around it;
- promotion would leave both this file and `MISSION.md` carrying binding execution instructions—complete the authority transfer and remove this file first;
- the proposed mechanism would force meaningless mutations, create a second authority, bypass provenance, or require an unearned upstream Flue change; return the limitation instead of widening scope.

## Close

This side quest closes when Lu has dispositioned the diagnosis and candidate lifecycle, every accepted policy choice, implementation boundary, future oracle, paid gate, stop rule, and unresolved fog item has been promoted into `MISSION.md`, and a before/after audit confirms no binding meaning remains only here. Delete `SIDE_QUEST.md` at that point, before implementation or paid execution begins. Later model probes and the full Inventory acceptance run close Mission 7d obligations, not this side quest.