# Experiment Configuration from the Workpiece

Read this during the Construct disposition whenever the settled workpiece states a decision the model should answer, and again whenever a settlement changes the decision, its measure, a tunable quantity or its range. Do not read it merely because the net has parameters or metrics.

An experiment is an ordinary thing a model has, like a scenario or a metric: the workpiece supplies what it means, the net supplies what makes it executable, and you propose it when both are present. The person does not need to ask for one or know the word.

## Two sources, one readiness judgment

The workpiece supplies meaning. Read these sections and nothing else decides readiness:

- **What the model must answer, compare, or support** — the decision or question.
- **Goals, measures, constraints, and thresholds** — the quantity to minimize or maximize, the quantities that may be varied with their supported range and unit, and every restriction, threshold or safety condition.
- **Boundary, horizon, and accuracy expectation** and **Time, quantities, arrivals, and stochastic behavior** — the operating regime, the horizon and how sure the result must be.
- **Policies, exceptions, practiced rules, and contextual regimes** — which regime (baseline, peak, degraded) the decision applies to.
- **What the result must not claim** — carried into the proposal's text, never dropped.

The net supplies executability, judged from a verified current canonical `getLatestNetDefinition` result:

- a saved scenario for the stated regime exists (`definition.scenarios[]`);
- that scenario has a saved scenario parameter for each tunable quantity, typed `integer` or `real` (or `ratio` when the range stays within 0–1); a `boolean` parameter cannot be swept;
- a saved metric exists for the measure (`definition.metrics[]`);
- referenced expressions compile (`read_petrinaut_diagnostics` settled with no errors).

**Readiness is the conjunction**: the workpiece states the decision, the measure and its direction, at least one tunable quantity with a person-stated range and unit, and the regime and horizon; and the net has the saved scenario, the typed scenario parameter and the saved metric. Structure alone never triggers a proposal. The net alone never supplies the objective. If the workpiece has parameters and metrics recorded but no stated decision, there is nothing to propose.

When a workpiece condition is present and its net counterpart is missing, that is ordinary construction, not experiment work: add the scenario, scenario parameter or metric through mounted canonical Petrinaut tools, run the checks, then reassess. The separate legacy batched construction mode uses `mutate_petrinaut_net` with its own basis guidance. When a workpiece fact is missing (no range, no unit, no direction, no regime), ask the smallest resolving question in interactive elicitation, or record the exact gap in construct-only execution. Never invent a range, unit, threshold, horizon or default to reach readiness.

## Correspondence table

Each workpiece condition class maps to one destination in `PetrinautExperimentRequest`, or to `unsupported`.

| Workpiece condition (where it lives) | Request destination | Fidelity and mandatory disclosure |
| --- | --- | --- |
| Tunable quantity with a stated range ("vary the tunable count from 3 to 9 units") — Goals/constraints; Activities | `scenarioParameterValues[identifier] = { mode: "range", min, max }` on a saved scenario parameter | Exact for an integer or real quantity; the sweep domain derives from the parameter's declared `type`, so a count needs an `integer` parameter, never rounding in code. A `boolean` parameter rejects ranges: unsupported. A `ratio` range must stay within 0–1. Units are carried nowhere: declare the unit and any conversion. |
| Quantity to minimize or maximize ("minimize the last-frame delay measure") — Goals/measures; Objective dependencies | `execution = { mode: "optimize", objectiveMetricId, direction, steps, runsPerStep }`; the metric must also appear in `metricIds` | The optimizer reads the metric's last-frame mean over the runs in a step. A total over the horizon or a peak needs an accumulating place or attribute in the net; declare whether the metric is last-frame, accumulated or peak. |
| Operating regime and initial state ("the named peak regime", "start from the recorded initial population") — Boundary conditions; Policies/contextual regimes | `scenarioId` of the saved scenario | The scenario is a construction prerequisite; never invent one in the request. Fixed overrides for this experiment go to `scenarioParameterValues[identifier] = { mode: "fixed", value }`. |
| Horizon and resolution ("an eight-unit horizon with quarter-unit steps") — Boundary, horizon; Time | `maxTime`, `dt` in simulation time units | Exact once the unit conversion is declared. `dt` must divide the horizon into at most 1,000,000 steps. |
| Confidence appetite ("fairly sure", "rough") — Accuracy expectation; Assumption appetite | `runCount`, `runsPerStep`, `steps`, `seed` | Heuristic. Declare the chosen numbers as agent inference and the budget they respect: `steps × runsPerStep ≤ 10,000` and `runsPerStep ≤ runCount`. |
| Other measures worth reporting beside the objective — Goals/measures | additional `metricIds` (saved metrics; at most 20) | Reported only. Label every non-objective metric "reported, not enforced". |
| Absolute avoid-state ("never exceed a stock of 200 tokens in the named place") — Goals/thresholds; Policies | `unsupported` | The AI experiment request currently exposes no constraints or constraint policy, so no restriction reaches execution. Name it, give the reason, and if a saved metric observes it, list that metric as "reported, not enforced". Never fold it into the objective as a penalty. |
| Tolerable-rate restriction, service-level or completion-by-time condition ("90 % complete within four time units") — Goals/thresholds; Objective dependencies | `unsupported`, optionally beside a reporting metric | Same gap as above, plus a rate over time needs an accumulating attribute in the net before any metric can even report it. |
| Relation among parameters or a budget over them — Goals/constraints | `unsupported` | Parameter-space constraints cannot be carried by the request. |
| Soft preference ("prefer the smaller parameter value when the objective is equal") — Goals/measures; Policies | Fold into the objective metric code as a weighted term, or report as a separate metric | Only for a genuinely soft preference. The weight is agent inference and must be declared with its basis. Never use this for a hard restriction. |
| What the result must not claim — Purpose and posture | Proposal text | No request field. It belongs in the summary the person reads beside the settings. |

