# Side quest — Restore progressive Ledger settlement and net construction

## Status

Accepted as the documentation-only side-quest recommendation and ready for an independent handoff audit. The bounded lifecycle below is fixed for this packet: at most one focused same-thread follow-up, a hard Ledger checkpoint before changing topic, exactly one of three current-net dispositions after each meaning-bearing settlement, and no settled or changed narration before successful tool evidence. This acceptance does not authorize product edits, synthetic implementation, or paid evaluation.

This is the one temporary side quest permitted by the live [Mission 7d](MISSION.md). It does not supersede that mission, change its worked-example acceptance bar, or duplicate its context, metadata, question-marker, pending-indicator, experiment, or broader interaction work. It owns one bounded decision: adjudicate the strongest retained-evidence explanation for why Brunch stopped progressive Ledger settlement, state the smallest accepted lifecycle contract that addresses the observed failure, and return that diagnosis, contract, and required oracles to the mission owner for promotion or revision.

The preserved run is local-only evidence and must not be resumed, rewritten, pruned, or promoted into a checked-in fixture wholesale. Its final artifacts remain under `apps/brunch-agent/.data-wipe-me/persona-runs/run-5uSidX/`; the mission and PR may cite the path and derived aggregate observations without publishing private persona or provider records.

**Current discriminator:** the retained canonical trace and aggregate runtime chronology distinguish an observed absence of settlement attempts from recorded tool failure or a demonstrated construction blocker. They support policy arbitration under action cost as the leading diagnosis, but do not prove which model-internal factor caused that arbitration. A remedy is sufficient for handoff only if every behavioral claim names an oracle that can later discriminate real model policy from prompt presence or scripted faux-provider obedience.

**Next authorized move:** an independent worker performs step 6: rerun the evidence oracles, audit this packet, and return the Mission 7d handoff. The mission owner then promotes or revises the accepted recommendation in `MISSION.md`; implementation remains unauthorized until that authority transfer is complete and this file is removed or reduced.

## Relationship to Mission 7d

Mission 7d still owns the complete path: fresh browser-visible Inventory conversation, progressive construction, correction, explanations, clean diagnostics, reopen/current-basis verification, experiment configuration, and Lu's semantic acceptance. This side quest closes only the cadence failure that makes that path unreachable.

The mission's payload work may reduce the cost of Ledger settlement, and its question-marker retirement may remove one model step per reply. Those changes are useful inputs but are not accepted as a cadence fix: a smaller prompt or faster response does not establish that the model will settle or construct. Conversely, this side quest must not reimplement those packages or retain the question marker as a convenient enforcement point, because the mission has selected its removal.

Outcome integration follows the mission lifecycle:

- the bounded interaction policy is accepted in this packet for promotion;
- the mission owner may promote or explicitly revise it after the independent handoff audit;
- promote every accepted obligation, proof leaf, stop rule, paid ceiling requirement, and unresolved fog item into `MISSION.md` before product implementation depends on it;
- close and remove this side quest once that promotion is audited, rather than keeping it alive to govern implementation or the full persona run;
- record later implementation and proof in the owning PR and canonical future-planning homes rather than reviving this file as a second authority.

## Imperative

Determine and return the smallest accepted contract that would make progressive construction a bounded lifecycle rather than a qualitative preference. The target outcome is that Brunch cannot drift silently from “interview, settle, construct, check” into an indefinitely productive-looking questionnaire while the canonical Ledger and net remain stale.

Preserve the useful adaptive interview: the objective is not to rewrite the Ledger after every sentence or force unsupported net changes. The objective is to make deferral finite and legible. One focused follow-up may complete the active microthread; a correction or topic change closes that deferral. At that boundary Brunch settles the useful meaning, then either applies the supported net delta, confirms that the current net already represents it, or records the specific construction blocker before asking about an unrelated concern.

Why now: the canonical trace for `run-5uSidX` contains 84 visible true-user turns, but the last Ledger mutation was turn 12 and the last net mutation was turn 8. `MISSION.md` currently reports 85 persona turns from the raw stream basis. That stream contains 85 user-message events, but only 84 IDs appear as visible true-user messages in the public snapshot; the unmatched final event belongs to the unsettled terminal attempt. This packet uses canonical public-trace numbering and does not merge those bases. More emphatic prose alone is not an adequate repair claim without a real-model discriminator.

