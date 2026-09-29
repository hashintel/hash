# Live product runs: typed versus open Ledger Notes

Four browser-visible persona runs of the production Brunch path on the `inventory-purchasing` case, recorded on 2026-09-28, and two scripted replays. Each pair compares typed epistemic fields (`BRUNCH_LEDGER_NOTES=typed`) with a free-text disposition (`open`). In the four persona runs there is one run per arm, and the persona is a free-playing agent, so the pairs diverge in conversation as well as in Note shape. The replays hold the conversation fixed; see [Scripted replay](#scripted-replay).

| Directory | Brunch model | Note shape | Turns | Stopped because |
| --- | --- | --- | --- | --- |
| `luna-typed/` | GPT-6 Luna, `xhigh` | typed | 14 | operator stop to change model |
| `luna-open/` | GPT-6 Luna, `xhigh` | open, coached (see below) | 25 | operator stop to change model |
| `sol-typed/` | GPT-6 Sol, `medium` | typed | 37 | conservative spend bound reached |
| `sol-open/` | GPT-6 Sol, `medium` | open, uncoached | 22 | conservative spend bound reached |
| `replay-typed/` | GPT-6 Sol, `medium` | typed | 22 | end of the replayed script |
| `replay-open/` | GPT-6 Sol, `medium` | open, uncoached | 22 | end of the replayed script |

In the four persona runs the persona was `pi` with Claude Sonnet 4.6 at low thinking and default axes. Each directory holds the compiled `ledger.md`, the final `net.json`, `analysis.json` (and `analysis-turn21.json` for the Sol pair) and `construction-per-turn.json`. The persona-run directories also hold the audit results, and the Sol pair and the replays keep `transcript.md`. Raw run directories, including canonical snapshots, remain under `apps/brunch-agent/.data-wipe-me/persona-runs/` on the recording machine.

## The coached control

In the Luna pair, the elicitation skill described the typed fields in both modes and asked open-mode Notes to state the same distinctions in their disposition. The open arm therefore wrote dispositions such as "source: person; basis: recalled case; standing: settled as a single incident". The typed field guidance now mounts only for typed Notes, and the Sol open arm wrote uncoached dispositions such as "direct remembered case". The Luna pair measures machine-readable fields against the same vocabulary as prose; only the Sol pair measures typed against open.

## Measures

| | Luna typed | Luna open | Sol typed | Sol open |
| --- | --- | --- | --- | --- |
| Median / 90th-percentile turn | 63 s / 151 s | 37 s / 71 s | 20 s / 62 s | 24 s / 133 s |
| Brunch output tokens per turn | 6,200 | 3,200 | 700 | 1,150 |
| Largest request context | 141k | 152k | 97k | 109k |
| Notes | 79 | 126 | 127 | 87 |
| Notes that supersede another | 57% | 70% | 27% | 41% |
| Longest supersession chain | 11 | 22 | — | — |
| Compiled Ledger | 46 KB | 103 KB | 65 KB | 51 KB |
| `ledger_compile` / filtered reader calls | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 2 |
| Refused commits / net-guard refusals | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| Estimated spend, including persona | USD 0.51 | USD 0.63 | USD 2.82 | USD 2.63 |

Spend is estimated from the server's per-request chronology at catalogue prices, with cached input at the cached rate; `scripts/run-cost.mjs` also reports a bound that prices cached input at the full rate.

## Construction

Added retrospectively from `scripts/construction-per-turn.mjs`, which reads each run's final `net.json` and classifies every turn as *built* (the net changed), *blocked* (no change, and a construction blocker was recorded) or neither. Typed runs mark a blocker with `standing: open` under `construction`; open runs, lacking that field, file it under `open-matters` in prose, so the open-run count depends on a wording match and is approximate.

| | Luna typed | Luna open | Sol typed | Sol open |
| --- | --- | --- | --- | --- |
| First turn that changed the net | 7 | 4 | 4 | 12 |
| Turns built / blocked / neither | 3 / 11 / 0 | 1 / 21 / 3 | 5 / 27 / 5 | 6 / 16 / 0 |
| Builds after the first | 2 in 7 turns | 0 in 21 | 4 in 33 | 5 in 10 |
| Places / transitions / arcs | 7 / 2 / 7 | 3 / 1 / 3 | 5 / 2 / 4 | 14 / 8 / 34 |
| Read or inhibitor arcs | 0 | 0 | 0 | 4 |
| Token types / coloured places | 0 / 0 | 0 / 0 | 2 / 5 | 4 / 11 |
| Transitions with lambda or kernel code | 0 | 0 | 2 | 8 |
| Parameters / differential equations | 0 / 0 | 0 / 0 | 2 / 0 | 5 / 1 |
| Metrics / scenarios | 0 / 0 | 0 / 0 | 3 / 1 | 2 / 0 |
| Final compilation check | clean | clean | clean | clean |

Per-turn outcome (`B` built, `x` blocked, `-` neither):

```text
Luna typed  xxxxxxBBxBxxxx
Luna open   xxxB-xxxxxxxxxxxxx-xxxx-x
Sol typed   ---BBxxBxxxxxxxxxxxx-xBxxxx-xxxxxxxxB
Sol open    xxxxxxxxxxxBxBxxBBxBBx
```

The Sol open net is the only one with behaviour beyond a single gate. It places Indian orders from a review event while the supplier accepts orders, rounding up to the 2,500-unit minimum in the kernel. It requests a German bridge when released stock falls below 500 and Indian orders are blocked. It receives whole orders into quarantine, then releases or disposes of whole lots. It starts a batch only when both materials cover it, and it ages waiting batches through a differential equation to measure planned-to-actual start delay. At turn 22 it recorded its own representation loss: the aggregate balance cannot carry lot expiry dates. The Sol typed net holds externally populated stock states, a pass-or-reject routing for Flowbind lots, the reorder-point and target parameters, inventory-position metrics and a provisional starting snapshot. None of its transitions places, receives or consumes material.

## Scripted replay

To separate the persona's trajectory from Brunch's behaviour, Sol open's 22 user messages were replayed verbatim into two fresh runs with no persona agent: one typed and one open as a control (`scripts/replay.sh`). Both used GPT-6 Sol at `medium`. The launcher sends the case's opening, which is Sol open's turn 1, and the script sends turns 2–22 whatever Brunch asked.

The control is the validity check. Through turn 12 it reproduced Sol open exactly: blocked through turn 11, then an Indian ordering fragment at turn 12 with MOQ rounding in code. Both replays asked nearly the same questions as Sol open through turn 12, including the turn-9 question of whether the 2,500 minimum is a floor or a multiple. After turn 12 the questions drifted and the replayed answers fit less well: the control asked twice what stops repeated German orders, which no replayed answer settles, and left the German path unbuilt. Turns 13–22 are therefore weaker evidence than turns 1–12.

| | Replay typed | Replay open | Sol open |
| --- | --- | --- | --- |
| Per-turn outcome (`B`, `x`, `-` as above) | `---B---x--------B-----` | `xxxxxxxxxxxBxxxxxxxBBx` | `xxxxxxxxxxxBxBxxBBxBBx` |
| Net elements at turn 12 / turn 22 | 7 / 19 | 10 / 20 | 19 / 56 |
| Places / transitions / arcs at turn 22 | 7 / 3 / 9 | 7 / 2 / 11 | 14 / 8 / 34 |
| Read or inhibitor arcs | 0 | 3 | 4 |
| Token types / coloured places | 0 / 0 | 2 / 6 | 4 / 11 |
| Transitions with code / parameters / differential equations | 0 / 0 / 0 | 2 / 3 / 1 | 8 / 5 / 1 |
| Estimated Brunch spend | USD 1.04 | USD 1.35 | USD 2.19 |

With the same input, the typed replay never built the ordering fragment. It built early, at turn 4: an uncoloured status fragment in which one token per order moves from open to arrived-in-quarantine on an externally supplied arrival event. At turn 17 it added quality release and rejection in the same style. Its later construction Notes (n35 at turn 9, n39 at turn 10, n65 at turn 19, n75 at turn 22) state as `settled` that the current status-marker net cannot carry the new rule, so the ordering rule, the production gate and expiry stayed in the Ledger only. The blocked-turn count misses these Notes because they are not `open`. At turn 12 it acknowledged the rounding rule was resolved and asked how German orders are sized.

The control waited, then built coloured aggregate stock balances at turn 12, and reused them for a full-batch production gate at turn 20 and a waiting clock at turn 21. It also avoided restructuring: it recorded that aggregate balances lose per-lot identity (turns 17 and 22) and blocked the quality path on that loss (turn 18). The difference is that its first representation carried quantities, so later rules could attach to it.

Interpretation, unconfirmed: the replay removes the persona's trajectory as the explanation for turns 1–12, and the stall reproduces in typed mode. Both typed Sol runs built a small fragment at turn 4 and then judged later rules against it. The skill's blocked disposition covers a fragment the target "cannot represent", and typed Brunch applied that to its own early net rather than to Petri nets. Whether the Note shape causes the early commitment is not settled; each replay arm is still a single sample of a nondeterministic model.

## Round 1: build-first guidance on the restacked branch

Two free-persona runs on 2026-09-29 after the guidance rewrite described in [`docs/refactoring/construction-guidance-review.md`](../../../../docs/refactoring/construction-guidance-review.md) and the restack that brought in the naive-domain-expert persona brief. GPT-6 Sol at `medium`, persona `pi` on Claude Sonnet 4.6 at low thinking, `inventory-purchasing`. Both were closed by the operator: the persona said it was out of time and asked Brunch to fill in the rest with its best guesses. Directories `round1-typed/` and `round1-open/` hold `dialogue.md` (the conversation without tool output), `ledger.md`, `net.json`, `analysis.json`, `construction-per-turn.json`, `turn-timing.txt` and `fidelity-audit-result.json`.

| | Sol typed | Sol open | Round 1 typed | Round 1 open |
| --- | --- | --- | --- | --- |
| Turns | 37 | 22 | 27 | 24 |
| First turn that changed the net | 4 | 12 | 2 | 2 |
| Turns built / blocked / neither | 5 / 27 / 5 | 6 / 16 / 0 | 22 / 3 / 2 | 16 / 2 / 6 |
| Places / transitions / arcs | 5 / 2 / 4 | 14 / 8 / 34 | 38 / 30 / 71 | 37 / 25 / 77 |
| Token types / coloured places | 2 / 5 | 4 / 11 | 16 / 36 | 5 / 28 |
| Transitions with code | 2 | 8 | 30 | 25 |
| Parameters / differential equations | 2 / 0 | 5 / 1 | 14 / 9 | 16 / 3 |
| Metrics / scenarios | 3 / 1 | 2 / 0 | 6 / 2 | 10 / 1 |
| Net mutations (updates, removes) | 23 (5, 0) | 48 (11, 0) | 223 (71, 16) | 183 (73, 3) |
| `getNetCompilationErrors` calls | 9 | 13 | 68 | 69 |
| `ledger_compile` / filtered reader calls | 0 / 0 | 0 / 2 | 3 / 24 | 0 / 3 |
| Notes / superseding Notes | 127 / 34 | 87 / 36 | 142 / 50 | 116 / 42 |
| Median / 90th-percentile turn | 20 s / 62 s | 24 s / 133 s | 107 s / 210 s | 113 s / 176 s |
| Brunch spend, estimated | USD 2.0 | USD 2.2 | USD 10.4 | USD 5.7 |

Per-turn outcome:

```text
Round 1 typed  -BBBBBBBBBBBBxxBxBB-BBBBBBB
Round 1 open   -BB-xBBBBBB-xB-B--BBBBBB
```

**Construction.** Both arms built from turn 2 and kept building; the stall did not recur in either. Both nets carry behaviour end to end: ordering against reorder points and targets, supplier routes, receipt into quarantine, release or rejection, lot ageing, production against the one-to-one recipe, and customer or cost outcomes. Typed favoured many token types and continuous dynamics; open favoured aggregate balances with read and inhibitor arcs and more metrics. The typed run revised as it went (16 removals, 71 updates); the open run mostly added. The typed run's three blocked turns were real representation limits, not caution: Petrinaut's TypeScript diagnostic rejected its attempt at oldest-expiry-first allocation across many lots, and it recorded the rejected attempt rather than inventing around it. The open run's two "blocked" turns were "already represented" and are a counting artefact.

**Fidelity** (`fidelity-audit-result.json`; blind auditors, one per run, following `scripts/fidelity-audit-instructions.md`): of 67 audited items in the typed net, 53 traced to the person, 6 were labelled stand-ins, 7 were authorised guesses and 1 was unclear; of 69 in the open net, 58, 5, 6 and 0. Neither net had an unlabelled or misattributed item. The unclear item is the typed run's outage scenario, which adds 14 days to every order over the whole horizon where the person described one order caught by a two-week outage. Communication differed: the typed run disowned its stand-ins in replies the person could see ("my replaceable placeholder, not as your estimate"); the open run labelled three shelf-life placeholders that drive every expiry outcome only in parameter names and Notes, and an inhibitor arc enforcing "one German top-up outstanding at a time" only in a Note.

**The closing request.** Asked to fill in the rest with best guesses, both arms first recorded the authorisation as a Note, then built, then said what was guessed and that nothing had been simulated. Typed used the permission to construct the whole production-to-shipping path (4 types, 6 places, 6 transitions, a differential equation and two metrics), naming the external allocation certificate as its central unsafe assumption. Open added only an illustrative one-batch scenario with agent-chosen opening stock and refused to draft anything that could be mistaken for the 104-week comparison.

**Where the time goes** (`turn-timing.txt`, from `scripts/turn-timing.mjs`): 68–71% of wall time is model generation, 16% net mutation round trips, 5–6% compilation checks, 4% Ledger commits. The cause is step count. Brunch averaged 15 model steps per turn, up to 57, and in 378 of 412 typed-run steps issued exactly one tool call. Each step costs about 6.7 s of model time, 2 s of it before the first token, plus about 2 s of browser round trip, so a 20-element fragment costs about three minutes. Reasoning parts appear in 84% of steps. The same step count drives the four-fold cost increase.

**Ledger.** Both arms now use the Ledger as a record rather than a steering device: gap Notes fell (typed 18 in `open-matters`, open 4) while construction Notes stayed at 37–40, and the typed run compiled the Ledger three times and used the filtered net readers 24 times, the first run to use either at will.

**Persona harness.** The open run's persona agent lost about ten minutes at turn 2 when `persona say` refused to overwrite a composer draft consisting of one space (`browser-turn.ts` asserts the draft equals `""`), and tried to clear the composer through Chrome's debugging port before recovering. It read only the composer, so nothing privileged leaked, but the assertion should treat a whitespace-only draft as empty, and the brief should tell the agent to report a failed `say` rather than repair the browser.

## Audits

Independent auditor agents judged deterministic samples of 30 Notes per run (`scripts/audit-prep.mjs` selects every k-th Note). Inputs were each Note plus the exchange in which it was committed.

**Classification of typed fields** (`audit-classification-result.json` in the typed directories):

| | Luna typed | Sol typed |
| --- | --- | --- |
| `source` correct | 29, 1 defensible | 30 |
| `standing` correct / defensible / wrong | 17 / 13 / 0 | 15 / 14 / 1 |
| `basis` wrong | 2 | 1 |
| `precision` wrong or missing | 10 | 0 |
| Settled claim and open gap in one Note | 7 | 15 |
| Unsupported content | 0 | 0 |

`practiced` became the default `basis` for the person's Notes; `qualitative` was applied to gap lists with no quantity.

**Recovering the same distinctions from open Notes** (`audit-classification-result.json` in the open directories): in the Sol open run, source was explicit in 16 and inferable in 14 of 30 Notes, and standing explicit in 15, inferable in 14 and ambiguous in 1. `settled` was never stated and had to be inferred from words such as "direct"; `open` was the easiest standing to recover. Sixteen of 30 Notes mixed standings, about the same as the typed arm. Neither arm ever used `contested`, and out-of-scope matters were written as prose or `settled` rather than `inapplicable`.

**Follow-up on recorded gaps** (`audit-followup-result.json` in the Sol directories):

| | Sol typed | Sol open |
| --- | --- | --- |
| Sampled gaps that were genuine gaps | 30 | 23 |
| Asked / partly / not pursued | 18 / 7 / 5 | 23 / 3 / 4 |
| Later resolved by a successor | 2 | 3 |
| Pursuit judged inappropriate | 0 | 1 |

In both runs the next question usually targets the newest blocker's first askable item; gaps are narrowed through supersession chains rather than closed, off-thread gaps are dropped, and no gap was ever explicitly deferred. Gaps in the open run had to be identified from category and wording, which pulled in seven settled Notes with a trailing caveat.

## Observations and interpretations

**Model.** GPT-6 Sol at `medium` produced 5–9 times fewer output tokens per turn, shorter turns, less context growth and much less rolling rewriting than GPT-6 Luna at `xhigh`. This motivated changing `petrinautAiModel` to Sol at `medium`.

**Typed fields versus prose.** Observed: the typed arm classified accurately, and the open arm's prose let a reader recover source and standing almost as well. Neither Note shape prevented mixed standings, and follow-up was similar. Interpretation: in this sample the typed fields add little to the model's own epistemic behavior; their value, if any, lies in host-side uses — the derived open-Notes index, coverage, the UI and audits — none of which the model exercised, because it never compiled the Ledger.

**Construction.** Observed: every run recorded a construction blocker in 73–84% of its turns, so Sol open was not less cautious than Sol typed; it started later. The difference lies in what happened to the blockers. Five things separate the Sol pair:

- *Opening story.* Brunch's first questions differed ("had to decide whether to buy … because supply might not cover production" versus "a recent purchasing decision where one of those risks mattered"). The persona answered the first with an early order placed on judgment, and the second with an outage handled by rules: the German bridge below 500 released units. Sol typed correctly declined to turn the judgment into a guard (n37), then followed its consequences through expiry, recall, lead-time records, the quality queue and outcome definitions.
- *Reaching the decision.* Sol open asked which decision was the person's to make at turn 7, the ordering rule at turn 8 and the minimums at turn 9. Sol typed asked the equivalent decision question at turn 21.
- *Blocker focus.* Sol open kept one rolling blocker chain in `open-matters` (16 of its 25 blocker Notes supersede an earlier one), narrowing from "blocked order-policy implementation" (turn 9) to "blocked on MOQ" (turn 11) and then "bounded net change now supported" (turn 12). Sol typed wrote a new open construction Note about each turn's topic (8 of 27 supersede). It listed minimum-order rounding as missing at turn 6 (n27) but did not ask about it until turn 37.
- *Stand-ins for unknowns.* Both runs refused to invent timing. Sol open represented each unknown trigger or timing as an externally supplied event (review, arrival, quality outcome, urgent threshold) and built around it. Sol typed did this once (the quality result, turn 4); afterwards its blockers named facts the person could not supply — lead-time distribution families, a simulation time origin for expiry, recall genealogy — and it built nothing that needed them.
- *Persona answers.* Sol open's persona answered in short, rule-like sentences; Sol typed's persona hedged more often, typically in answer to questions about records and measurement.

Interpretation, unconfirmed: progressive construction followed from reaching a decision rule early, keeping blockers narrowed to one askable fact, and substituting supplied events for unknown timing. How much the Note shape contributed is unclear. Without a `standing` field, the open arm had only one place for gaps, which may have encouraged the single rolling chain. But the trajectories diverged at the first question, and one run per arm cannot separate the two. Luna open, whose blockers also sat in `open-matters`, built once in 25 turns. The scripted replay later held the conversation fixed and the typed arm still stalled.

**Rolling status Notes.** Observed: construction-blocker, delivery and "still unknown" Notes are rewritten through supersession, up to 22 versions deep on Luna. In Sol open the same rewriting is the blocker chain that led to construction. Interpretation: current status needs a home other than an immutable Note, or guidance that records status only when it changes. That home should keep the narrowing to one askable fact that Sol open's chain showed.

**Unused affordances.** `ledger_compile` went unused in every run. The filtered readers were used twice, by Sol open alone, to read the net before building (turns 18 and 20); elsewhere they lose to Petrinaut's own guidance, which names `getLatestNetDefinition` throughout.

## Changes to the evaluation's framing

- Progressive construction belongs in the scorecard beside epistemic measures, and it was the clearest difference observed. The share of blocked turns did not separate the runs. What did was builds after the first, final net composition, and whether blockers narrowed to an askable fact.
- Mechanical counts cannot judge classification or follow-up; the auditor pass is part of the method.
- Differences between arms need replicates or a fixed persona script before they are attributed to the Note shape. A verbatim replay holds the input fixed only while Brunch's questions track the source run's; an open-arm control shows how long that lasts.
- A construction Note that declines to build can be `settled` rather than `open`, so blocked-turn counts need the auditor pass, or a classifier that reads the Note, not only its `standing`.

## Reproducing

From a run directory's parent, with Node 22:

```sh
node scripts/run-analysis.mjs <run-dir> [max-turn]   # mechanical measures
node scripts/run-cost.mjs <run-dir>                  # Brunch spend from the server log
node scripts/persona-cost.mjs <pi-session.jsonl>     # persona spend
node scripts/construction-per-turn.mjs <run-dir>     # per-turn construction and final net
node scripts/audit-prep.mjs <run-dir> 30             # audit samples
node scripts/turn-timing.mjs <run-dir> [--turns]     # wall time split into model, tool phases and other
node scripts/dialogue.mjs <run-dir>                  # the conversation without tool output
node scripts/fidelity-audit-prep.mjs <run-dir> <out> # arm-blind inputs for scripts/fidelity-audit-instructions.md
scripts/replay.sh <source-run> <live-run> 2 22       # replay user messages into an agentless run
```
