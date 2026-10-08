# Experiment Configuration

Read this while constructing, whenever the USER states a decision the model should answer or asks to run an experiment, and again whenever the decision, its measure, a tunable quantity or its range changes. Do not read it merely because the net has parameters or metrics.

An experiment is an ordinary thing a model has, like a scenario or a metric: the USER's account supplies what it means, the net supplies what makes it executable, and you propose it when both are present. The USER does not need to ask for one or know the word.

## Two sources, one readiness judgment

The Ledger supplies meaning; nothing else decides readiness. Each of these must be `confirmed`, and a stand-in's placeholder never counts:

- a `purpose` naming the decision or question, with any claim on what the result must not claim;
- a `direction` over a `metric`, or an `optimum` whose claims link it to its levers and directions; when it balances several directions, the USER has said which is primary or how they combine;
- at least one `lever` with a range and unit, from a `limit` on it or a claim about it;
- a `horizon`;
- the regime the decision applies to, when the account distinguishes several;
- every `threshold`, `target` and multi-lever `limit` that bears on the decision, carried as reported or unsupported.

The net supplies candidate executable inputs, judged from a current read:

- a saved scenario for the stated regime exists (`definition.scenarios[]`);
- that scenario has a saved scenario parameter for each lever being varied, of a type that can be swept;
- a saved metric exists for the objective (`definition.metrics[]`);
- the net has no reported errors from `getNetCompilationErrors`, which does not check saved scenario or metric code.

**Readiness is the conjunction** of both lists. It is proposal readiness, not proof that saved scenario or metric code compiles. Structure alone never triggers a proposal. The net alone never supplies the objective. If parameters and metrics exist but no `purpose` and `direction` or `optimum` is confirmed, there is nothing to propose.

When a Ledger record is confirmed and its net counterpart is missing, that is ordinary construction, not experiment work: add the scenario, scenario parameter or metric, run the checks, then reassess. When a fact is missing (no range, no unit, no direction, no regime), ask the smallest resolving question. Never invent a range, unit, threshold, horizon or default to reach readiness.

## Correspondence table

Each Ledger record maps to one destination in `PetrinautExperimentRequest`, or to `unsupported`. The `petrinaut` skill's experiment reference gives each field's limits.

