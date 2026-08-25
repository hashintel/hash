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

Governing strategic decisions: [S-001](STRATEGY-LOG.md#s-001), [S-004](STRATEGY-LOG.md#s-004),
and [S-007](STRATEGY-LOG.md#s-007). Governing architecture:
[ADR-0003](../adr/0003-three-register-ir.md), [ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md),
[ADR-0006](../adr/0006-plugins-per-target-formalism.md).

## Selected frontier: the vertical slice, worked outward from its epicentres

**Claim:** the shortest route to the acceptance proof is a working elicitation loop in the
production path with one formalism-level plugin, not further design. Every design question still
open is answered by what the slice forces, and answered in code. The design-convergence frontier is
closed: its outputs are test-bed material, and its one durable design result is the plugin file
[`sdcpn-plugin.md`](../specs/sdcpn-plugin.md) ratified by ADR-0006.

The slice has four epicentres, ordered by the size of the gap they close. Work starts at the
centre of each and moves outward; edges (SDK generality, affordance catalogues, UI breadth,
evaluation apparatus) are not worked until an epicentre needs them.

| Epicentre | Gap | Issue |
| --- | --- | --- |
| **E1 — controller read path** | The harness writes captures and never reads them back: no fold to a model, no completion over objective slices, no sweep list, no cue to the next turn. The hollow centre between "captured facts" and "conducted an elicitation". | none yet — proposed new issue in `packages/core` |
| **E2 — the SDCPN plugin in code** | The plugin file exists as a spec; nothing parses its three tables, folds captures onto its kinds, or projects from them. | FE-1482 (gist: CPS plugin, redefined as the skeleton epicentre) |
| **E3 — targeted correction** | `supersedes` is unreachable from extraction; no affected-slice computation; no delta; the target-document is still identified with the conversation. | FE-1479 (targeted re-elicitation), FE-1478 (provenance read), FE-1439 (durable session / document boundary) |
| **E4 — the real entry** | Client-tool results do not return to the elicitor; retry/abandonment semantics unproven; realization gated. | FE-1438, FE-1420, FE-1480 |

```text
skeleton (construct job; proves the loop, produces fixtures)
E1 controller read path -> FE-1482 plugin file + parser + fold
-> FE-1404 skeleton run against the baseline simulated expert

reviewer lane (review-and-revise job; the acceptance proof)
FE-1420 retry/abandonment safety -> FE-1438 client-tool return -> FE-1439 durable session
FE-1478 provenance read -> FE-1480 scaffold/realization -> FE-1479 targeted correction join

after the skeleton runs
FE-1393 gherkin under the same six headings (generality check)
FE-1406 lift harness-generic patterns into a harness repertoire
FE-1431 residue: parser + heading contract
```

Arrows are strategic order. The skeleton lane and the reviewer lane run in parallel; they join at
FE-1479, whose "affected slice", "re-evaluate", and "delta" moves consume E1's fold and completion.
No hard blocker chain remains from the retired design queue.

### Proof bundle for the selected frontier

- **Proof 1 — the loop works (skeleton run, FE-1404).** A harness with **no domain knowledge**,
  loaded with the SDCPN plugin file, interviews the existing simulated coatings-plant expert
  through the production capture, fold, completion, and cue path. Scored against conditions 1 and
  2 on the inherited dimensions, with the FE-1407 failure catalogue as the oracle list. Then the
  truck-fleet case (Layer B's validation case; fixture from the inbox SDCPN nets if the dossier
  stays missing) through the **unchanged** plugin file: zero new headings, zero new rows.
- **Proof 2 — the acceptance run** as stated in the objective, on the reviewer lane.
- **Inputs:** the plugin file; the baseline situation pack, transcripts, and readout (coatings
  plant, not truck fleet); the FE-1407 catalogue; the FE-1402 invariants as tests on
  `evaluateCompletion`; the 44-prefix rehearsal as a golden-fixture candidate once re-expressed at
  kind level. No new evaluation instrument is built for September: the simulated expert and the
  C1/C2 scoring are the fixed instrument.
- **Durable outputs:** production-path code in `packages/core` and `packages/plugin-sdcpn`; the
  skeleton transcript and readout under evaluation evidence; amendments to the plugin file only
  where the run forces them.
- **Runtime and witness boundary:** Proof 1 needs no human witness; Proof 2 requires the deployed
  production entrypoint and a witness record.
- **Oracle candidates:** each FM entry as a harness test; `evaluateCompletion` invariants;
  slice-locality of the projection delta (outside-scope region byte-stable).

### Active soft edges

- E1 precedes FE-1482 only by the width of an interface: the fold and completion functions are
  harness code that the plugin's tables parameterise. Build them together on one branch if that is
  faster; do not design the interface before the first plugin exercises it.
- FE-1420's idempotency and abandonment semantics precede FE-1438's external-tool protocol; FE-1439
  then proves the reviewer path survives reload without crossing principals.
- FE-1478 supplies supporting-capture reads before FE-1480 realization; FE-1480's executable proof
  remains gated by FE-1438.
- FE-1393 follows the SDCPN plugin; gherkin is the generality check, not the tracer that precedes.
- FE-1477 and FE-1440 share one routing implementation; one folds into the other.
- FE-1395's structured-tap transport fact inputs the capture-store evidence rule.
- FE-1385/FE-1423 share telemetry vocabulary before FE-1423's exposure gate.
- The living-prototype charter waits on the infrastructure conversation.

The read-only Linear graph supplies mechanical availability, never priority.

## Active gates

| Gate | Owner / source | Watch trigger | Last checked | Consequence |
| --- | --- | --- | --- | --- |
| Controller read path has no owner | E1; no Linear issue exists | An issue is created and a branch opened. | 2026-08-25 | Neither proof can start; the plugin file has nothing to run in. |
| FE-1480 executable realization unavailable | FE-1438; [ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md) | Client tools return code diagnostics to the elicitor. | 2026-08-25 | Scaffold work may proceed; no runnable FE-1480 proof until the gate opens. |
| Final use case outstanding | Dora; FE-1476 / September Plan | Dora confirms or changes it. | 2026-08-25 | If creation is required, Proof 1 becomes acceptance-relevant rather than a harness proof; reconcile ADR-0004/proof. |
| Truck-fleet dossier missing from the repository | FE-1382 is Done but its promised `docs/reference/research/` artifact is absent. | Artifact path/branch is supplied or a reviewed replacement is selected. | 2026-08-25 | The generality half of Proof 1 uses a fixture derived from the inbox truck SDCPN and Layer B's worked example; claim no dossier-backed domain provenance. |

## Decision-relevant beliefs and unknowns

| Belief or unknown | Confidence / evidence | Cheapest probe |
| --- | --- | --- |
| Kind-level rows express the coatings case. | Medium-high; the twenty domain-keyed rows of the FE-1402 rehearsal collapse onto eight kind rows on paper. | Proof 1's first half. |
| The truck-fleet case adds zero headings and zero rows. | Medium; Layer B was validated against it, but never through this file. | Proof 1's second half. |
| The controller read path is small. | Medium; `evaluateCompletion` is ~10 invariants over a fold the store already supports. | Build E1; if it exceeds the plugin file in size, stop and look. |
| Field-local code obligations support localized realization and repair. | Low-medium; the corpus and Petrinaut diagnostics are field-addressed, but no Brunch run exists. | Realize one stochastic transition without rewriting an unrelated field. |
| Five turns yield a scoped correction. | Low; unrehearsed. The review-and-revise runbook in the plugin file is the first concrete trajectory. | Run two bounded rehearsals against a fixture model. |
| Ask carries durable client-tool results. | Medium-low; machine results refused today. | Run one correlated FE-1438 round trip. |
| Structured export explains provenance/delta. | Medium; FE-1481 permits it. | Witness one rehearsal. |

## Sequencing cuts

- Cold-start does not gate review-and-revise ([S-001](STRATEGY-LOG.md#s-001)); the skeleton's fold,
  completion, and cue serve both jobs, which is why it is built first.
- Implement the slice; design only what the slice forces ([S-007](STRATEGY-LOG.md#s-007)). No new
  spec precedes the code that needs it.
- Plugins are per target formalism and domain-neutral by rule ([ADR-0006](../adr/0006-plugins-per-target-formalism.md)).
  No domain content enters a plugin file; a case that seems to need it is a finding for an ADR.
- Evaluation instruments stay smaller than the thing they evaluate. The simulated expert and the
  inherited scoring are the fixed instrument for September.
- Gherkin follows SDCPN as the generality check; no generic SDK freeze (FE-1387, gist: generic
  plugin freeze) before September.
- Defer broad UI/ontology/gallery/affordances/voice/scenarios/telemetry until the loop closes.
- Fixtures supply domain state, never product wiring; provenance and the real entrypoint are gates.

## Stop or replan

- Dora requires cold-start creation.
- **Proxy completion:** an arc ends with durable outputs that are all desk, simulated, or
  evaluation-side and no production-path code changed (recurred twice: tracer-as-done,
  instrument-as-done).
- Proof 1 shows a `Must know` that kind-level rows cannot express, or the truck-fleet case needs a
  new heading (ADR-0006's revisit condition).
- E1 exceeds the plugin file in size, or needs a persistence surface.
- A code obligation cannot localize realization without whole-net resynthesis.
- Two rehearsals fail the five-turn correction.
- FE-1438 loses correlation, durability, or evidence semantics.
- Production remains undeployable after FE-1479; seek a demo-surface decision, not test wiring.

## Exceptional roots

- **FE-1331** — create-new-net entry; keep exceptional until the watched use-case decision settles
  whether it joins the cold-start lane or receives a parent.
- **FE-1334** — surprising-scenario validation gesture; parent or cancel when its owning outcome is
  chosen.
- **FE-1406** — harness strategy repertoire; shrunk to the post-skeleton lift of harness-generic
  patterns out of the plugin file.
- **FE-1472** — unrelated SDK-pin triage; assign an owning map or remove from the project.
- **FE-1476** — September delivery root; intended parent is FE-1357.
- **FE-1477–FE-1482** — PM-authored outcome roots; intended parent is FE-1476 after overlap review
  and separately approved Linear mutation.
- **E1 controller read path** — no issue yet; the one new issue this replan proposes.
