# Project coordination

This is the cross-map coordination surface for the `brunch-agent` project. FE-1383 owns the
milestone-one harness build; FE-1357 owns the September demo and process-model plugin design.
Linear is canonical for issue state, parentage, and hard `blocks` relations. This file owns
only the judgment Linear cannot express: the current project-wide recommendation, soft edges,
unresolved seams, and exceptional roots.

Before revising the recommendation, run
`turbo run linear:graph --filter '@hashintel/brunch-agent'`. Its compact projection supplies the
factual open-issue DAG; read the relevant issue bodies for semantic content, then infer the smallest
honest recommendation. Do not paste the generated graph here or mirror issue status.

## Current sequencing recommendation

As of **2026-08-21**, the FE-1437 authority cutover has been executed: the full brunch-lite
history is imported on `ln/fe-1437-hash-monorepo-import` in `hashintel/hash` (frozen standalone
SHA `43a0022918861846344b96a32cb94f92e2ee96ae`), every import gate re-verified. `hashintel/hash`
is authoritative; the standalone repository accepts no further implementation work. FE-1437
closes when the branch lands on `main` (squash merge, per convention). Part of FE-1440's website
wiring (the Brunch interactive-tool panel in `apps/petrinaut-website`) travelled with the import
branch; FE-1440 was trimmed on 2026-08-21 to the remaining mode wiring (mode switch, browser
identifier bootstrap, remote transport swap). After landing, advance FE-1438 (client-tool round-trip)
beside FE-1393 (plugin SDK and first projection); FE-1439 (private durable sessions) proceeds in
parallel. The integration stream joins at FE-1440 and deployment follows at FE-1441 (which also
waits on FE-1423's pre-exposure gates), while the harness stream reaches its contract-freeze
decision at FE-1387. FE-1402/FE-1403 form a parallel content/evaluation stream, without
displacing the two convergence edges.

```text
legend:
  -[hard]->       native Linear blocker
  -[coord]->      either order; do not implement concurrently
  -[input]->      semantic input, not a blocker
  -[state-gate]-> condition in the world, not an issue edge

nodes:
  FE-1437 [executed, landing]      # history imported; HASH authoritative; PR pending
  FE-1438 [next]                   # client-tool round-trip
  FE-1439 [next, parallel]         # private durable sessions
  FE-1440 [join, partly landed]    # website elicitor mode; panel wiring on import branch
  FE-1441 [post-landing]           # HASH deployment
  FE-1393 [next]                   # plugin SDK + first projection
  FE-1387 [after-FE-1393]          # second pack + contract freeze
  FE-1395 [coordination]           # full affordance set
  FE-1402 [parallel, content]      # completion contract
  FE-1403 [parallel, content]      # interviewing guidance
  FE-1404 [after-content]          # armed baseline

edges:
  FE-1449                 -[hard]->       FE-1438
  FE-1392                 -[hard]->       FE-1393
  FE-1438, FE-1439,
  FE-1437                 -[hard]->       FE-1440
  FE-1437, FE-1439,
  FE-1423                 -[hard]->       FE-1441
  FE-1393                 -[hard]->       FE-1387
  FE-1402, FE-1403        -[hard]->       FE-1404
  FE-1395                 -[coord]->      FE-1438
  FE-1437 branch on main  -[state-gate]-> FE-1438, FE-1439, FE-1393
  FE-1387                 -[input]->      FE-1440
```

Hard-edge truth remains in Linear. The graph above is a deliberately focused recommendation,
not a second issue database.

## Repository handoff threshold

FE-1437 (the monorepo import; [execution plan](./hash-monorepo-import-plan.md)) was the authority
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