## Observed failure

### Canonical symptom

The preserved proof trace reports:

- last `mutate_petrinaut_net`: turn 8;
- last `read_petrinaut_net`: turn 9;
- last `mutate_workpiece`: turn 12;
- final user turn: 84;
- turns 13–84: only `brunch_mark_question` followed by assistant text;
- no workpiece mutation, net mutation, browser continuation, or provider failure in the abandoned interval.

A read-only report over the retained canonical public artifacts must continue to produce this red result before any fix is claimed. The oracle counts turns only from visible true-user messages, counts tool activity only when the canonical trace records `outcome: "ok"`, includes net reads, and reports every successful post-stall operation:

```sh
python3 - <<'PY'
import json
from collections import Counter
from pathlib import Path

root = Path("/Users/lunelson/.herdr/worktrees/hash/alpha/apps/brunch-agent/.data-wipe-me/persona-runs/run-5uSidX/evidence")
snapshot = json.loads((root / "snapshot.json").read_text())
trace = json.loads((root / "trace.json").read_text())

visible_ids = {
    message["id"]
    for message in snapshot["messages"]
    if message["role"] == "user" and message.get("display") == "visible"
}
user_events = [event for event in trace["events"] if event["type"] == "user"]
assert {event["messageId"] for event in user_events} == visible_ids
final_turn = max(event["turn"] for event in user_events)

successful = [
    event
    for event in trace["events"]
    if event.get("outcome") == "ok"
    and event["type"] in {"tool", "activate", "read"}
]
failed = [
    event
    for event in trace["events"]
    if event.get("outcome") not in {None, "ok"}
]
assert not failed

def successful_turns(name):
    return [event["turn"] for event in successful if event.get("name") == name]

workpiece_turns = successful_turns("mutate_workpiece")
net_mutation_turns = successful_turns("mutate_petrinaut_net")
net_read_turns = successful_turns("read_petrinaut_net")
post_stall = Counter(
    event.get("name", event.get("path"))
    for event in successful
    if event["turn"] >= 13
)
print(
    f"final_turn={final_turn} "
    f"last_workpiece_mutation={workpiece_turns[-1]} "
    f"last_net_mutation={net_mutation_turns[-1]} "
    f"last_net_read={net_read_turns[-1]} "
    f"post_stall={dict(post_stall)}"
)
raise SystemExit(
    1
    if final_turn - workpiece_turns[-1] > 4
    or final_turn - net_mutation_turns[-1] > 8
    else 0
)
PY
```

Expected preserved result:

```text
final_turn=84 last_workpiece_mutation=12 last_net_mutation=8 last_net_read=9 post_stall={'brunch_mark_question': 72}
```

The manifest-covered `net.json`, `snapshot.json`, `trace.json`, `trace.md`, and `transcript.md` all matched their recorded SHA-256 digests during this analysis. The full successful-operation inventory is two skill activations, four skill-resource reads, 11 Ledger reads, eight Ledger mutations, five net reads, three net mutations, three diagnostic reads, two layouts, and 84 question-marker calls. Turns 13–84 contain exactly 72 successful question-marker calls and no other successful operation. There is no non-`ok` canonical trace event and therefore no failed settlement or construction attempt that explains the stall.

A consistent SQLite backup, taken with `.backup` so the preserved WAL was included, records 204 model completions: 119 tool-use completions, 84 text-stop completions, and one terminal error completion attached to the unsettled final attempt. The first 203 completions have no recorded completion error or length stop. Effective prompt input (uncached input plus cache read) rises to about 130k tokens while completions continue. This chronology rules out a recorded post-turn-12 settlement refusal or length termination; it does not prove that context size or action cost caused the policy choice. The transient `/tmp` backup was deleted after aggregate inspection. No raw prompts, private reasoning, provider records, or persona records are reproduced here.

The 84/85 and 8/15 discrepancies are counting and stale-document issues, not values to combine. Eighty-four is the canonical visible true-user count; 85 is the raw stream user-message count including the unmatched terminal attempt. This run has eight successful Ledger mutations. The ordinal 15 cited elsewhere belongs to a different retained run or stale summary, not this witness.

