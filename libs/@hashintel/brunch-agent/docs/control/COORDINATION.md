# Project coordination

This is the cross-map coordination surface for the `brunch-agent` project. FE-1383 owns the
milestone-one harness build; FE-1357 owns the September demo and process-model plugin design.
Linear is canonical for issue state, parentage, and hard `blocks` relations. The
[steering model](STEERING.md) chooses the current objective, proof frontiers, and cuts under
pressure. This file projects that strategy onto mechanically available work: the current
project-wide recommendation, soft edges, unresolved seams, and exceptional roots.

Before revising the recommendation, run
`turbo run linear:graph --filter '@hashintel/brunch-agent'`. Its compact projection supplies the
factual open-issue DAG; read the relevant issue bodies for semantic content, then infer the smallest
honest recommendation. Do not paste the generated graph here or mirror issue status.

## Current sequencing recommendation

As of **2026-08-24**, FE-1476 (the September demo delivery) changes the recommendation from generic
package completion to a concrete CPS review-and-revise proof. FE-1437 crossed the authority
threshold in this branch and is Ready for review; the work remains gated until the branch reaches
`main`. Then open two fronts in parallel. The semantic front starts FE-1482 (the CPS plugin) against
one worked fixture and settles FE-1480's requirements-model-to-SDCPN authority boundary before it
implements a projector; FE-1478 (net-to-requirements provenance) is part of that spine from its
first types. The experience front advances FE-1438 (machine client-tool round-trip) and FE-1439
(private sessions) far enough for a new reviewer conversation to target an existing document,
while FE-1477/FE-1440 share one provider-routing implementation. Join the fronts at FE-1479
(targeted re-elicitation), then drive the same path through FE-1423's pre-exposure gates and FE-1441
deployment.

FE-1393's generic Gherkin artifact and FE-1387's second-target contract freeze no longer gate the
September proof. FE-1402, FE-1403, FE-1406, and FE-1431 supply only the completion, guidance,
strategy, and contract slices the CPS `review-and-revise` runbook consumes. FE-1481 selects
YAML/Markdown export as the requirements-model inspection floor; broad UI follows only if the
closed loop is already proved.

```text
legend:
  -[hard]->       native Linear blocker
  -[coord]->      either order; do not implement concurrently
  -[input]->      semantic input, not a blocker
  -[state-gate]-> condition in the world, not an issue edge

nodes:
  FE-1437 [executed, landing]      # history imported; HASH authoritative; PR pending
  FE-1476 [objective]              # September reviewer demo
  FE-1482 [next, semantic]         # concrete CPS plugin + review/revise runbook
  FE-1480 [decision, semantic]     # model/projection authority, then projector
  FE-1478 [semantic proof]         # provenance through all three registers
  FE-1438 [next, experience]       # machine client-tool round-trip + application
  FE-1439 [next, experience]       # existing-target reviewer session ownership
  FE-1477/FE-1440 [experience]     # one provider-routing implementation
  FE-1479 [join]                   # targeted correction changes the live net
  FE-1481 [fallback]               # structured model export before UI
  FE-1441 [deployed proof]         # HASH deployment

edges:
  FE-1449                 -[hard]->       FE-1438
  FE-1438, FE-1439,
  FE-1437                 -[hard]->       FE-1440
  FE-1437, FE-1439,
  FE-1423                 -[hard]->       FE-1441
  FE-1437 branch on main  -[state-gate]-> FE-1438, FE-1439
  FE-1480 decision        -[input]->      FE-1482, FE-1478
  FE-1402, FE-1403,
  FE-1406, FE-1431        -[input]->      FE-1482
  FE-1482, FE-1478,
  FE-1438, FE-1439        -[input]->      FE-1479
  FE-1479, FE-1440        -[input]->      FE-1441
```

Hard-edge truth remains in Linear. The graph above is a deliberately focused recommendation,
not a second issue database.

## Repository handoff threshold

FE-1437 (the monorepo import; [execution plan](../archive/migrations/hash-monorepo-import-plan.md)) was the authority
cutover, not a general freeze on harness work. It was crossed on 2026-08-21:

