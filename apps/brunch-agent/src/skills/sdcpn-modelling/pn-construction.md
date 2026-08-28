# PN construction

provenance: sdcpn

Read this only when constructing or checking a net. Consume the filled runbook IR. Do not treat the transcript as the primary model.

## Mapping principles

- Things that wait, hold, or are available become places.
- Things that happen become transitions.
- Order, branching, and triggers become arcs and, where needed, guards.
- A type of thing the process treats differently may become a colour; only when the IR says the distinction changes what happens.
- Continuous change while nothing discrete happens may become dynamics on a place.
- Shared resources become tokens that are reserved and released, not consumed for good, unless the IR says they are used up.

Missing canvas positions are acceptable. Prefer a net the parser accepts over a pretty layout.

The `pn-json` object must be a Petrinaut SDCPN file, not a generic Petri-net sketch. Required fields:

```json
{
  "title": "Example",
  "places": [
    {
      "id": "p_waiting",
      "name": "Waiting",
      "colorId": null,
      "dynamicsEnabled": false,
      "differentialEquationId": null
    }
  ],
  "transitions": [
    {
      "id": "t_start",
      "name": "Start",
      "inputArcs": [{ "placeId": "p_waiting", "weight": 1 }],
      "outputArcs": [],
      "lambdaType": "predicate",
      "lambdaCode": "true",
      "transitionKernelCode": ""
    }
  ]
}
```

Do not emit `label`, `initial`, a top-level `arcs` array, `guards`, or `delays`. Places use `name`. Transitions use `name`, `inputArcs`, and `outputArcs`. Optional `types`, `parameters`, and `differentialEquations` arrays may be omitted.

Name every inference. If the IR does not support a place, transition, or arc, do not invent a silent default — omit it and list the loss, or mark the default in the delivery.

## Reusable construction patterns

### Timed work

When the IR records a step that occupies time:

1. A start transition that may sample duration onto a token field.
2. An in-progress place (dynamics may count down remaining time).
3. A done transition that waits until remaining time is gone.

If the IR only has a typical duration and no tail, keep a constant or a named parameter and say so.

### Branching or probabilistic outcome

A start that records a sampled or decided outcome; then two (or more) completions with exclusive conditions. If the IR has no rate, do not invent 50/50 — use a named parameter or omit the probability and list the loss.

### Contended resource

A place holding the free instances. The work's start consumes (reserves) one; the work's end returns it, possibly worn. The practiced contention rule becomes a guard or a priority if the IR stated one; otherwise name the missing rule as a loss.

### Threshold trigger

A place carrying the quantity; a transition that fires when the IR's observable is crossed; another that resets it if the IR named a reset. If nothing is triggered, do not add a floating continuous variable.

### Mode change

A transition between two availability or setup places. Put directional loss on that transition if the IR recorded it.

### Grouped movement

A formation transition that waits for a count or a clock; a place for the formed group; a split cost if the IR said splitting is expensive.

## Inference and approximation

Allowed if named:

- collapsing several named micro-steps into one transition when the objective does not depend on the internals;
- treating an unstated return of a reserved resource as "released as it arrived";
- using a parameter for an unknown rate.

Not allowed:

- filling an empty IR section from general knowledge of plants or logistics;
- averaging two conflicting accounts;
- turning "unknown" into a typical textbook distribution.

## Projection loss

The net cannot honestly hold: qualitative objectives without a metric, unwritten political weights, data bindings not yet connected, and any practiced rule whose condition the expert could not name. Keep those in the IR's loss section and mention them beside the `pn-json` block.

## Worked examples

Typology-shaped only.

**Timed work, no plant.** IR says "inspection takes about twenty minutes, sometimes an hour if the lab is backed up." Construction: start / in-progress / finish; duration a spread or a typical-plus-tail parameter; lab backup named as a contended resource if the IR recorded the lab, otherwise a loss.

**Contended crew.** IR says two jobs can want the same two-person crew, and when that happens one waits. Construction: a place with two tokens; both job-starts reserve; no invented priority if none was stated.
