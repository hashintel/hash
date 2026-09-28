# Live product runs: typed versus open Ledger Notes

Four browser-visible persona runs of the production Brunch path on the `inventory-purchasing` case, recorded on 2026-09-28. Each pair compares typed epistemic fields (`BRUNCH_LEDGER_NOTES=typed`) with a free-text disposition (`open`). One run per arm; the persona is a free-playing agent, so the pairs diverge in conversation as well as in Note shape.

| Directory | Brunch model | Note shape | Turns | Stopped because |
| --- | --- | --- | --- | --- |
| `luna-typed/` | GPT-6 Luna, `xhigh` | typed | 14 | operator stop to change model |
| `luna-open/` | GPT-6 Luna, `xhigh` | open, coached (see below) | 25 | operator stop to change model |
| `sol-typed/` | GPT-6 Sol, `medium` | typed | 37 | conservative spend bound reached |
| `sol-open/` | GPT-6 Sol, `medium` | open, uncoached | 22 | conservative spend bound reached |

The persona was `pi` with Claude Sonnet 4.6 at low thinking and default axes in every run. Each directory holds the compiled `ledger.md`, `analysis.json` (and `analysis-turn21.json` for the Sol pair), `construction-per-turn.json`, and the audit results; the Sol pair also keeps `transcript.md`. Raw run directories, including canonical snapshots, remain under `apps/brunch-agent/.data-wipe-me/persona-runs/` on the recording machine.

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
| Turns with net changes | 3 of 14 | 1 of 25 | 5 of 37 | 6 of 22 |
| Net elements (places, transitions, arcs) at end | 16 | 7 | 11 | 56 |
| `ledger_compile` / filtered reader calls | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| Refused commits / net-guard refusals | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| Estimated spend, including persona | USD 0.51 | USD 0.63 | USD 2.82 | USD 2.63 |

Spend is estimated from the server's per-request chronology at catalogue prices, with cached input at the cached rate; `scripts/run-cost.mjs` also reports a bound that prices cached input at the full rate. The Sol typed net stayed at 11 elements from turn 8 to turn 37; the Sol open net grew from 0 at turn 11 to 56 by turn 20.

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

**Construction.** Observed: the Sol typed run recorded an open construction Note explaining what not to build in 27 of 37 turns, and its net stopped growing; the Sol open run built bounded fragments once the persona stated an ordering rule at turn 12. Interpretation, unconfirmed: typed epistemic guidance may increase caution at the cost of progressive construction, but persona trajectories differ between the runs and one run per arm cannot separate the two.

**Rolling status Notes.** Observed: construction-blocker, delivery and "still unknown" Notes are rewritten through supersession, up to 22 versions deep on Luna. Interpretation: current status needs a home other than an immutable Note, or guidance that records status only when it changes.

**Unused affordances.** `ledger_compile` and the filtered readers went unused in every run. The readers lose to Petrinaut's own guidance, which names `getLatestNetDefinition` throughout.

## Changes to the evaluation's framing

- Progressive construction — net growth per turn and the share of turns ending in a blocked disposition — belongs in the scorecard beside epistemic measures; it was the clearest difference observed.
- Mechanical counts cannot judge classification or follow-up; the auditor pass is part of the method.
- Differences between arms need replicates or a fixed persona script before they are attributed to the Note shape.

## Reproducing

From a run directory's parent, with Node 22:

```sh
node scripts/run-analysis.mjs <run-dir> [max-turn]   # mechanical measures
node scripts/run-cost.mjs <run-dir>                  # Brunch spend from the server log
node scripts/persona-cost.mjs <pi-session.jsonl>     # persona spend
node scripts/construction-per-turn.mjs <run-dir>     # net growth per turn
node scripts/audit-prep.mjs <run-dir> 30             # audit samples
```
