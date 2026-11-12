# Experiments

The experiment request, its limits, and when to run one. Whether an experiment is ready, and which stated condition fills which field, is the `modelling` skill's concern.

## The request

`PetrinautExperimentRequest` is `petrinaut_create_experiment`'s input, beside `editor_id`. Take every identifier in it from a current read of the net; never compose one from names.

| Field                                 | Takes                                                                                               | Limits                                                                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarioId`                          | a saved scenario from `definition.scenarios[]`                                                      | Must already exist; never invent one in the request.                                                                                                                                                                          |
| `scenarioParameterValues[identifier]` | `{ mode: "range", min, max }` or `{ mode: "fixed", value }` on a saved scenario parameter           | The sweep domain follows the parameter's declared `type`: `integer` or `real`, or `ratio` with a range within 0–1. A `boolean` parameter rejects ranges.                                                                      |
| `execution`                           | `{ mode: "simulate" }`, or `{ mode: "optimize", objectiveMetricId, direction, steps, runsPerStep }` | Simulation requires every scenario parameter fixed. Optimization requires at least one range; it reads the objective metric's last-frame mean over the runs in a step, with `steps ≤ 100` and `steps × runsPerStep ≤ 10,000`. |
| `metricIds`                           | saved metrics from `definition.metrics[]`                                                           | At most 20. When optimizing, must include the objective metric.                                                                                                                                                               |
| `maxTime`, `dt`                       | simulation time units                                                                               | `dt ≤ maxTime` and `maxTime / dt ≤ 1,000,000`; integer divisibility is not required.                                                                                                                                          |
| `runCount`, `seed`                    | run count and random seed                                                                           | `runsPerStep ≤ runCount`.                                                                                                                                                                                                     |

The request carries no units and no constraints or constraint policy, so no restriction reaches execution. Saved scenario and metric code is compiled when the experiment is created, not by `petrinaut_get_diagnostics`.

## Size

A run takes `maxTime / dt` steps. A simulation makes `runCount` runs; an optimization makes `steps × runsPerStep`. Choose `dt` as coarse as the fastest change the metrics depend on allows, not as fine as possible: a level read every five minutes needs steps of about a minute, not hundredths. Compare named options as separate `simulate` requests with fixed values, and optimize only when the USER wants the best setting of a lever over a range.

## Proposing and running

Propose the experiment in the conversation first: the scenario, the metrics, the runs (how many, how long, at what step), and each restriction or threshold the USER stated that the run will not enforce, since the request carries none. Call `petrinaut_create_experiment` only once the USER agrees to that proposal in the conversation, and after the net changes it depends on.

`petrinaut_create_experiment` creates the experiment and runs it at once; there is no draft to review. It holds the turn until every run finishes, and nothing stops it early, so keep a run small: roughly 20,000 steps in total across its runs. For a larger study, describe its set-up (scenario, parameter values or ranges, metrics, runs, `dt` and `maxTime`) for the USER to run in Petrinaut's experiments view, and say that it was not run.

Its result reports each metric over the runs. Report what it shows as a run of the model, not as evidence about the system.