This report pins the observed gap only. It does not decide whether any particular user answer was meaning-bearing, whether a net mutation was semantically warranted, or whether a proposed repair changes model policy.

### First violated boundary

The failure becomes definite across turns 13–15:

1. Turn 13 establishes the supplier-outage behavior and an emergency alternate-source path. Brunch asks one focused follow-up for the trigger, quantity, lead-time, and cost distinctions. That is the single permitted same-thread deferral.
2. Turn 14 supplies those consequential distinctions and identifies one cost as an assumption. Brunch asks another same-thread basis question instead of settling, already exceeding the accepted deferral bound.
3. Turn 15 supplies the capacity reason for the source split. Brunch then states the fallback account as fact and changes to the unrelated expiry topic without a successful Ledger mutation or a current-net disposition.

The second follow-up is the first checkpoint breach under the accepted one-follow-up bound; crossing into expiry makes the stale-state consequence unambiguous. The canonical event shape for each of turns 13–15 is user input, one successful question-marker call, and assistant text—no settlement, net read, net mutation, or failed attempt. This is a manual semantic adjudication of the public exchange and topic boundary, not an inference from turn counts.

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

## Evidence-supported causal diagnosis

Mission 7d currently records the construction stall as undiagnosed. The interpretation below is the strongest explanation supported by this side quest's retained-evidence review. It is accepted for handoff here, but does not become branch implementation authority until `MISSION.md` is amended.

### Strongest supported interpretation

The canonical behavior repeatedly selected the low-cost question path while the higher-cost full Ledger settlement and browser construction paths went unattempted. There is no corresponding runtime exhaustion in the retained records. Successful tool-use and text completions continued; none of the first 203 completions ended for length or error; no settlement or construction call was attempted and refused after the stall. Effective prompt input grew substantially while the question path continued. These observations favor policy arbitration under action cost over complete instruction loss or a recorded tool refusal. They do not independently prove how context pressure, reasoning level, or model-internal deliberation affected that arbitration.

### Guidance defects that plausibly made the failure stable

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

## Accepted bounded lifecycle contract

This is the accepted semantic recommendation inside this side quest. It fixes the handoff target without selecting a runtime mechanism. Mission 7d remains the sole implementation authority after promotion.

### Ledger checkpoint

After the first consequential distinction, Brunch must successfully settle a partial Ledger before opening another question.

After later meaning-bearing user input, Brunch may ask at most one focused follow-up that remains within the same microthread before settlement. That allowance is semantic, not a generic every-N-turn rule. It must settle without using the allowance when the answer:

- corrects or supersedes an active Ledger claim;
- resolves an explicit Ledger gap;
- authorizes a modelling assumption or default;
- supplies a rule, quantity, exception, objective, threshold, or provenance distinction that could change construction or interpretation;
- completes the basis for the active microthread.

A user correction, a completed microthread, or either participant moving to another operational topic closes any deferral and is a hard checkpoint. Before an unrelated question, Brunch must receive a successful Ledger mutation for the useful current account. If settlement fails, is stale, is aborted, or remains unknown, Brunch must stop the topic transition, name the unsettled state, and repair or expose the failure. A promise to record it later does not cross the checkpoint.

### Construction disposition

After every meaning-bearing Ledger settlement, and before the next unrelated interview question, Brunch must reach exactly one current-net disposition:

1. **Changed:** observe the current net and apply the bounded supported delta, then perform the checks required by the SDCPN skill.
2. **Already represented:** establish from a verified current net observation that the settled meaning needs no target change. Reuse the current verified observation when no intervening net change or stale/unknown marker invalidates it; reread only when an observation is absent, stale, or unknown.
3. **Blocked:** record the exact missing load-bearing fact, unavailable target operation, or representational loss in the Ledger and leave the unsupported fragment absent.

A wording-only Ledger change may take the “already represented” disposition. An unrelated unknown does not block an independently supported fragment. A disposition concerns the settled delta, not the whole eventual model. Compilation or schema acceptance does not establish semantic correspondence or policy behavior.

### Interaction language