```text
brunch-lite authoritative (until 2026-08-21)
  FE-1434 + FE-1435 verdicts landed
  FE-1388/1389/1390/1399 review stack merged
                    |
                    v
      == FE-1437 import (executed) ==
                    |
                    v
hashintel/hash authoritative (now)
  FE-1440 website wiring + FE-1441 deployment
```

The standalone repository is frozen at SHA `43a0022918861846344b96a32cb94f92e2ee96ae` and is
read-only reference material. All further work — including FE-1438 and FE-1439, which were not
import gates — happens in `hashintel/hash`. Do not run both repositories as writable authorities.
Closing out the standalone repository's shared state (archival, access) is deferred and requires
explicit approval from Lu.

## Open seams

- **Projection authority — FE-1480.** The ticket assumes non-deterministic LLM inference from the
  requirements model to SDCPN, while ADR-0003 requires write-time-only semantic inference and a
  pure projection. A worked CPS transformation must assign every judgment to capture, fold,
  projection, or document application before the interface freezes.
- **Controller and runbook.** The harness does not read the folded model or open issues back into
  the agent, and no plugin defines a job trajectory or stopping rule. FE-1482 must exercise the
  narrow `review-and-revise` loop; FE-1406 and FE-1402/FE-1403 are inputs, not parallel products.
- **Reviewer target identity — FE-1439 × FE-1479.** The current host derives target-document
  identity from conversation identity. September requires a new reviewer conversation against an
  existing target without weakening owner isolation.
- **Contract freeze — FE-1387.** The CPS target must stress the plugin contract before it freezes.
  The freeze follows the September semantic proof rather than gating it.
- **Absence locator.** An absence capture carries no payload, but the fold needs a field-specific
  coordinate (anchor × slot). The plugin-contract spec records three worked cases; any envelope
  amendment belongs to the harness side of this seam.
- **Structured-tap evidence — FE-1395 × capture store.** `resolve-conflict` currently rejects
  `user-affordance-payload` evidence. FE-1395 must decide the transport fact before the store
  rule can settle.
- **Guidance placement — FE-1403 × FE-1406.** Plugin cards and the harness-shipped generic
  strategy quiver share authoring methods but not ownership. Packages export; hosts register.
- **Telemetry vocabulary — FE-1385 × FE-1404 × FE-1423.** The probe surface, experiment
  accounting, and remote telemetry should share span vocabulary rather than invent it three
  times.
- **Living-prototype charter.** The deployed elicitor as a cumulative record of proved and
  unproved behavior remains pre-charter until the infrastructure conversation settles.

Settled seam decisions still governing open work: FE-1392 established the plugin-declared
verbatim proposal floor, and ask accounting remains a read-time relation rather than an envelope
field. ADR-0003 keeps field-level structure below the capture's single epistemic status.

## Exceptional roots

These project issues currently have no parent. Some are intentional roots; the temporary or
unresolved roots are named here until their Linear parentage is settled:

- **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** ADR-0004 un-deferred this as
  September topology, while FE-1476's new reviewer scenario starts from an existing target. Keep
  the conflict visible until Dora confirms the use case and the ADR is amended if necessary.
- **FE-1334 — offer the user a surprising scenario of their model.** A validation gesture with
  no owning map yet; closest to the motif/quiver strategy work.
- **FE-1406 — design reusable elicitation strategies.** The cross-map home for the
  harness-shipped generic strategy quiver; intentionally independent of either delivery map.
- **FE-1472 — evaluate the nested Anthropic SDK pin.** Unrelated triage root; no owning delivery
  map has been chosen.
- **FE-1476 — prepare the September demo.** Temporary delivery root pending the recommended fold
  under FE-1357.
- **FE-1477 through FE-1482 — September outcome slices.** PM-authored issues adopted by the
  steering model but not yet folded in Linear. The recommended parent is FE-1476; overlaps and
  ownership boundaries are recorded in STEERING's issue projection before external mutation.