| Ledger record                                                                                    | Request destination                                                                                                              | Fidelity and mandatory disclosure                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lever` with a range from a `limit` or a claim ("vary the tunable count from 3 to 9 units")      | `scenarioParameterValues[identifier] = { mode: "range", min, max }` on a saved scenario parameter                                | Exact for an integer or real quantity; a count needs an `integer` parameter, never rounding in code. A lever with only on/off settings cannot be swept: unsupported. Units are carried nowhere: declare the unit and any conversion.                                                      |
| `direction` over a `metric` ("minimize the last-frame delay measure")                            | `execution = { mode: "optimize", objectiveMetricId, direction, steps, runsPerStep }`; the metric must also appear in `metricIds` | The optimizer reads the metric's last-frame value. A total over the horizon or a peak needs an accumulating place or attribute in the net; declare whether the metric is last-frame, accumulated or peak.                                                                                 |
| `optimum`                                                                                        | Its levers' ranges, and its direction as the objective                                                                           | The request optimises one metric in one direction. Several directions need the USER's choice of a primary, the others reported, or a declared weighted combination; a genuine trade-off frontier is unsupported.                                                                          |
| Regime and initial state ("the named peak regime", "start from the recorded initial population") | `scenarioId` of the saved scenario                                                                                               | The scenario is a construction prerequisite; never invent one in the request. Fixed lever settings for this experiment go to `scenarioParameterValues[identifier] = { mode: "fixed", value }`.                                                                                            |
| `horizon` and resolution ("an eight-unit horizon with quarter-unit steps")                       | `maxTime`, `dt` in simulation time units                                                                                         | Exact once the unit conversion is declared.                                                                                                                                                                                                                                               |
| Confidence appetite, from claims on the `purpose` ("fairly sure", "rough")                       | `runCount`, `runsPerStep`, `steps`, `seed`                                                                                       | Heuristic. Declare the chosen numbers as agent inference and the budget limits they respect.                                                                                                                                                                                              |
| Other `metric`s worth reporting beside the objective                                             | additional `metricIds`                                                                                                           | Reported only. Label every non-objective metric "reported, not enforced".                                                                                                                                                                                                                 |
| `target` ("an average under four hours would count as success")                                  | A reporting metric in `metricIds`                                                                                                | Reported against its value, not optimised toward it unless the USER makes it the objective. Label it "reported, not enforced".                                                                                                                                                            |
| `threshold` ("never exceed a stock of 200 tokens", "90 % complete within four time units")       | `unsupported`, optionally beside a reporting metric                                                                              | The request carries no constraints, so no restriction reaches execution. Name it and give the reason; if a saved metric observes it, list that metric as "reported, not enforced". A rate over time needs an accumulating attribute first. Never fold it into the objective as a penalty. |
| `limit` across several levers ("at most 12 staff across both shifts")                            | `unsupported`                                                                                                                    | Constraints between parameters cannot be carried by the request.                                                                                                                                                                                                                          |
| A secondary `direction`, or a preference on a lever ("prefer the smaller value when equal")      | Fold into the objective metric code as a weighted term, or report as a separate metric                                           | Only for a genuinely soft preference; metric code can read net parameters. The weight is agent inference and must be declared with its basis. Never use this for a `threshold`.                                                                                                           |
| What the result must not claim, from claims on the `purpose`                                     | Proposal text                                                                                                                    | No request field. It belongs in the summary the USER reads beside the settings.                                                                                                                                                                                                           |

## Mandatory declarations

Every proposal carries, in `declarations`:

- the unit and conversion for each numeric field (`min`, `max`, `dt`, `maxTime`, fixed values);
- for each metric, whether it is last-frame, accumulated or peak, and whether it is the objective or "reported, not enforced";
- for each chosen budget number (`runCount`, `steps`, `runsPerStep`, `seed`), that it is agent inference and what it respects;
- what the result must not claim, in the USER's words.

Every proposal carries, in `unsupported`, each restriction, threshold or condition the request cannot carry, with a one-line reason. Set `blocksRun: true` for a hard or load-bearing restriction; omission also blocks Run. Set `blocksRun: false` only when the USER explicitly accepts a reporting-only exploration; do not claim that acceptance is mechanically verified. A reporting metric does not itself authorize running. An empty list means the USER stated no restriction, not that restrictions are enforced.

Disclose which choices are inference in `declarations`.

## The proposal and the tool

When ready, do two things in one turn, in this order:

1. Say one short sentence in the USER's vocabulary naming what varies, over what range and unit, under which saved scenario, what is minimized or maximized, and anything load-bearing that is not carried. In typology terms: "I have enough to test the tunable-count decision: vary the count from 3 to 9 units under the named regime and minimize the last-frame delay measure over the eight-unit horizon. The hard stock limit of 200 tokens is not enforced by the run; peak stock is reported beside the result." Replace those typology terms with the USER's vocabulary in the actual proposal.
2. Call `draft_petrinaut_experiment` once, as the `petrinaut` skill's experiment reference describes.

If a load-bearing restriction lands in `unsupported`, state that gap in the sentence before the tool call and explain that Run is blocked. Do not tell the USER to press Run while a blocking restriction remains. If they explicitly accept a reporting-only exploration, redraft without claiming the restriction is enforced.

## Once, not repeatedly

Propose when readiness is first reached, or when the meaningful configuration later changes: the decision, the objective metric or its direction, a tunable's identity or range, the scenario, the horizon, or the unsupported list. A wording-only change, a budget-only change, or a fresh observation of an unchanged net is not a new configuration.

Treat an explicit "do not run" stated in the conversation as authoritative until the USER reopens the question. Do not apply a winning configuration to the model on your own; the USER decides what to do with the result.

## Refusals

- Never propose from structure alone or infer the objective from the net.
- Never propose on a range, unit, threshold, horizon or objective the USER has not stated or confirmed; a stand-in parameter's placeholder value is not a stated range. Construct missing prerequisites first and ask for missing facts.
- Never encode a hard restriction as an objective penalty.
- Never claim a restriction is enforced; the request carries none.
- Never call `draft_petrinaut_experiment` as a way to run, or describe a drafted proposal as saved, running or applied.
