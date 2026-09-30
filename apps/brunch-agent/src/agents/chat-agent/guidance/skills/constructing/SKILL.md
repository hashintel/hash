---
name: constructing
description: Constructs, revises, checks and delivers Petrinaut SDCPNs from an operational account. Use before any net mutation, net revision, construction-led analysis, experiment proposal or net delivery.
---

# Constructing the operational model

Consume the attributed operational account without manufacturing source facts. Construction and elicitation recur together: build from available meaning, expose representation choices, and revise as the account changes.

## Construct

Read `references/pn-construction.md` and `references/checks.md` before first construction. Use mounted canonical Petrinaut tools for every net change; never emit free-form net JSON. If those tools are absent, limit the result to the recoverable account and construction Notes.

Start when an activity and what it changes are available, normally in the first exchanges. Sketch the breadth already described rather than only the current detailed thread. Missing facts use visible stand-ins; they do not postpone construction. Conflicting accounts remain represented as unresolved rather than silently selected. An explicit request for sensible defaults authorizes purpose-bounded agent choices, still labelled as such.

After meaning-bearing input, extend or reshape the net to carry it, or make no mutation when it already does. Treat the net as a draft: revise types and elements and remove superseded structure when new meaning no longer fits. Preserve unrelated structure at the level actually inspected.

Record consequential stand-ins, inferences, defaults, approximations, revisions and target losses as construction Notes with the supplied meaning and Note ids they rest on, plus what the choice affects and how it could be checked. Construction Notes may preserve useful correspondence; they are neither operational facts nor a mandatory queue of questions.

## Execute efficiently

For one bounded connected fragment, submit independent canonical mutations as parallel calls in one step, ordered by dependency: types, parameters and differential equations; then places and transitions; then arcs. Use the last result's `netAfterChanges` rather than rereading.

After the step that writes code, call `getNetCompilationErrors` once for the fragment. Submit every requested repair in one further step. Read again only for code or fields omitted by `netAfterChanges`, before a live explanation, and at delivery. On failure or no-op, inspect the result and current state, then submit only the correction; do not replay successful changes.

The mounted schemas govern exact payloads. Choose IDs for new elements so a fragment can be created in one step; references to existing elements and experiment inputs use observed identifiers, never IDs guessed from names. Required coordinates are provisional layout only. Arc multiplicities are not probabilities. Existing endpoints are observed, not invented. Say construction changed only after successful tool evidence.

## Check correspondence

Apply `references/checks.md` to every changed fragment and before delivery. Compare the inspected net with the account: supported meaning is present, stand-ins are visible, contextual quantities remain contextual, consumed/reserved/read distinctions and resource release survive, and changed rules reshaped incompatible structure.

Keep evidence levels separate:

1. tool-schema acceptance of exact calls and inspected structure;
2. agent-reviewed structural correspondence with the account; and
3. observed behaviour from a named simulation or stronger analysis with its scenario and scope.

A lower level never implies a higher one. A compilation diagnostic does not prove scenario or metric code, reachability, conservation, semantic fidelity or behaviour.

## Prepare experiments

When the person states a decision the model should answer, or changes its measure, direction, tunable quantity/range or regime, read `references/experiment-configuration.md`. Early purpose, levers and protected conditions are operational meaning; they are not experiment readiness.

Readiness requires both the stated decision configuration and current executable counterparts described in that reference. Construct missing net prerequisites; ask only for missing source facts. Parameters and metrics alone never trigger a proposal. Hard restrictions remain distinct from soft objectives, and unsupported enforcement is disclosed rather than encoded as a penalty.

Draft at most once per meaningful configuration through the mounted draft tool. A draft is for review: it is not saved with the document, run, approved, completed or applied. The person controls Run and any later use of results.

## Deliver or continue

Use the current Ledger and inspect the current net before delivery. State the intended purpose; whether the account is sufficient or partial; whether construction was absent, blocked, partial or tool-schema accepted; whether structural review occurred; whether behaviour is untested or observed under a named analysis; agent-authored assumptions and simplifications; unresolved conflicts and gaps; target/tooling losses; and the smallest evidence that would change the result.

An explicit stop opens no new topic. Deliver useful partial work and any already-checked fragment. In an unbound conversation, explain the construction that the account supports and the missing capability or fact, without claiming a mutation, check or draft occurred.

## Resources

Read resources directly from this skill's advertised packaged-resource paths. Relative names here are labels, not includes. Do not follow Markdown references recursively.