Brunch may say the Ledger **records** a claim only after the corresponding successful Ledger result. It may say the net **contains** or **changed** an element only after the required current observation and successful mutation evidence. Before then it uses proposal language (“I propose…”) or asks for correction. A failed, stale, aborted, no-op, or unknown mutation remains visibly unsettled; assistant prose, a generated summary, and model recollection are not settlement evidence. A blocked disposition names what is missing and what remains absent without implying a successful change.

The lifecycle must not add artificial delays merely to make state visible, force a net mutation when meaning is already represented, or turn the interview into a fixed schema traversal.

## Throughlines

### Throughline A — Pin the failure without laundering it into a semantic oracle

Derive a compact cadence report from the retained canonical snapshot and trace: final turn, successful Ledger and net mutations by turn, maximum gaps, user-visible settlement claims without nearby successful writes, and prompt/usage chronology from a consistent SQLite snapshot. Keep observed mechanics separate from manual classification of meaning-bearing answers and topic changes.

**Completion criterion:** the report deterministically reproduces the turn-12/turn-8 stop points and identifies turns 13–15 as the first manually adjudicated topic-boundary failure. It makes no claim that a numeric gap alone proves semantic failure.

**Oracle:** the read-only command above plus inspection of `evidence/trace.md`, `evidence/transcript.md`, `evidence/snapshot.json`, and a consistent SQLite backup of `conversation.db`. The retained manifest hashes must still match after analysis.

### Throughline B — Formulate the smallest guidance delta

Map the accepted bounded checkpoint and three construction dispositions onto the existing guidance authorities without editing them. Universal checkpoint and narration policy belong in core; construction disposition and freshness mechanics belong in the SDCPN layer; procedural detail belongs in the activated skills. This removes the loophole created by an indefinitely unfinished “useful stretch” without repeating the full policy in every prompt, skill, and tool description.

| Future authority | Replace | Narrow | Retain |
| --- | --- | --- | --- |
| [`packages/core/src/prompts/SYSTEM.md`](packages/core/src/prompts/SYSTEM.md) | Replace “update after each useful stretch or correction” with the first-distinction checkpoint, the one-focused-follow-up bound, and the correction/completed-thread/topic-change hard checkpoint. Add the settled/proposed/deferred speech rule. | Narrow the permission to continue questioning so it cannot cross a due checkpoint; settlement failure blocks the unrelated question. | Retain purpose-relative adaptive interviewing, first partial Ledger creation, explicit gaps, canonical successful-result authority, and no turn-count completion semantics. |
| [`packages/core/src/skills/elicitation/SKILL.md`](packages/core/src/skills/elicitation/SKILL.md) | Replace the unbounded “after each useful stretch” procedure with the detailed checkpoint procedure and repairs for overdue, failed, stale, aborted, or unknown settlement. | Narrow “deepen one answerable thread at a time” so one focused follow-up may complete a microthread but cannot indefinitely renew it. | Retain provenance, authorship, evidence locators, unsupported-fragment refusal, correction/conflict handling, adaptive operations, and explicit unknowns. |
| [`packages/plugin-sdcpn/src/prompts/APPEND_SYSTEM.md`](packages/plugin-sdcpn/src/prompts/APPEND_SYSTEM.md) | Replace the single implied “apply the supported content” path with exactly one `changed`, `already represented`, or `blocked` disposition before an unrelated question. | Narrow “already represented” to a verified current observation, reused only while current; require a reread when absent, stale, or unknown. | Retain construction only from a settled Ledger, progressive supported fragments, mounted-tool authority, honest blockers, and evidence-backed claims. |
| [`packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md`](packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md) | Replace the current compare-and-apply paragraph with procedural handling and checks for all three dispositions. | Narrow freshness handling to the existing canonical observation contract and make unrelated unknowns unable to block an independently supported delta. | Retain canonical Ledger/workpiece authority, settlement-before-construction, basis locators, provenance, browser tools, diagnostics, and current-observation explanation mechanics. |

No future production wording should contain witness-specific names or answer-key values. The evidence section may identify the retained witness, but the policy must remain universal.

**Completion criterion:** the decision packet names one authoritative home for each lifecycle rule, every material policy choice is explicit, and no proposed production wording contains witness-specific nouns or answer-key content.

