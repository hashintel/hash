# Experiments

The experiment request, its limits, and what the draft and run tools do. Whether an experiment is ready, and which stated condition fills which field, is the `modelling` skill's concern.

## The request

`PetrinautExperimentRequest` is the draft tool's `experiment` input and `createExperiment`'s input. Take every identifier in it from a current read of the net; never compose one from names.

| Field                                 | Takes                                                                                               | Limits                                                                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarioId`                          | a saved scenario from `definition.scenarios[]`                                                      | Must already exist; never invent one in the request.                                                                                                                                                                          |
| `scenarioParameterValues[identifier]` | `{ mode: "range", min, max }` or `{ mode: "fixed", value }` on a saved scenario parameter           | The sweep domain follows the parameter's declared `type`: `integer` or `real`, or `ratio` with a range within 0–1. A `boolean` parameter rejects ranges.                                                                      |
| `execution`                           | `{ mode: "simulate" }`, or `{ mode: "optimize", objectiveMetricId, direction, steps, runsPerStep }` | Simulation requires every scenario parameter fixed. Optimization requires at least one range; it reads the objective metric's last-frame mean over the runs in a step, with `steps ≤ 100` and `steps × runsPerStep ≤ 10,000`. |
| `metricIds`                           | saved metrics from `definition.metrics[]`                                                           | At most 20. When optimizing, must include the objective metric.                                                                                                                                                               |
| `maxTime`, `dt`                       | simulation time units                                                                               | `dt ≤ maxTime` and `maxTime / dt ≤ 1,000,000`; integer divisibility is not required.                                                                                                                                          |
| `runCount`, `seed`                    | run count and random seed                                                                           | `runsPerStep ≤ runCount`.                                                                                                                                                                                                     |

The request carries no units and no constraints or constraint policy, so no restriction reaches execution. Saved scenario and metric code is compiled when the experiment is created, not by getNetCompilationErrors.

## Size

A run takes `maxTime / dt` steps. A simulation makes `runCount` runs; an optimization makes `steps × runsPerStep`. Choose `dt` as coarse as the fastest change the metrics depend on allows, not as fine as possible: a level read every five minutes needs steps of about a minute, not hundredths. Compare named options as separate `simulate` requests with fixed values, and optimize only when the USER wants the best setting of a lever over a range.

## Drafting

Call `draft_petrinaut_experiment` once with `{ experiment, declarations, unsupported }`. If an `unsupported` entry names a `reportedByMetricId`, include that metric in `experiment.metricIds`. The host finds the latest read of the net in the conversation; do not put a basis table, locator, hash, revision or observation call ID in the input.

The tool drafts a proposal in this editor's memory and returns `{ status, summary, diagnostics }`. It does not run anything, save anything with the document or navigate. Say "drafted for review, not run", not "added to the model". A redraft supersedes the earlier card. If `status` is `invalid`, repair from the diagnostics against a fresh read and redraft; do not ask the USER to fix identifiers.

The USER runs a drafted proposal from the card's Run action. Approval of a draft in conversation is not a request to execute it: point them to the card. Run and Dismiss happen later in the card and are not reported to the conversation, nor is eventual completion, so do not infer any of those events or describe them as observed.

## Running

Call `createExperiment` instead of drafting only when the USER explicitly asks to run now. It carries no restrictions either, so first name each restriction or threshold they stated that the run will not enforce.

`createExperiment` holds the turn until every run finishes, and nothing stops it early, so keep a direct run small: roughly 20,000 steps in total across its runs. A larger study is a draft, which the USER runs from its card.

Never open or pre-fill the experiment creation drawer, or return manual set-up instructions in place of a tool call.
