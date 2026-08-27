# Mission

The current objective, its acceptance proof, and the stop conditions. This is the one mutable
"what now" record; a specific branch's mission contract lives on that branch.

## Objective

Construct and review-and-revise, in that order; cold-start construction must be possible.

## Acceptance proof

A human conducts a real construct elicitation through the production Brunch server and the
Petrinaut assistant panel; captures persist to a target document owned by a principal and survive
reload; completion accounting is human-readable; every turn records time per purpose. Then a
bounded review-and-revise pass: open an existing source-grounded model, trace one element to its
source utterance, correct it in a few turns, and see a provenance-preserving net delta.

## Stop or replan

- A first question takes longer than the provisional target after the latency instrumentation
  lands.
- Persistence needs a schema the harness must know.
- The panel needs Brunch-specific code inside `@hashintel/petrinaut`.
- An arc ends with only desk, simulated, or evaluation-side output and no production-path code
  changed.

## Deferred

The harness-teaching layer (the plugin schema/repertoire machinery of ADR-0007/0008) is excluded
from the first post-reorientation branches; re-include it later in minimum-viable forms as a real
throughline demands.
