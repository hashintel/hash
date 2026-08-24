# Brunch steering

This is Brunch's one mutable current strategic control. Linear owns issue facts;
[specifications](../specs/), [ADRs](../adr/), and [the ledger](SPEC-LEDGER.md) own their truths.

## Objective and acceptance proof

Prove a bounded CPS **review-and-revise** loop through the production Brunch and Petrinaut path:
a reviewer opens an existing source-grounded model and net, traces one element to the source
utterance, corrects it in three to five turns, and sees a provenance-preserving net delta handed to
the optimisation flow. This is the current proof, not a permanent product-scope decision.

Acceptance is one screen-recordable deployed run, surviving reload, through the real HTTP handler,
session binding, sweep, fold, pure projection, client-tool application, and optimisation handoff.
The changed element traces to a sweep-produced superseding capture while an unrelated region stays
stable. Preserve runnable and legibility evidence under [proof evidence](../evidence/proofs/).

Governing strategic decisions: [S-001](STRATEGY-LOG.md#s-001),
[S-002](STRATEGY-LOG.md#s-002), and [S-003](STRATEGY-LOG.md#s-003).

## Execution tree

```text
now
├─ semantic: FE-1482 CPS slice + FE-1480 authority decision + FE-1478 provenance
│  gap: worked capture -> model -> SDCPN transformation and production model/issues read path
└─ reviewer: FE-1438 client-tool return + FE-1439 existing-target session
   gap: narrow review-and-revise controller/runbook on the real Petrinaut route
join
└─ FE-1479 targeted correction: reviewer utterance -> sweep -> supersession -> stable scoped delta
next
└─ FE-1477/FE-1440 provider routing -> FE-1423 exposure gates -> FE-1441 deployment
   gap: clean-browser rehearsal and optimisation handoff
```

### Active soft edges

- FE-1480 inputs FE-1482/FE-1478; semantic and reviewer lanes join only at FE-1479.
- FE-1477 and FE-1440 share one routing implementation.
- FE-1402/FE-1403/FE-1406/FE-1431 input FE-1482 only when its CPS slice consumes them.
- FE-1395's structured-tap transport fact inputs the capture-store evidence rule.
- FE-1385/FE-1404/FE-1423 share telemetry vocabulary before FE-1423's exposure gate.
- The living-prototype charter waits on the infrastructure conversation.
- The unresolved absence locator is a fold-table coordinate owned here; its cases and obligation
  remain in [the plugin contract](../specs/plugin-contract.md#epistemic-anatomy).

The read-only Linear graph supplies mechanical availability, never priority.

## Active gates

| Gate | Owner / source | Watch trigger | Last checked | Consequence |
| --- | --- | --- | --- | --- |
| FE-1480 register authority unresolved | FE-1480; [ADR-0003](../adr/0003-three-register-ir.md) | Worked transformation assigns every judgment. | 2026-08-24 | Do not freeze projector/contract; record semantics earlier or revisit ADR. |
| Final use case outstanding | Dora; FE-1476 / September Plan | Dora confirms or changes it. | 2026-08-24 | If creation is required, activate cold-start and reconcile ADR-0004/proof. |
| Truck-fleet dossier unavailable | Unknown; FE-1357 names its ref/path. | Ref appears or replacement selected. | 2026-08-24 | Claim no provenance; use reviewed replacement. |

## Decision-relevant beliefs and unknowns

| Belief or unknown | Confidence / evidence | Cheapest probe |
| --- | --- | --- |
| CPS establishes the minimum plugin contract. | Medium-high; Gherkin under-stresses it. | Implement one FE-1480 transformation. |
| Register 2 supports pure projection. | Low-medium; ADR-0003 says so, FE-1480 disputes it. | Assign each judgment; expose residue. |
| Five turns yield a scoped correction. | Low; unrehearsed. | Run two bounded rehearsals. |
| Ask carries durable client-tool results. | Medium-low; machine results refused today. | Run one correlated FE-1438 round trip. |
| Structured export explains provenance/delta. | Medium; FE-1481 permits it. | Witness one rehearsal. |

## Sequencing cuts

- Cold-start does not gate review-and-revise ([S-001](STRATEGY-LOG.md#s-001)).
- CPS precedes FE-1387's generic freeze; Gherkin completion does not gate it
  ([S-002](STRATEGY-LOG.md#s-002)).
- Defer broad UI/ontology/gallery/affordances/voice/scenarios/telemetry until the loop closes.
- Fixtures supply domain state, never product wiring; provenance and the real entrypoint are gates.

## Stop or replan

- Dora requires cold-start creation.
- FE-1480 exposes unavoidable read-time semantic inference.
- Two rehearsals fail the five-turn correction.
- FE-1438 loses correlation, durability, or evidence semantics.
- Production remains undeployable after FE-1479; seek a demo-surface decision, not test wiring.

## Exceptional roots

- **FE-1331** — create-new-net entry; keep exceptional until the watched use-case decision settles
  whether it joins the cold-start lane or receives a parent.
- **FE-1334** — surprising-scenario validation gesture; parent or cancel when its owning outcome is
  chosen.
- **FE-1406** — intentional cross-map root for the harness strategy quiver.
- **FE-1472** — unrelated SDK-pin triage; assign an owning map or remove from the project.
- **FE-1476** — September delivery root; intended parent is FE-1357.
- **FE-1477–FE-1482** — PM-authored outcome roots; intended parent is FE-1476 after overlap review
  and separately approved Linear mutation.