## Mandatory declarations

Every proposal carries, in `declarations`:

- the unit and conversion for each numeric field (`min`, `max`, `dt`, `maxTime`, fixed values);
- for each metric, whether it is last-frame, accumulated or peak, and whether it is the objective or "reported, not enforced";
- for each chosen budget number (`runCount`, `steps`, `runsPerStep`, `seed`), that it is agent inference and what it respects;
- what the result must not claim, in the person's words.

Every proposal carries, in `unsupported`, each restriction, threshold or condition the request cannot carry, with a one-line reason. Set `blocksRun: true` for a hard or load-bearing restriction; omission also blocks Run. Set `blocksRun: false` only when the person explicitly accepts a reporting-only exploration, and settle that acceptance in the Ledger before drafting. The host verifies the settled revision, not the semantic judgment that acceptance occurred; do not claim consent is mechanically verified. A reporting metric does not itself authorize running. If `reportedByMetricId` is present, include it in `experiment.metricIds`. An empty list means the workpiece stated no restriction, not that restrictions are enforced.

Ground every proposal in the settled Ledger; disclose which choices are inference in `declarations`. The host resolves the current settled revision and verified canonical read from conversation history. Do not put a basis table, locator, hash, revision or observation tool-call ID in the draft input.

## The proposal and the tool

When ready, do two things in one turn, in this order:

1. Say one short sentence in the person's vocabulary naming what varies, over what range and unit, under which saved scenario, what is minimized or maximized, and anything load-bearing that is not carried. In typology terms: "I have enough to test the tunable-count decision: vary the count from 3 to 9 units under the named regime and minimize the last-frame delay measure over the eight-unit horizon. The hard stock limit of 200 tokens is not enforced by the run; peak stock is reported beside the result." Replace those typology terms with the person's vocabulary in the actual proposal.
2. In integrated Brunch, call `draft_petrinaut_experiment` once with `{ experiment, declarations, unsupported }`, where `experiment` is exactly the request shape above and every identifier (`scenarioId`, `metricIds`, `objectiveMetricId`, scenario parameter identifiers) is taken from the verified current canonical `getLatestNetDefinition` result. Do not compose identifiers from names.

The tool drafts a proposal in this editor's memory and returns `{ status, summary, diagnostics }`. It does not run anything, save anything with the document or navigate. Say "drafted for review, not run", not "added to the model". The person runs a drafted proposal from the card's Run action. Canonical `createExperiment` remains available for Stock parity; call it directly only when the person explicitly requests immediate execution. Approval of a draft in conversation is not a request to execute it: point them to the card. If `status` is `invalid`, repair from the diagnostics against a fresh observation and redraft; do not ask the person to fix identifiers.

If a load-bearing restriction lands in `unsupported`, state that gap in the sentence before the tool call and explain that Run is blocked. Do not tell the person to press Run while a blocking restriction remains. If they explicitly accept a reporting-only exploration, settle that acceptance and redraft without claiming the restriction is enforced.

## Once, not repeatedly

Propose when readiness is first reached, or when a later settlement changes the meaningful configuration: the decision, the objective metric or its direction, a tunable's identity or range, the scenario, the horizon, or the unsupported list. A redraft supersedes the earlier card. A wording-only change, a budget-only change, or a fresh observation of an unchanged net is not a new configuration.

The tool result reports preparation only. Run and Dismiss happen later in the card and are not reported to the conversation, nor is eventual completion, so do not infer any of those events or describe them as observed. Treat an explicit "do not run" stated in the conversation as authoritative until the person reopens the question. Do not apply a winning configuration to the model on your own; the person decides what to do with the result.

## Refusals

- Never propose from structure alone or infer the objective from the net.
- Never invent a scenario, metric, parameter, range, unit, threshold, horizon or default; construct and settle prerequisites first, ask for facts.
- Never encode a hard restriction as an objective penalty.
- Never claim a restriction is enforced; the request carries none.
- Never call `draft_petrinaut_experiment` as a way to run, or describe a drafted proposal as saved, running or applied.
- Never open or pre-fill the experiment creation drawer, or return manual set-up instructions in place of the tool call.