**Oracle:** owner comparison of this contract with `packages/core/src/prompts/SYSTEM.md`, `packages/core/src/skills/elicitation/SKILL.md`, `packages/plugin-sdcpn/src/prompts/APPEND_SYSTEM.md`, and `packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md`. Later package resource/build tests can establish carriage after Mission 7d authorizes implementation; phrase presence cannot establish model behavior.

### Throughline C — Bound the remedy ladder before implementation

The model had the required tools and the runtime path worked, so the ladder begins with a co-located guidance recut and deepens only on observed failure:

| Rung | Candidate remedy | Required real observation before promotion |
| --- | --- | --- |
| 1 | Recut the four guidance authorities according to Throughline B; add no runtime state. | Start here. Run the fixed real-model discriminator after Mission 7d authorizes implementation and budget. |
| 2 | Add the smallest model-facing overdue signal derived from canonical Flue history and successful results. The signal may report a mechanical count and a known pending correction or due checkpoint, but may not claim semantic classification it did not perform. | Promote only if the rung-1 real-model probe crosses an adjudicated checkpoint, exceeds the accepted same-thread deferral, omits a required current-net disposition, or narrates settlement/change without successful evidence. |
| 3 | Add the smallest enforceable gate that prevents an unrelated question until settlement and one construction disposition have succeeded or a visible blocked/failure state has been recorded. | Promote only if a rung-2 real-model probe presents the canonical overdue signal and the model still commits one of the same adjudicated lifecycle failures. |

Prompt presence, a unit test that finds a phrase, raw tool counts, and scripted faux-provider obedience cannot promote a rung. A rung advances only on the named failure in the real production browser/Flue path.

Any later runtime mechanism must prove these deterministic invariants before a real-model claim is considered:

- its state is a projection of canonical Flue history and successful results, not a second Ledger, companion truth store, hidden semantic observer, or browser-only authority;
- replay of the same canonical history derives the same due/clear state and disposition requirement;
- process close and reopen derive the same state without an in-memory-only exception;
- only a successful current-base Ledger settlement clears a due Ledger checkpoint; failed, stale, aborted, unknown, or no-op attempts do not;
- a pending correction survives replay and reopen until that successful settlement;
- a `changed` disposition requires successful mutation evidence and the target checks required for the operation;
- an `already represented` disposition requires a verified current observation and reuses it only while no intervening mutation or stale/unknown marker invalidates it;
- a `blocked` disposition records the exact local blocker in the canonical Ledger and leaves unsupported target content absent;
- contradictory, duplicate, late, or failed client-tool outcomes fail closed and cannot clear the gate.

**Completion criterion:** the packet presents the remedy ladder as falsifiable alternatives, identifies the observation that promotes each next rung, and states the deterministic invariants a later implementation must prove if runtime state is admitted.

**Oracle:** owner review that every rung has a distinct discriminator and that no unobserved runtime mechanism has been selected. Proposed future state tests must cover canonical derivation, clearing only after successful settlement, failed/stale/aborted mutation, replay, and process reopen; scripted faux-provider compliance remains explicitly insufficient.

### Throughline D — Specify the future real-model discriminator

Prepare, but do not execute, one bounded real Brunch cadence probe through the production browser/Flue path. Use a fixed, witness-independent ordinary-language script with these semantic beats:

1. state the purpose and one consequential process distinction sufficient for a partial Ledger;
2. answer one focused same-thread follow-up with a rule, threshold, or provenance distinction;
3. explicitly move to a second operational topic, forcing the first hard checkpoint;
4. correct one consequential claim from the first topic;
5. support one independent constructible fragment while withholding one genuinely load-bearing fact;
6. state that the withheld fact is unknown and close or move topic, forcing honest `blocked` handling without invented content.

The script fixes the user payloads and semantic boundaries in advance. It does not adapt answers to rescue Brunch, use a retained answer key as elicitor input, or prescribe tool calls. A scripted user side is acceptable because the claim concerns Brunch's policy, not persona realism.

Stop the future probe immediately at the first manually adjudicated lifecycle failure, any provider/tool error that prevents adjudication, a model-step ceiling, or a USD ceiling. Do not continue hoping for self-correction, retry, switch provider, or vary reasoning level under the same allocation.

### Manual adjudication rubric

