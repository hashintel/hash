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
[S-007](STRATEGY-LOG.md#s-007), [S-008](STRATEGY-LOG.md#s-008), and [S-010](STRATEGY-LOG.md#s-010).
Governing architecture:
[ADR-0003](../adr/0003-three-register-ir.md), [ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md),
[ADR-0006](../adr/0006-plugins-per-target-formalism.md),
[ADR-0007](../adr/0007-harness-teaching-meets-plugin-content-at-fixed-keys.md) (accepted
2026-08-25; its key catalogue is a working set converging under decision 9).

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
   (first run 2026-08-25 as baseline protocol condition 5: loop closes, completion not reached)

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
No hard blocker chain remains from the retired design queue. The authoring lane's sizing
(FE-1406 as a package, FE-1431 as the authoring surface) is [S-008](STRATEGY-LOG.md#s-008)'s; its
method — both plugins written together, the catalogue converging — is [S-009](STRATEGY-LOG.md#s-009)'s.
Linear reflects both as of 2026-08-25. Numbering note: S-007 redefined FE-1404 as "condition 3 as the
protocol originally defined it"; in the protocol that run is now **condition 5**, and the retired
prompt-plus-operator instrument keeps the number 3. FE-1404's body still says condition 3 (Linear
edit pending approval). Its salvage-and-delete expectation was settled on 2026-08-26: salvage
assessed as none (the validators encoded the domain-keyed DemandTable S-007 ruled out; the
kind-level fold and `evaluateCompletion` now do the job), and the instrument, lock, operator
documents, `run.ts` paths, and test were deleted; the preregistration and prompt remain as record.

### Next arc — the black triangle, then the streams (2026-08-26)

**Standing directive (Lu, 2026-08-26).** Before the streams below are worked for their own sake,
the frontier must reach the **full end-to-end flow** — the "black triangle": dev services running,
persistence fully modelled, brunch-agent wired through the Petrinaut assistant interface, and a
real elicitation possible through that surface. In Lu's words: "The first version of this will
surely be poor and deficient but it will reveal gaps, and it will establish invariants we can hold
while we continue." Three reasons, all external to the harness: team visibility; CEO and PM
confidence; and a colleague building a voice mode on top of this interface, who needs "a clean
and stable surface to work from as soon as possible, even while we will continue to change the
underlying implementation". Consequence for sequencing: the streams are worked *inside* the
end-to-end slice — each lands as a change the deployed flow exercises — not as separate proofs
that join it later. The stable surface is the Petrinaut assistant interface and the transport
contract beneath it; those change deliberately, with notice, while everything behind them may
churn.

The recommended order below (B+D, then A, then C) was agreed by Lu with that caveat and is
**provisional**: Lu has further next-steps input to give before the arc is cut, and the strategy
entry (S-011) is appended when it lands. None of A–D is selected as an arc yet; the latency
concern cuts across A and B and is the first thing any of them must measure.

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
  **First half, first run (2026-08-25, condition 5):** snapshot at
  [`transcripts/condition-5.*`](../evidence/evaluations/process-model-elicitation/baseline/transcripts/)
  (transcript with harness facts, raw record, folded model, captures, reconstructed system prompt).
  Observed: the loop closes mechanically — ask, settlement nudge, sweep, fold, completion cue, all
  through the production Flue path; 12 turns, 267 captures, 69 nodes across 9 of 10 kinds, 0
  unmapped, 3 sweep batches refused on the verbatim floor and repaired in-turn; the interviewer
  stopped itself after the impatience probe. Failures: completion not reached (46 unsatisfied),
  mostly through identity — 7 objective nodes for 2 objective questions, 30 open conflicts, 167
  possibly-equivalent advisories — and 145 s per turn (see the immediate concern below). Narrowed
  claim: **the harness conducts an elicitation; it does not yet converge one.** The C1/C2-dimension
  scoring and the FE-1407 oracle pass are deferred until after the latency spike (Lu,
  2026-08-26; see the immediate concern). Second half (truck fleet) not run.
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

## Immediate concern — per-turn latency (raised 2026-08-25, open)

The first condition-5 run took **29 minutes for 12 interviewer turns, ~145 s per turn**, on the
production path. Lu: "not going to be viable at all, for a working application." Diagnosis and
recommended actions are in the
[condition-5 turn latency assessment](../evidence/evaluations/process-model-elicitation/baseline/condition-5-turn-latency.md);
the short form:

- **Where the time goes (by output volume; wall-clock per call was not recorded):** ~97% of the
  interviewer's 152k output tokens are extraction — 267 captures at ~350 tokens each, two thirds
  of every capture restating text the harness already holds, plus ~40k tokens of whole-batch
  re-emission after three refusals — generated on the critical path between the expert's answer
  and the next question, on `claude-opus-5` at default thinking, three serial calls per turn. Input
  is not the problem (970k tokens cache-read against 74 uncached).
- **Recommended, in order:** R0 instrument (`durationMs` per turn purpose in the runner;
  `@flue/opentelemetry` in the app; set a target — proposed 10 s to a visible question, 60 s to a
  settled sweep, <5k output tokens per steady-state turn); R1 take the sweep off the critical
  path; R2 extraction on a cheaper model at low thinking via `OperationOptions`; R3 abbreviated
  verbatim quotes, rationale only when given, per-proposal rather than per-batch refusal; R4 sweep
  against the store's node index and for unsatisfied rows first.
- **Status (2026-08-26):** the targets above are **adopted provisionally** on Lu's decision.
  The isolating spike (assessment §6) is designed; running it as the first task of the next arc
  is Lu's provisional intent, held open because Lu has further input to give on next steps
  before the arc is cut. R0 is the precondition for every other action. Any next arc that runs
  the harness records time per purpose or it is a desk proof.
- **Deferred behind the spike (Lu, 2026-08-26):** the condition-5 read-out on the C1/C2
  dimensions and the FE-1407 oracle — the unmet half of FE-1404's done-when — is written after
  the spike, not before it.

## Active gates

| Gate | Owner / source | Watch trigger | Last checked | Consequence |
| --- | --- | --- | --- | --- |
| FE-1480 executable realization unavailable | FE-1438; [ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md) | Client tools return code diagnostics to the elicitor. | 2026-08-25 | Scaffold work may proceed; no runnable FE-1480 proof until the gate opens. |
| Final use case outstanding | Dora; FE-1476 / September Plan | Dora confirms or changes it. | 2026-08-25 | If creation is required, Proof 1 becomes acceptance-relevant rather than a harness proof; reconcile ADR-0004/proof. |
| Deferral licensing (completion spec rules 17–19) unbuildable | [elicitation-completion](../specs/elicitation-completion.md) rules 17–19; FE-1480 / [ADR-0005](../adr/0005-model-assisted-sdcpn-realization.md) | A durable projection delivery exists for an evaluated revision. | 2026-08-25 | E1 supplies the report and revision (FE-1497, #9325); rule 18 makes licensing `false` without a delivered projection, so no issue is opened. When FE-1480 delivers, it is one read-time function beside `evaluateCompletion` plus a binding hook at settlement; no new persistence. |
| Truck-fleet dossier missing from the repository | FE-1382 is Done but its promised `docs/reference/research/` artifact is absent. | Artifact path/branch is supplied or a reviewed replacement is selected. | 2026-08-25 | The generality half of Proof 1 uses a fixture derived from the inbox truck SDCPN and Layer B's worked example; claim no dossier-backed domain provenance. |

## Decision-relevant beliefs and unknowns

| Belief or unknown | Confidence / evidence | Cheapest probe |
| --- | --- | --- |
| Kind-level rows express the coatings case. | High; condition 5 folded 267 captures onto 69 nodes across 9 of the 10 kinds with 0 unmapped, through the production fold — every fact the sweep proposed had a kind and a slot. Not yet shown: that the rows are sufficient for completion (46 unsatisfied at close, largely through conflict). | The condition-5 read-out on the C1/C2 dimensions; a second run with identity handling. |
| Typed extraction on the verbatim floor holds up in a live run. | Medium-high; 8 of 11 sweep batches applied first time, the 3 refusals (`evidence-quote-not-found`) were repaired in the same turn, none abandoned. Cost is the open question, not correctness. | Latency assessment R0 + the §6 spike: does a cheaper extraction model keep kind/node/slot agreement? |
| The shipped loop converges to completion. | Low; condition 5 never reached it — 7 objective nodes for 2 questions, 30 open conflicts, 167 possibly-equivalent advisories: the fold has no identity step and the sweep cannot see the store's nodes. | Give the sweep the node index (R4); rerun condition 5; count objective nodes. |
| Per-turn latency is dominated by extraction, and removable from the critical path. | Medium; 97% of output tokens are extraction, but no per-call `durationMs` exists to confirm the time split (see the immediate concern). | R0, then the §6 spike on frozen turn tails. |
| The truck-fleet case adds zero headings and zero rows. | Medium; Layer B was validated against it, but never through this file. | Proof 1's second half. |
| The controller read path is small. | The tripwire fired: E1 landed on FE-1497 (#9325) at 1055 code lines (excluding comments) against the plugin file's 225 non-blank lines — 378 parse the file and narrow the proposal schema, 677 are the fold, completion, and cue. Rules 17–19 are deferred (see gates). The parser question is answered: ADR-0007 decision 8 makes the contract schema-validated data (E5). | Watch whether FE-1479's affected-slice and delta moves fit inside the 677-line engine, and whether FE-1431's key reader lands well under 378 lines. |
| Harness teaching that has a package survives rescoping. | Low; the [lineage audit](../evidence/proofs/audits/harness-teaching-lineage-audit.md) shows four prose-only rescopings since 2026-08-11, none citing run evidence, and no test of the converse yet. | The first arc after `packages/repertoire` lands: does any rescoping of it cite a run? |
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
- The teaching layer is built as topology — a package, fixed keys, a schema, gates — with each layer
  paired with the document that states its intent, never as spec prose alone; and it is not
  rescoped without run evidence ([S-008](STRATEGY-LOG.md#s-008), [ADR-0007](../adr/0007-harness-teaching-meets-plugin-content-at-fixed-keys.md)).
- The key catalogue is a working set until a cycle changes no key: fix it by writing both plugins
  against it, not by decree ([S-009](STRATEGY-LOG.md#s-009), ADR-0007 decision 9).

## Stop or replan

- Dora requires cold-start creation.
- **Proxy completion:** an arc ends with durable outputs that are all desk, simulated, or
  evaluation-side and no production-path code changed (recurred twice: tracer-as-done,
  instrument-as-done). Watched, not fired, for the 2026-08-25/26 arc: production delta was
  `cue.ts` +3/−2 and `sdcpn-elicitor.ts` +11/−4 against an 891-line evaluation-side runner — but
  the runner's output is run evidence over the production path, the thing the heuristic exists
  to force. The next arc must move production code or the trigger fires.
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
  and separately approved Linear mutation. FE-1482 was parented to FE-1476 on 2026-08-25.
