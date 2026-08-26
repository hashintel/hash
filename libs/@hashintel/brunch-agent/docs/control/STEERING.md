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

## Governing concerns

- [ADR-0003](../adr/0003-three-register-ir.md) — the elicited model is a pure fold between
  assertions and projections; operative force: read paths make no new semantic judgments and every
  model part traces to captures.
- [ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md) — deterministic projection ends at a
  scaffold and typed obligations; operative force: executable TypeScript is authored downstream
  through Petrinaut and passes compile and simulation gates.
- [ADR-0006](../adr/0006-plugins-per-target-formalism.md) — each plugin serves one target formalism
  and no domain; operative force: the production SDCPN slice, not a generic or domain-keyed
  contract, sets the exercised interface.
- [ADR-0007](../adr/0007-harness-teaching-meets-plugin-content-at-fixed-keys.md) — harness-owned
  fixed keys join defaults to plugin cells; operative force: the key catalogue converges by
  co-authoring and remains a working set until a cycle changes no key.
- [S-001](STRATEGY-LOG.md#s-001) — review-and-revise is the current proof, not permanent scope;
  operative force: cold-start work does not gate the bounded correction run unless the use case
  changes.
- [S-004](STRATEGY-LOG.md#s-004) — code-bearing projections split into deterministic scaffolds and
  model-assisted realization; operative force: executable claims require Petrinaut client tools,
  compilation, and simulation.
- [S-007](STRATEGY-LOG.md#s-007) — the production vertical slice, not another design instrument,
  answers the remaining design questions; operative force: every arc must change or directly
  exercise production-path code.
- [S-008](STRATEGY-LOG.md#s-008) — harness teaching is package and schema topology rather than
  free-floating prose; operative force: rescoping requires run evidence and keeps the declared
  boundaries executable.
- [S-009](STRATEGY-LOG.md#s-009) — the key catalogue converges by co-authoring both plugins;
  operative force: schema, repertoire, SDCPN, and gherkin advance together until a cycle changes no
  key.
- [S-010](STRATEGY-LOG.md#s-010) — the shipped harness's facts replace the shadow classifier;
  operative force: conditions 4 and 5 are the live arms and no text proxy decides what the harness
  can report directly.
- **One production read model** — fold, completion, cue, and later correction share one derived
  path; operative force: no correction-side parallel model. Source: [ADR-0003](../adr/0003-three-register-ir.md).
  Steering projection: FE-1497 (controller read path).
- **Formalism-first contract pressure** — the first SDCPN implementation, not another generic
  design, establishes the exercised seam; operative force: domain knowledge stays in the plugin.
  Source: [ADR-0006](../adr/0006-plugins-per-target-formalism.md). Steering projection:
  FE-1482 (SDCPN plugin skeleton).
- **Live-loop viability** — the production harness conducts an elicitation but does not yet
  converge one within viable latency; operative force: measure per-purpose time and address
  identity before strengthening the completion claim. Source: [condition-5 evidence](../evidence/evaluations/process-model-elicitation/baseline/transcripts/).
  Steering projection: FE-1404 (condition-5 skeleton run).
- **Completion remains invariant-driven** — the production fold, not a domain-keyed instrument,
  supplies the completion state; operative force: preserve the accepted invariant set as executable
  tests. Source: [elicitation completion](../specs/elicitation-completion.md). Steering projection:
  FE-1402 (completion contract).
- **Failure detection stays an oracle, not authority** — the catalogue tests production evidence;
  operative force: apply it after the latency spike without letting evaluation material select the
  strategy. Source: [failure catalogue](../reference/research/elicitation/frontier-model-elicitor-failure-catalogue.md).
  Steering projection: FE-1407 (failure catalogue).
- **Reply transactions survive retries and abandonment** — duplicate or stale replies must not
  bind or apply; operative force: this safety floor precedes external client tools. Source:
  [elicitation-kernel spec](../specs/elicitation-kernel.md). Steering projection:
  FE-1420 (retry and abandonment safety).
- **Machine results remain correlated and non-user** — client-tool results retain field identity
  without becoming evidence; operative force: executable realization stays gated on the round
  trip. Source: [Petrinaut integration spec](../specs/petrinaut-integration.md). Steering projection:
  FE-1438 (client-tool return).
- **Review sessions survive reload without crossing principals** — durability and privacy are one
  boundary; operative force: the reviewer proof cannot claim continuity until both hold. Source:
  [Petrinaut integration spec](../specs/petrinaut-integration.md). Steering projection:
  FE-1439 (durable private sessions).
- **Artifact elements remain source-traceable** — generated structure points back to supporting
  captures; operative force: provenance reads precede targeted correction. Source:
  [ADR-0003](../adr/0003-three-register-ir.md). Steering projection:
  FE-1478 (provenance read).
- **Realization stays field-local** — typed obligations become executable without unrelated
  resynthesis; operative force: Petrinaut diagnostics and deterministic gates bound every repair.
  Source: [ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md). Steering projection:
  FE-1480 (field-local realization).
- **Correction preserves unaffected structure** — targeted re-elicitation joins semantic and
  reviewer work; operative force: supersede the changed capture while an unrelated region remains
  stable. Source: [objective](#objective-and-acceptance-proof). Steering projection:
  FE-1479 (targeted correction).
- **Plugin authoring is executable topology** — schema and key reader replace prose conventions;
  operative force: the surface stays smaller than the parser it retires. Source:
  [ADR-0007](../adr/0007-harness-teaching-meets-plugin-content-at-fixed-keys.md). Steering projection:
  FE-1431 (plugin authoring surface).
- **Harness teaching has one owner** — repertoire defaults fill every guidance and runbook key;
  operative force: plugins specialize those keys without importing harness method. Source:
  [S-008](STRATEGY-LOG.md#s-008). Steering projection:
  FE-1406 (harness repertoire).
- **A second formalism tests generality after the tracer** — gherkin pressures the settled SDCPN
  surface; operative force: it follows the production slice and adds no harness-owned key. Source:
  [S-009](STRATEGY-LOG.md#s-009). Steering projection:
  FE-1393 (gherkin generality check).
- **The delivery surface must become visible early** — the watched use case and voice consumer
  require a stable Petrinaut boundary; operative force: end-to-end visibility precedes stream-local
  optimization, while use-case confirmation may reframe Proof 1. Source: [September Plan](https://www.notion.so/hashintel/Brunch-September-Plan-3b33c81fe02480a5af6bf3089c3ee640).
  Steering projection: FE-1476 (September delivery).
- **The generality case needs recoverable provenance** — the truck-fleet source artifact is absent
  from the repository; operative force: until it returns, the case carries no dossier-backed
  provenance claim. Source: [S-007](STRATEGY-LOG.md#s-007). Steering projection: FE-1382
  (truck-fleet dossier).

## Selected frontier: the vertical slice, worked outward from its epicentres

**Claim:** the shortest route to the acceptance proof is a working elicitation loop in the
production path with one formalism-level plugin, not further design. Every design question still
open is answered by what the slice forces, and answered in code. The design-convergence frontier is
closed: its outputs are test-bed material, and its one durable design result is the plugin file
[`plugin-sdcpn/plugin.yaml`](../../packages/plugin-sdcpn/plugin.yaml) ratified by ADR-0006.

The slice has five epicentres, ordered by the size of the gap they close. Work starts at the
centre of each and moves outward; edges (SDK generality, affordance catalogues, UI breadth,
evaluation apparatus) are not worked until an epicentre needs them.

| Epicentre | Gap | Issue |
| --- | --- | --- |
| **E1 — controller read path** | The harness writes captures and never reads them back: no fold to a model, no completion over objective slices, no sweep list, no cue to the next turn. The hollow centre between "captured facts" and "conducted an elicitation". | FE-1497 (gist: harness controller read path) |
| **E2 — the SDCPN plugin in code** | The plugin file exists as a spec; nothing parses its three tables, folds captures onto its kinds, or projects from them. | FE-1482 (gist: CPS plugin, redefined as the skeleton epicentre) |
| **E3 — targeted correction** | `supersedes` is unreachable from extraction; no affected-slice computation; no delta; the target-document is still identified with the conversation. | FE-1479 (targeted re-elicitation), FE-1478 (provenance read), FE-1439 (durable session / document boundary) |
| **E4 — the real entry** | Client-tool results do not return to the elicitor; retry/abandonment semantics unproven; realization gated. | FE-1438, FE-1420, FE-1480 |
| **E5 — the teaching layer** | The harness teaches eight sentences; the plugin runbook carries five-sixths harness method that gherkin would repeat; the parser reads the floor and anchor from prose by convention. Opened by E1's landing ([S-008](STRATEGY-LOG.md#s-008)); designed by [ADR-0007](../adr/0007-harness-teaching-meets-plugin-content-at-fixed-keys.md); converged by co-authoring both plugins ([S-009](STRATEGY-LOG.md#s-009)). | FE-1431 (authoring surface: schema, `plugin.yaml`, key reader), FE-1406 (`packages/repertoire`), FE-1393 (zero new keys) |

```text
skeleton (construct job; proves the loop, produces fixtures)
FE-1497 controller read path -> FE-1482 plugin file + parser + fold
-> FE-1404 skeleton run against the baseline simulated expert
   (condition 5 currently proves that the loop closes but does not reach completion)

reviewer lane (review-and-revise job; the acceptance proof)
FE-1420 retry/abandonment safety -> FE-1438 client-tool return -> FE-1439 durable session
FE-1478 provenance read -> FE-1480 scaffold/realization -> FE-1479 targeted correction join

authoring lane (E5; a convergence cycle alongside the skeleton run, joining it at a run over the migrated plugin)
each cycle: write schema + plugin-sdcpn/plugin.yaml + plugin-gherkin/plugin.yaml + repertoire together
  -> review: does every key plausibly serve both? press against the CPS edge material
  -> run: re-do the simulated interviews over the wired agent — baseline conditions 4 (the rendered
     layer as prompt only) and 5 (the shipped harness in the loop); 1–2 are frozen, 3 retired (S-010)
  -> the strains and failures found are the next cycle's input to the ontologies and definitions
  -> edit; the catalogue freezes when a cycle changes no key
FE-1431 (schema, plugin.yaml, key reader) | FE-1406 (packages/repertoire) | FE-1393 (gherkin, zero keys) advance together
```

Arrows are strategic order. The skeleton lane and the reviewer lane run in parallel; they join at
FE-1479, whose "affected slice", "re-evaluate", and "delta" moves consume E1's fold and completion.
The authoring lane's sizing is [S-008](STRATEGY-LOG.md#s-008)'s; its co-authoring method is
[S-009](STRATEGY-LOG.md#s-009)'s.

### Immediate frontier — the black triangle, then the streams

Before the streams below are worked for their own sake, the frontier reaches the **full end-to-end
flow** — the "black triangle": dev services running, persistence fully modelled, brunch-agent wired
through the Petrinaut assistant interface, and a real elicitation possible through that surface.
This is the earliest proof that exposes production gaps while establishing an interface the team
and the voice-mode consumer can use. Each stream therefore lands as a change exercised by the
end-to-end flow, not as a separate proof that joins it later. The Petrinaut assistant interface and
transport contract are the stable surface; everything behind them may churn.

The provisional stream order is B+D, then A, then C. Further next-steps input may change that order;
latency cuts across A and B and is the first measurement in any selected stream.

- **A — harness mechanics finished and proven.** Persistence of captures and sessions
  (per-target-document store, many sessions to one document — designed, unreachable from any
  surface), referential stability of capture and node identity across sessions, resumable
  elicitation. Owning issues: FE-1439, FE-1420; §9.1 in the ledger.
- **B — observed runs instead of desk proofs.** Run the app under `herdr`, instrument time per
  turn purpose ([latency assessment](../evidence/evaluations/process-model-elicitation/baseline/condition-5-turn-latency.md) R0),
  and answer from evidence: how fast, whether sweeps succeed, whether typed extraction holds up.
  Owning issue: FE-1404 (second run).
- **C — end to end with server- and client-side tools.** The elicitor uses sweep, completion, and
  next-question on the server and reads or mutates the net on the client. Owning issues: FE-1438,
  FE-1420, FE-1480.
- **D — legible topology.** One document that shows what the elicitor sees — the system-prompt
  sources and the merged result, progressive disclosure, tool definitions — and the source of the
  baseline prompt. Owning issues: FE-1431, FE-1406; documentation protocol.

### Proof bundle for the selected frontier

- **Proof 1 — the loop works (skeleton run, FE-1404).** A harness with **no domain knowledge**,
  loaded with the SDCPN plugin file, interviews the existing simulated coatings-plant expert
  through the production capture, fold, completion, and cue path. Scored against conditions 1 and
  2 on the inherited dimensions, with the FE-1407 failure catalogue as the oracle list. Then the
  truck-fleet case (Layer B's validation case; fixture from the inbox SDCPN nets if the dossier
  stays missing) through the **unchanged** plugin file: zero new headings, zero new rows.
  Existing [condition-5 evidence](../evidence/evaluations/process-model-elicitation/baseline/transcripts/)
  narrows the claim: **the harness conducts an elicitation; it does not yet converge one.** Identity
  and latency remain open. The next run adds per-purpose timing before the C1/C2 and FE-1407
  read-out; the truck-fleet half remains unrun.
- **Proof 2 — the acceptance run** as stated in the objective, on the reviewer lane.
- **Inputs:** the plugin file; the baseline situation pack, transcripts, and readout (coatings
  plant, not truck fleet); the FE-1407 catalogue; the FE-1402 invariants as tests on
  `evaluateCompletion`; the 44-prefix rehearsal as a golden-fixture candidate once re-expressed at
  kind level. No new evaluation instrument is built for September: the simulated expert and the
  C1/C2 scoring are the fixed instrument, and for condition 5 the harness's own facts (captures,
  sweep results, completion report) replace any text classifier ([S-010](STRATEGY-LOG.md#s-010)).
- **Durable outputs:** production-path code in `packages/core` and `packages/plugin-sdcpn`; the
  skeleton transcript and readout under evaluation evidence; amendments to the plugin file only
  where the run forces them.
- **Runtime and witness boundary:** Proof 1 needs no human witness; Proof 2 requires the deployed
  production entrypoint and a witness record.
- **Oracle candidates:** each FM entry as a harness test; `evaluateCompletion` invariants;
  slice-locality of the projection delta (outside-scope region byte-stable).

### Active soft edges

- FE-1497 precedes FE-1482 only by the width of an interface: the fold and completion functions are
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

## Immediate concern — per-turn latency

The production run is not viable at its observed ~145 seconds per interviewer turn. The
[latency assessment](../evidence/evaluations/process-model-elicitation/baseline/condition-5-turn-latency.md)
owns the diagnosis and intervention sequence. Operative force here: every next harness run records
`durationMs` per turn purpose, and the isolating spike precedes the C1/C2 and FE-1407 read-out.
Provisional targets are 10 seconds to a visible question, 60 seconds to a settled sweep, and fewer
than 5,000 output tokens per steady-state turn.

## Active gates

| Gate | Owner / source | Watch trigger | Last checked | Consequence |
| --- | --- | --- | --- | --- |
| FE-1480 executable realization unavailable | FE-1438; [ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md) | Client tools return code diagnostics to the elicitor. | 2026-08-26 | Scaffold work may proceed; no runnable FE-1480 proof until the gate opens. |
| Final use case outstanding | Dora; FE-1476 / September Plan | Dora confirms or changes it. | 2026-08-26 | If creation is required, Proof 1 becomes acceptance-relevant rather than a harness proof; reconcile ADR-0004/proof. |
| Deferral licensing (completion spec rules 17–19) unbuildable | [elicitation-completion](../specs/elicitation-completion.md) rules 17–19; FE-1480 / [ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md) | A durable projection delivery exists for an evaluated revision. | 2026-08-26 | E1 supplies the report and revision; rule 18 makes licensing `false` without a delivered projection, so no issue is opened. When FE-1480 delivers, it is one read-time function beside `evaluateCompletion` plus a binding hook at settlement; no new persistence. |
| Truck-fleet dossier missing from the repository | FE-1382 (truck-fleet dossier) promised a `docs/reference/research/` artifact that is absent. | Artifact path/branch is supplied or a reviewed replacement is selected. | 2026-08-26 | The generality half of Proof 1 uses a fixture derived from the inbox truck SDCPN and Layer B's worked example; claim no dossier-backed domain provenance. |

## Decision-relevant beliefs and unknowns

| Belief or unknown | Confidence / evidence | Cheapest probe |
| --- | --- | --- |
| Kind-level rows express the coatings case. | High; [condition-5 evidence](../evidence/evaluations/process-model-elicitation/baseline/transcripts/) maps every proposed fact to a kind and slot, but does not yet show that the rows suffice for completion. | The condition-5 read-out on the C1/C2 dimensions; a second run with identity handling. |
| Typed extraction on the verbatim floor holds up in a live run. | Medium-high; the [latency assessment](../evidence/evaluations/process-model-elicitation/baseline/condition-5-turn-latency.md) records repaired refusals and leaves cost, not correctness, as the open question. | R0 + the assessment's §6 spike: does a cheaper extraction model keep kind/node/slot agreement? |
| The shipped loop converges to completion. | Low; [condition-5 evidence](../evidence/evaluations/process-model-elicitation/baseline/transcripts/) exposes unresolved identity and conflict rather than completion. | Give the sweep the node index (R4); rerun condition 5; count objective nodes. |
| Per-turn latency is dominated by extraction, and removable from the critical path. | Medium; the [latency assessment](../evidence/evaluations/process-model-elicitation/baseline/condition-5-turn-latency.md) infers the split from output volume because per-call timing is absent. | R0, then the assessment's §6 spike on frozen turn tails. |
| The truck-fleet case adds zero headings and zero rows. | Medium; Layer B was validated against it, but never through this file. | Proof 1's second half. |
| The controller read path is small. | Low; the current implementation exceeds the plugin file in size. The parser question is answered by ADR-0007 decision 8; completion rules 17–19 remain behind the delivery gate. | Watch whether FE-1479's affected-slice and delta moves fit inside the existing engine, and whether FE-1431's key reader stays smaller than the parser it replaces. |
| Harness teaching that has a package survives rescoping. | Low; the [lineage audit](../evidence/proofs/audits/harness-teaching-lineage-audit.md) shows four prose-only rescopings without run evidence, and no test of the converse yet. | The first arc after `packages/repertoire` lands: does any rescoping of it cite a run? |
| Field-local code obligations support localized realization and repair. | Low-medium; the corpus and Petrinaut diagnostics are field-addressed, but no Brunch run exists. | Realize one stochastic transition without rewriting an unrelated field. |
| Five turns yield a scoped correction. | Low; unrehearsed. The review-and-revise runbook in the plugin file is the first concrete trajectory. | Run two bounded rehearsals against a fixture model. |
| Ask carries durable client-tool results. | Medium-low; the current protocol refuses machine results. | Run one correlated FE-1438 round trip. |
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
- The teaching layer is built as topology — a package, fixed keys, a schema, gates — with each layer
  paired with the document that states its intent, never as spec prose alone; and it is not
  rescoped without run evidence ([S-008](STRATEGY-LOG.md#s-008), [ADR-0007](../adr/0007-harness-teaching-meets-plugin-content-at-fixed-keys.md)).
- The key catalogue is a working set until a cycle changes no key: fix it by writing both plugins
  against it, not by decree ([S-009](STRATEGY-LOG.md#s-009), ADR-0007 decision 9).

## Stop or replan

- Dora requires cold-start creation.
- **Proxy completion:** an arc ends with durable outputs that are all desk, simulated, or
  evaluation-side and no production-path code changed. The next arc must move production code or
  the trigger fires.
- The next run over the harness reports tokens but not time per turn purpose (the latency concern
  stays a hypothesis), or a latency target is still unset when a stream A–D is selected.
- Proof 1 shows a `Must know` that kind-level rows cannot express, or the truck-fleet case needs a
  new heading (ADR-0006's revisit condition).
- E1 exceeds the plugin file in size, or needs a persistence surface.
- A code obligation cannot localize realization without whole-net resynthesis.
- Two rehearsals fail the five-turn correction.
- FE-1438 loses correlation, durability, or evidence semantics.
- Production remains undeployable after FE-1479; seek a demo-surface decision, not test wiring.
- The teaching layer is rescoped again without run evidence, or `packages/repertoire` grows larger
  than the plugin it teaches.

## Exceptional roots

- **FE-1331** — create-new-net entry; keep exceptional until the watched use-case decision settles
  whether it joins the cold-start lane or receives a parent.
- **FE-1334** — surprising-scenario validation gesture; parent or cancel when its owning outcome is
  chosen.
- **FE-1472** — unrelated SDK-pin triage; assign an owning map or remove from the project.
- **FE-1476** — September delivery root; intended parent is FE-1357.
- **FE-1477–FE-1481** — PM-authored outcome roots; intended parent is FE-1476 after overlap review
  and separately approved Linear mutation.