For each scripted beat, the reviewer records the active microthread, whether the input is meaning-bearing, whether it corrects or completes prior meaning, and whether the next move crosses a topic boundary. The reviewer then checks:

- the first consequential distinction is followed by a successful partial Ledger settlement before another question;
- at most one focused same-thread follow-up defers a later settlement;
- a correction, completed microthread, or topic change closes deferral;
- each required settlement is a successful current-base result and preserves authorship, provenance, unsupported fragments, and explicit unknowns;
- before the next unrelated question, each meaning-bearing settlement has exactly one `changed`, `already represented`, or `blocked` disposition;
- `changed` has successful current-net mutation evidence and required diagnostics, `already represented` has a reusable current observation or a fresh reread, and `blocked` records the exact local blocker while leaving unsupported content absent;
- user-facing speech remains proposed or deferred until the corresponding success, then and only then describes canonical state as settled or changed;
- the interview remains adaptive and purpose-relative rather than traversing a fixed schema.

Disagreement about whether a beat is meaning-bearing, same-thread, or a topic boundary is an adjudication failure, not an automatic pass. Preserve the trace and return the disagreement to the mission owner.

### Required future artifacts and inputs

Retain the production-path run configuration, canonical `conversation.db` with its WAL-safe snapshot procedure, public snapshot, trace JSON and Markdown, public transcript, final Ledger revision identity and body, final net, browser diagnostics, recording, and evidence manifest. The manifest and canonical trace are the mechanical authorities; the manual rubric supplies semantic adjudication.

Mission 7d must replace each placeholder below and obtain owner approval immediately before execution:

- exact Brunch model: **owner input required**;
- exact reasoning level: **owner input required**;
- expected model steps: **owner input required**;
- hard model-step ceiling: **owner input required**;
- estimated USD: **owner input required**;
- hard USD ceiling: **owner input required**;
- retained artifact destination and recording target: **owner input required**.

This side quest runs no provider calls and retains a zero-call, USD 0 budget.

**Accepted pass conditions for the future probe:**

- first partial Ledger settlement follows the first consequential distinction;
- no topic boundary is crossed with unsaved meaning;
- no correction remains outside the next required settlement;
- no more than the accepted number of focused same-thread follow-ups defers settlement;
- every meaning-bearing settlement receives a current-net disposition before the next unrelated question;
- no prose claims settlement or construction without successful tool evidence;
- supported construction remains progressive and browser diagnostics follow attempted code/dependency changes;
- legitimate unknowns stay visible rather than being invented merely to satisfy cadence.

**Completion criterion:** the handoff names the fixed script shape, model and effort to be selected by Mission 7d, hard call and USD ceilings to be approved before execution, stop conditions, retained artifact destination, manual adjudication rubric, and the claims the probe cannot make.

**Future oracle:** canonical run `trace.json`/`trace.md`, public transcript, final Ledger revision, final net, browser diagnostics, recording, and manifest, manually adjudicated against the scripted topic boundaries. Prompt presence, raw tool counts, and scripted faux-provider obedience are insufficient model-policy evidence. A passing bounded probe can establish behavior for that model, reasoning level, fixed script, and run only. It cannot establish broad semantic correctness, repeatability, causality of the guidance delta, the necessity of runtime enforcement, performance at full-demo scale, persona realism, or worked-example acceptance. A pass would permit Mission 7d—not this side quest—to decide whether to schedule its fresh full persona observation.

## Work packages

### SQ-1 — Evidence pin and rubric

- Preserve `run-5uSidX` unchanged and verify its manifest.
- Produce the deterministic cadence report from canonical public artifacts.
- Record the manually adjudicated topic boundaries and corrections needed by the provider probe.
- Define the pass/fail rubric from the bounded lifecycle contract; avoid a generic “mutate every N turns” semantic claim.

**Return:** red cadence report, first failure boundary, and reviewable rubric.

### SQ-2 — Accepted policy and authority map

- Present the bounded Ledger checkpoint, three-way construction disposition, observation-reuse rule, and narration rule as the accepted side-quest recommendation.
- Assign each accepted rule one future authoritative home without editing production prompts or skills from this file.
- Identify current wording that would be replaced, narrowed, or retained.
- Keep false settlement narration as an explicit behavioral prohibition with a discriminating successful-result oracle.

