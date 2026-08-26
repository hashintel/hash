# Brunch steering

This is Brunch's one mutable current strategic control. Linear owns issue facts;
[specifications](../specs/), [ADRs](../adr/), and [the ledger](SPEC-LEDGER.md) own their truths.

## Objective and acceptance proof

Prove a bounded CPS **review-and-revise** loop through the production Brunch and Petrinaut path:
a reviewer opens an existing source-grounded model and net, traces one element to the source
utterance, corrects it in three to five turns, and sees a provenance-preserving net delta handed to
the optimisation flow. This is the current proof, not a permanent product-scope decision.

Acceptance is one screen-recordable deployed run, surviving reload, through the real HTTP handler,
session binding, sweep, fold, deterministic projection scaffold, model-assisted client-tool
realization, compilation, and optimisation handoff. The changed element traces to a sweep-produced
superseding capture while an unrelated region stays stable. Preserve runnable and legibility
evidence under [proof evidence](../evidence/proofs/).

Governing strategic decisions: [S-001](STRATEGY-LOG.md#s-001),
[S-004](STRATEGY-LOG.md#s-004), [S-005](STRATEGY-LOG.md#s-005), and
[S-006](STRATEGY-LOG.md#s-006).

## Selected frontier: design convergence

**Claim:** the existing baseline evidence, elicitation research, and worked CPS payload are
sufficient to settle completion versus session stopping, targeted interview guidance, and reusable
strategy without new human or domain-expert input. Those results can then narrow FE-1431 to a
build-ready plugin-authoring contract before runtime implementation resumes.

The selected single-agent work order is below. Arrows express strategic order. Linear is canonical
for hard blockers and now encodes the three genuine prerequisite joins: FE-1407 blocks FE-1404,
FE-1404 blocks FE-1406, and FE-1406 blocks FE-1431. The other arrows remain soft ordering.

```text
design resolution
FE-1407 failure catalogue -> FE-1402 completion/stopping contract
-> FE-1403 CPS guidance -> FE-1404 condition-3 run
-> FE-1406 strategy quiver -> FE-1431 plugin-authoring/absence-locator closure

reviewer-path implementation
FE-1420 retry/abandonment safety -> FE-1438 client-tool return -> FE-1439 durable session

semantic implementation
FE-1393 exercised plugin SDK -> FE-1482 CPS plugin -> FE-1478 provenance read
-> FE-1480 scaffold/realization -> FE-1479 targeted correction join
```

### Proof bundle for the selected frontier

- **Bounded scenario:** replay the two existing truck-fleet baseline transcripts, then run condition
  3 with the drafted completion contract, surviving cards, and corrected stopping instrument.
- **Inputs:** the indexed baseline transcripts/readout, FE-1405 worked CPS payload, and indexed
  elicitation literature. No live interview or new use-case decision is an input.
- **Procedure and result:** FE-1407 produces the typed failure catalogue; FE-1402 and FE-1403 each
  perform their issue-specified desk replay; FE-1404 runs the existing baseline protocol and scores
  condition 3 against conditions 1 and 2; FE-1406 keeps only strategies supported by those results.
- **Durable outputs:** reference catalogue, immutable evaluation transcript/raw log/readout, and
  amendments to the completion, card, strategy, and plugin-authoring contracts. Index each output
  when it lands.
- **Runtime and witness boundary:** this frontier validates design discrimination, not production
  behavior or UX. A human witness is therefore inapplicable; the later reviewer-path proof still
  requires the deployed production entrypoint and witness.
- **Oracle candidates:** completion/stalling decisions over transcript prefixes, per-card firing
  verdicts, and condition-3 regression measures. Promote only categorical claims that survive the
  run.

### Active soft edges

- FE-1402 and FE-1403 remain deliberately soft-ordered after FE-1407 even though they do not depend
  on it; all three inputs join at FE-1404 through Linear's hard blockers.
- FE-1431 now defines design closure as a build-ready handoff separately from its later three-target
  ratification condition; the unresolved absence locator remains part of that design seam.
- FE-1420's idempotency and abandonment semantics precede FE-1438's external-tool protocol; FE-1439
  then proves the reviewer path survives reload without crossing principals.
- FE-1393 exercises the smallest honest plugin before CPS pressures the still-unstable SDK in
  FE-1482. FE-1478 supplies supporting-capture reads before FE-1480 realization.
- FE-1480's executable proof remains blocked by FE-1438, and FE-1479 follows the semantic/reviewer
  join.
- FE-1477 and FE-1440 share one routing implementation.
- FE-1395's structured-tap transport fact inputs the capture-store evidence rule.
- FE-1385/FE-1404/FE-1423 share telemetry vocabulary before FE-1423's exposure gate.
- The living-prototype charter waits on the infrastructure conversation.

The read-only Linear graph supplies mechanical availability, never priority.

## Active gates

| Gate | Owner / source | Watch trigger | Last checked | Consequence |
| --- | --- | --- | --- | --- |
| FE-1480 executable realization unavailable | FE-1438; [ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md) | Client tools return code diagnostics to the elicitor. | 2026-08-24 | Scaffold work may proceed; no runnable FE-1480 proof until the gate opens. |
| Plugin authoring not build-ready | FE-1431; [plugin contract](../specs/plugin-contract.md#open-strains-first-class-with-owners) | FE-1404/FE-1406 results land and the absence locator has one owner and representation. | 2026-08-24 | Do not freeze or generalize the SDK; FE-1393 may start only from the narrowed handoff. |
| Final use case outstanding | Dora; FE-1476 / September Plan | Dora confirms or changes it. | 2026-08-24 | If creation is required, activate cold-start and reconcile ADR-0004/proof. |
| Truck-fleet dossier missing from the repository | FE-1382 is Done but its promised `docs/reference/research/` artifact is absent. | Artifact path/branch is supplied or a reviewed replacement is selected. | 2026-08-24 | Existing baseline evidence may support design replay; claim no dossier-backed domain provenance. |

## Decision-relevant beliefs and unknowns

| Belief or unknown | Confidence / evidence | Cheapest probe |
| --- | --- | --- |
| The selected design queue can run without HITL. | Medium-high; every issue has bounded existing inputs and a desk/run oracle. | FE-1407 classifies both baseline transcripts without requesting new product choices. |
| CPS establishes the minimum plugin contract. | Medium-high; Gherkin under-stresses it, while the current SDK is only identity plus one proposal. | Complete the FE-1431 handoff, then exercise Gherkin and CPS in that order. |
| Field-local code obligations support localized realization and repair. | Low-medium; the corpus and Petrinaut diagnostics are field-addressed, but no Brunch run exists. | Realize one stochastic transition without rewriting an unrelated field. |
| Five turns yield a scoped correction. | Low; unrehearsed. | Run two bounded rehearsals. |
| Ask carries durable client-tool results. | Medium-low; machine results refused today. | Run one correlated FE-1438 round trip. |
| Structured export explains provenance/delta. | Medium; FE-1481 permits it. | Witness one rehearsal. |

## Sequencing cuts

- Cold-start does not gate review-and-revise ([S-001](STRATEGY-LOG.md#s-001)).
- FE-1393's smallest-honest Gherkin/SDK exercise precedes CPS without freezing the interface;
  FE-1482 then pressures it before FE-1387's generic freeze ([S-005](STRATEGY-LOG.md#s-005)).
- Finish the selected design queue before runtime feature work; then build the under-built reviewer
  path before returning to FE-1480 realization ([S-005](STRATEGY-LOG.md#s-005)).
- During design convergence, do not implement SDK surface, client tools, projection, provider
  routing, or deployment.
- Defer broad UI/ontology/gallery/affordances/voice/scenarios/telemetry until the loop closes.
- Fixtures supply domain state, never product wiring; provenance and the real entrypoint are gates.

## Stop or replan

- Dora requires cold-start creation.
- A selected design issue requires an unrecorded product preference or new domain testimony.
- Condition 3 cannot distinguish or improve the failures FE-1402/FE-1403 claim to address.
- FE-1431 cannot isolate a build-ready design handoff from its later empirical ratification.
- A code obligation cannot localize realization without whole-net resynthesis.
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
