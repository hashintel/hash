# Project coordination

This is the cross-map coordination surface for the `brunch-agent` project. FE-1383 owns the
milestone-one harness build; FE-1357 owns the September demo and process-model plugin design.
Linear is canonical for issue state, parentage, and hard `blocks` relations. This file owns
only the judgment Linear cannot express: the current project-wide recommendation, soft edges,
unresolved seams, and exceptional roots.

Before revising the recommendation, run `bun run linear:graph`. Its compact projection supplies
the factual open-issue DAG; read the relevant issue bodies for semantic content, then infer the
smallest honest recommendation. Do not paste the generated graph here or mirror issue status.

## Current sequencing recommendation

As of **2026-08-20**, land the current review range through FE-1464. That closes the structured-ask
and durable-settlement proofs (FE-1449 and FE-1392), the final review remediation (FE-1464), settles
the FE-1405 payload-interior design, lands both import-gating spike verdicts (FE-1434 and FE-1435),
and satisfies FE-1437's review-stack state gate. Then perform the FE-1437 authority cutover before opening new implementation work in
this standalone repository. After the cutover, advance FE-1438 (client-tool round-trip) beside
FE-1393 (plugin SDK and first projection); FE-1439 (private durable sessions) can proceed in
parallel. The integration stream joins at FE-1440, while the harness stream reaches its
contract-freeze decision at FE-1387. FE-1402/FE-1403 form a parallel content/evaluation stream
once FE-1405 lands, without displacing the cutover or the two convergence edges.

```text
legend:
  -[hard]->       native Linear blocker
  -[coord]->      either order; do not implement concurrently
  -[input]->      semantic input, not a blocker
  -[state-gate]-> condition in the world, not an issue edge

nodes:
  review-stack [now]               # land the current range through FE-1464
  FE-1449 [in-review-range]        # structured ask: real-panel convergence proof
  FE-1464 [in-review-range]        # final review remediation before repository handoff
  FE-1392 [in-review-range]        # settlement: durable-capture convergence proof
  FE-1405 [in-review-range]        # payload-interior decision already deposited
  FE-1434 [in-review-range]        # client-tool suspension spike
  FE-1435 [in-review-range]        # real-panel stream spike
  FE-1437 [next, cutover]          # import history; HASH becomes authoritative
  FE-1438 [post-cutover]           # client-tool round-trip
  FE-1439 [post-cutover, parallel] # private durable sessions
  FE-1440 [join]                   # website elicitor mode
  FE-1441 [post-import]            # HASH deployment
  FE-1393 [post-cutover]           # plugin SDK + first projection
  FE-1387 [after-FE-1393]          # second pack + contract freeze
  FE-1395 [coordination]           # full affordance set
  FE-1402 [parallel, content]      # completion contract
  FE-1403 [parallel, content]      # interviewing guidance
  FE-1404 [after-content]          # armed baseline

edges:
  FE-1449                 -[hard]->       FE-1438
  FE-1392                 -[hard]->       FE-1393
  FE-1434, FE-1435        -[hard]->       FE-1437
  FE-1438, FE-1439,
  FE-1437                 -[hard]->       FE-1440
  FE-1437, FE-1439        -[hard]->       FE-1441
  FE-1393                 -[hard]->       FE-1387
  FE-1405                 -[hard]->       FE-1402, FE-1403
  FE-1402, FE-1403        -[hard]->       FE-1404
  FE-1395                 -[coord]->      FE-1438
  review-stack            -[state-gate]-> FE-1437
  FE-1387                 -[input]->      FE-1440
```

Hard-edge truth remains in Linear. The graph above is a deliberately focused recommendation,
not a second issue database.

## Repository handoff threshold

FE-1437 (the monorepo import; [execution plan](./hash-monorepo-import-plan.md)) is the authority
cutover, not a general freeze on harness work:

```text
brunch-lite authoritative
  FE-1434 + FE-1435 verdicts landed
  FE-1388/1389/1390/1399 review stack merged
                    |
                    v
          == FE-1437 import ==
                    |
                    v
hashintel/hash authoritative
  FE-1440 website wiring + FE-1441 deployment
```

FE-1438 (client-tool round-trip) and FE-1439 (private durable sessions) are not import gates. They
may land here and travel with the history import; if unfinished when FE-1437 starts, continue them
only in `hashintel/hash`. Do not run both repositories as writable authorities after the cutover.

## Open seams

- **Contract freeze — FE-1387.** The process-model target must stress the plugin contract before
  it freezes. FE-1393 makes the contract programmable; FE-1387 remains the cross-map hinge.
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

These project issues intentionally have no parent and are roots under the registry rule:

- **FE-1331 — start elicitation from Petrinaut's create-new-net flow.** Deferred post-September
  consumer topology; returns after in-Petrinaut staging proves itself.
- **FE-1334 — offer the user a surprising scenario of their model.** A validation gesture with
  no owning map yet; closest to the motif/quiver strategy work.
- **FE-1406 — design reusable elicitation strategies.** The cross-map home for the
  harness-shipped generic strategy quiver; intentionally independent of either delivery map.