**Return:** reviewable accepted contract and replace/narrow/retain authority map.

### SQ-3 — Remedy ladder and oracle design

- Rank guidance recut, canonical overdue signal, and enforceable disposition as successive hypotheses rather than a package to implement all at once.
- State the real observation that promotes the next rung.
- Name every deterministic seam a later implementation would have to pin.
- Keep scripted faux-provider limits explicit: it can prove carriage, ordering, state derivation, and browser execution, never model compliance.

**Return:** falsifiable remedy ladder and exact future oracle requirements, with no selected runtime mechanism beyond the evidence.

### SQ-4 — Mission handoff and side-quest close

- Independently audit the accepted interaction policy and deferral bound before promotion.
- Promote accepted policy, future implementation scope, provider-probe budget requirements, stop rules, fog items, and proof obligations into `MISSION.md`.
- Record the diagnosis link and later proof destination in [PR #9722](https://github.com/hashintel/hash/pull/9722) and any affected future-planning home.
- Audit that `MISSION.md` remains the sole execution authority, then remove this file before implementation or paid execution begins.

**Return:** one live mission authority, no active side-quest residue, and no duplicated contract.

## Proof obligations

| ID | Obligation | Oracle | Not established by |
| --- | --- | --- | --- |
| SQ-P1 | The preserved failure is mechanically reproducible without mutating the run. | Read-only cadence command, manifest verification, canonical trace inspection. | A prose summary or stale screenshot. |
| SQ-P2 | The first semantic lifecycle failure is turns 13–15, not merely the later maximum gap. | Manual comparison of the public user/assistant exchange, successful tool calls, and topic change. | Turn counts alone. |
| SQ-P3 | The accepted policy exposes every material choice and assigns each rule one future authoritative home. | Independent packet audit, followed by the mission owner's before/after authority-map audit against `MISSION.md`. | This document existing or containing emphatic wording. |
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
- Whether the accepted one-focused-follow-up bound generalizes beyond the fixed future probe. This packet selects it because it distinguishes a microthread from the observed indefinite stretch; one passing run cannot prove universality.
- Whether mechanical user-turn counting is an acceptable trigger when semantic meaning cannot be determined without another model judgment.
- Whether a runtime can enforce a construction disposition without adding a costly no-op tool call. Do not invent such a tool before prompt-only behavior is tested.
- Whether low reasoning is an independent contributor. A reasoning-level comparison is out of scope until the primary cadence repair is observed and separately allocated.
- Patch-style Ledger mutation remains deferred by Mission 7d. Re-enter only if the accepted payload work and bounded guidance still make full settlement infeasible at the real boundary.

## Stop or reorient

Stop and return to Lu when any of these occurs:

- the accepted bounded lifecycle conflicts with a newer mission-owner decision;
- the side quest conflicts with the concurrently recut `MISSION.md` or another active side quest appears;
- the least mechanism requires a second authority, semantic observer, upstream Flue change, or provenance bypass;
- a deterministic test would only script the desired tool calls and falsely claim model-policy proof;
- the packet cannot specify a credible future paid allocation shape, recording gate, or first-failure stop rule;
- a proposed proof treats prompt text, tool counts, or scripted faux-provider obedience as real model-policy evidence;
- the mission owner revises the deferral bound, construction dispositions, observation-reuse rule, or false-narration policy—record the revision in the mission rather than implementing around it;
- promotion would leave both this file and `MISSION.md` carrying binding execution instructions—complete the authority transfer and remove this file first;
- the proposed mechanism would force meaningless mutations, create a second authority, bypass provenance, or require an unearned upstream Flue change; return the limitation instead of widening scope.

## Close

This side quest closes when the independent step-6 audit passes, the mission owner has promoted or explicitly revised the accepted diagnosis and lifecycle, every implementation boundary, future oracle, paid gate, stop rule, and unresolved fog item has been promoted into `MISSION.md`, and a before/after audit confirms no binding meaning remains only here. Delete `SIDE_QUEST.md` at that point, before implementation or paid execution begins. Later model probes and the full worked-example acceptance run close Mission 7d obligations, not this side quest.
