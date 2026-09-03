# Draft Mission 7 — Bounded reviewer revision and scoped patch

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

## Cold-start reads

A fresh builder must read these sources before cutting or implementing this cluster:

- [`MISSION.md`](../../MISSION.md) — closure pointer for Mission 4. Mission 4 produced no full-run workpiece candidate; consume only the source/workpiece pair explicitly selected and promoted by Mission 5 or a predecessor addendum.
- [`MISSION.next.md`](../../MISSION.next.md) — compact shared frame, standing locks, and current mission joins.
- [`README.md`](README.md) — durable draft authority, lifecycle, conversion, and oracle-gap rules.
- [`docs/mission-archive/2-mechanical-capture-sweep.md`](../mission-archive/2-mechanical-capture-sweep.md) — exact-evidence capture, idempotency, Flue-history authority, and model-free scheduling.
- [`docs/mission-archive/3-structurally-typed-runbook-to-headless-pn.md`](../mission-archive/3-structurally-typed-runbook-to-headless-pn.md) — accepted workpiece leg and falsified provider-schema construction leg.
- [`evaluations/oracles/ir-quality-ruler-v1.md`](../../evaluations/oracles/ir-quality-ruler-v1.md) and [`evaluations/protocols/ir-quality-ruler-v1/cold-ir-reviewer.md`](../../evaluations/protocols/ir-quality-ruler-v1/cold-ir-reviewer.md) — current conservation, grounding, conflict-collapse, and cold-reading criteria; neither is yet a successive-revision oracle.
- [`docs/evidence/evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md`](../evidence/evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md) — healthy foreground-turn range, costly whole-workpiece synthesis, and observed correction handling.
- [`packages/core/src/prompts/SYSTEM.md`](../../packages/core/src/prompts/SYSTEM.md), [`packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md`](../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/SKILL.md), and [`packages/plugin-sdcpn/src/skills/sdcpn-modelling/templates/workpiece.md`](../../packages/plugin-sdcpn/src/skills/sdcpn-modelling/templates/workpiece.md) — current foreground lifecycle and workpiece correction behavior.
- [`apps/brunch-agent/test/petrinaut-chat.test.ts`](../../../../../apps/brunch-agent/test/petrinaut-chat.test.ts), [`apps/brunch-agent/test/headless-petrinaut-client.test.ts`](../../../../../apps/brunch-agent/test/headless-petrinaut-client.test.ts), and [`packages/plugin-sdcpn/src/tools/petrinaut-construction.ts`](../../packages/plugin-sdcpn/src/tools/petrinaut-construction.ts) — current real door, bounded mutation subset, and its limits.
- [`5-capture-backed-review.md`](5-capture-backed-review.md) and [`6-traceable-projection.md`](6-traceable-projection.md) — provisional inherited artifacts, provenance seam, projection contract, and stable-identity obligations. Re-resolve these joins against accepted close evidence at cut time rather than assuming draft hypotheses landed.
- Commit `157730cc5a214dd9c543e8d95c7193a219c48aef` on deployment branch `ln/fe-1569-brunch-agent-deployment`, especially `libs/@hashintel/brunch-agent/docs/evidence/implementations/mission-8-deployment-handoff.md` — local application contract and the still-open infrastructure proof that any deployed durability claim must consume.

## Visible product advance

Through the deployed Petrinaut/Brunch boundary, a scenario-authorized reviewer selects one operational meaning, challenges or refines it in 3–5 focused turns, inspects the attributed prior and current meaning plus a semantic change account, and sees either:

- a linked SDCPN-region patch with unrelated identities and behavior unchanged;
- an explicitly justified widening of the impact boundary; or
- a visible refusal because authority, evidence, consistency, staleness, or canonical validation does not permit the change.

The updated why answer retains the original expert evidence, adds the reviewer evidence with attribution, and explains the disposition of prior meaning. Recency by itself never grants overwrite authority.

The broader demonstration portfolio is not yet enumerated. The accepted floor here is the selected FE-1476 review/revise case plus the revision classes named below, not every operational process or every possible correction.

## Contract stratum

The named stratum is **bounded reviewer-authority, workpiece-revision, and linked-patch locality for one selected projected region**.

Scenario-declared authority must name the reviewer, the selected workpiece meaning and linked net region, the kinds of change the reviewer may settle, and any required confirmation or owner boundary. Authority outside that declaration is absent, not inferred.

The currently accepted peer classes are:

1. **Correction** — the authorized reviewer establishes that prior canonical meaning was wrong; the prior revision and evidence remain retained while the new revision names supersession.
2. **Qualification** — new evidence narrows, conditions, or hedges prior meaning without erasing the supported core.
3. **Contextual coexistence** — both accounts remain valid under distinguishable conditions; the workpiece and projection preserve the split rather than selecting the newest.
4. **Unresolved conflict** — accounts disagree and authority/evidence does not resolve them; canonical state does not silently advance.
5. **Refusal / rejected or unsupported change** — the request exceeds declared authority, lacks evidence, targets stale state, or cannot pass impact or canonical validation.

Stale-base revision and legitimate impact widening are cross-class failure/extent cases. Any additional class must be explicitly accepted when the live mission is cut.

## Boundary crossings and current throughline hypothesis

```text
scenario declares reviewer authority + selected region + base revisions
→ reviewer enters the deployed Petrinaut assistant panel
→ AI SDK /api/chat transport resumes the owning Flue conversation
→ foreground Brunch agent conducts 3–5 focused operational-language turns
→ Flue history retains the canonical conversation
→ harness-owned mechanical sweep durably captures the settled reviewer range
→ one bounded foreground phase-boundary synthesis reads:
   prior workpiece revision + current derivation/region + newly captured evidence
→ synthesis classifies correction | qualification | coexistence | conflict | refusal
→ attributed next workpiece revision + semantic diff + impact declaration
→ authority, base-revision, evidence, and impact gates admit or refuse commit
→ SDCPN plugin applies the bounded patch through Petrinaut-owned canonical mutations
→ Petrinaut validates the current net and selected behavior
→ panel shows revised meaning, disposition, patch/refusal, and updated why answer
```

The foreground phase-boundary synthesis is the default. It is one explicit semantic operation after the focused review, not extraction/fold work on every turn. The patch consumes the committed current workpiece and current net; neither the transcript nor an observer queue is an unbounded fallback.

## Throughline proof floor

One scenario-declared, consequential operational distinction must cross the real deployed path and produce:

- 3–5 focused reviewer turns in operational vocabulary;
- mechanically retained, attributed reviewer evidence;
- an inspectable prior/current workpiece pair and semantic diff;
- the correct class disposition;
- a bounded patch or explicit refusal;
- updated element → derivation → workpiece revision → original and reviewer evidence provenance; and
- unchanged ids and behavior outside the declared impact, except where a visible, justified widening is accepted.

The default tracer should be a correction because it proves canonical change. It must be selected so a mistaken overwrite, qualification, coexistence, and conflict treatment would be observably different. One successful correction is only throughline proof; it does not close the class stratum.

## Readiness ratchet

### Inherited stratum closure

This cluster may start only after the prior missions have supplied and accepted:

- Mission 5's honest prebuilt pair, durable exact-evidence provenance, broken-link behavior, and element/workpiece/evidence identity seam;
- Mission 6's meaningful automatically projected live region, derivation coverage, canonical provider-visible mutation path, repeated-projection identity behavior, and explicit partial/unsupported failure;
- the current workpiece revision and exact source Flue conversation selected at the prior handoff;
- a deployment boundary that actually persists every state this path consumes across the replacement behavior it claims.

Draft links are not evidence. If Mission 5 or 6 ships a different representation, Mission 7 must consume that actual contract or return here for re-cutting.

### Readiness gate after the new throughline

Before this visible capability ships, assess the whole accepted class set: correction, qualification, contextual coexistence, unresolved conflict, refusal/unsupported change, stale revision, and impact widening.

For each, record:

- declared authority and the reason canonical state may change or must not change;
- preservation, supersession, qualification, contextual split, conflict retention, or rejection of prior meaning;
- semantic diff quality and attributed evidence support;
- workpiece, derivation, and net-link churn;
- base-revision and stale-state behavior;
- patch scope, unrelated identity stability, and behavior preservation;
- latency, token/usage cost, foreground blocking, and visible failure;
- transcript fallback behavior; and
- compaction/recovery behavior if the exercised deployed path crosses those boundaries.

These peer obligations close in Mission 7 because Mission 9 consumes a trustworthy final revision rather than becoming the first owner of reviewer-authority semantics. The next owner is Mission 9 only for the selected complete artifact and accepted optimisation handoff. Re-entry gate: Chris/Yannis' accepted consumer contract reveals another revision class or makes a currently deferred durability/identity property load-bearing. Oracle: the new class must be added to the revision oracle and exercised through the deployed panel before Mission 9 may rely on it.

Breadth beyond the named classes and accepted scenario portfolio remains unearned.

## Candidate evidence and oracles

- `apps/brunch-agent/test/petrinaut-chat.test.ts`, test **“the committed /api/chat door streams a plain Flue agent through server and client tools”**, currently proves the production AI SDK/Flue door, client-tool correlation, history recovery, ownership refusal, exact capture excerpts, idempotent recapture, and absence of sweep/construction tools on the interviewer. It does not prove reviewer revision or deployed infrastructure.
- `apps/brunch-agent/test/headless-petrinaut-client.test.ts`, tests **“constructs a parser-accepted document through the bounded callbacks”** and **“refuses tools outside the side-quest subset”**, currently prove only the six-tool construct subset and parser acceptance. They are evidence for bounded capability/refusal, not a scoped update patch or semantic fidelity.
- `evaluations/oracles/ir-quality-ruler-v1.md` supplies stable `CONFLICT-COLLAPSE`, `CONS-MISS`, `CONS-DISTORT`, `INVENT`, `HARDEN`, `SCOPE`, and `GAP-MISCLASS` judgments. Its own scope excludes successive revision and PN construction, so it may seed but cannot settle the revision claim.
- `docs/evidence/evaluations/vestera-prospective-baseline-v1/campaign-adjudication.md` records one correction preserved in a workpiece and healthy ordinary-turn timing. It does not prove authorization, successive revision, or patch locality.
- Canonical action/schema/parser tests under `libs/@hashintel/petrinaut-core/src/actions.test.ts`, `src/file-format/parse-sdcpn-file.test.ts`, and `src/file-format/serialize-sdcpn.test.ts` are exact inner oracles for accepted payloads and round-trip document validity, not meaning or locality.
- **ORACLE GAP — successive semantic revision:** no current oracle compares prior workpiece + newly captured evidence against the next revision across all five classes. Before cut, freeze a reviewed fixture set and adjudication rubric that detects lost supported meaning, incorrect authority, unsupported strengthening, conflict collapse, and incorrect disposition.
- **ORACLE GAP — patch locality and behavior:** no current oracle proves that a semantic revision changes the intended linked region while preserving unrelated ids and behavior. Before cut, define the selected region, explicit allowed impact set, before/after id inventory, semantic expectations, and—where discriminating—a Petrinaut simulation comparison.
- **ORACLE GAP — outer path:** no current test or artifact witnesses the 3–5-turn scenario portfolio through a remotely deployed Petrinaut/Brunch path. Before claiming the visible advance, record a human witness against the accepted deployment, exact scenario/base revisions, transcript, workpiece diff, mutation trace, before/after net, and refusal output.
- **ORACLE GAP — durable capture join:** the deployment handoff explicitly leaves the JSON capture store inactive and non-durable. Before this path consumes capture remotely, Mission 5 or this cut must identify and test the durable implementation across the claimed task-replacement boundary.

## Verification approach

- **Inner mechanism:** deterministic tests for authority checks, base-revision refusal, exact evidence references, semantic-diff representation, class disposition, idempotent commit, impact calculation, and canonical mutation validation. Use the frozen class fixtures and revision oracle; parser success cannot substitute for semantic review.
- **Middle integration/contract:** drive the production `ChatAgent`/AI SDK path from the selected Mission 6 artifact, perform the mechanical settled-range capture and foreground synthesis, apply the patch through the actual browser client-tool callbacks, and compare persisted before/after workpiece, derivation, and net artifacts. Exercise a stale-base attempt and one explicit refusal.
- **Outer deployed/user-visible:** a named human witness performs each accepted peer class through the deployed panel, including the 3–5-turn correction tracer, and verifies visible attribution, semantic diff, changed region, stable unrelated ids/behavior, updated why answer, and comprehensible refusal/failure. The live mission owns this outer proof; it cannot be delegated to Mission 9.

## Inputs and joins

- Upstream source exit: the frozen workpiece, exact source Flue conversation, instrument manifest, and evaluation/adjudication explicitly selected by Mission 5 or a predecessor addendum; Mission 4 itself supplies no full-run candidate.
- Mission 5: prebuilt workpiece/net pair, current workpiece revision and references, capture evidence references, net-element ids, projection rationale, durability disposition, and the why interaction.
- Mission 6: selected meaningful region, canonical mutation surface, derivation records, repeat-projection identity evidence, and accepted unsupported/partial behavior.
- Mission 8: consume the actual application contract—fail-closed Postgres Flue state, verified TLS, IAM/static-password paths, content-free OTel, restricted routes, liveness, singleton ownership policy—but do not imply it is deployed. The infrastructure handoff, real RDS/Anthropic/collector/replacement/rollback proof, and owner acceptance remain required before an outer deployed claim.
- Mission 9: receives only an accepted final workpiece/net/evidence/derivation revision package and the six-beat real-path evidence; its consumer contract may not weaken Mission 7's revision-integrity closure.

## Risks and assumptions

- **ASSUMPTION:** bounded foreground synthesis can incorporate 3–5 turns without losing prior meaning or blocking ordinary turns. **Impact if false:** the default revision mechanism is not trustworthy or usable. **Cheapest validation:** run the five frozen class fixtures against prior revision + exact captures and measure phase-boundary latency separately from foreground turns.
- **ASSUMPTION:** scenario-declared authority is sufficient for the selected review. **Impact if false:** a reviewer may make an unauthorized canonical change or every change may require another owner. **Cheapest validation:** have the scenario owner adjudicate one allowed correction and one cross-boundary refusal before implementation.
- **ASSUMPTION:** Mission 6's stable ids and derivation neighborhood are sufficient to calculate a bounded impact. **Impact if false:** local revision can cause unrelated churn or require broader context. **Cheapest validation:** dry-run the selected semantic change against the frozen Mission 6 before/after artifact and enumerate the minimal connected impact.
- **RISK:** semantic diff reports textual edits while hiding a changed operational claim. **Impact:** a reviewer cannot understand what changed. **Cheapest validation:** cold human comparison against the class fixture's expected preserved/changed meaning.
- **RISK:** compaction removes the recoverable workpiece or evidence needed by synthesis. **Impact:** stale or transcript-dependent revision. **Cheapest validation:** if the real path crosses compaction, reconstruct the same current revision and evidence references after that boundary; otherwise label the limitation and keep it outside the shipped durability claim.
- **RISK:** the capture store remains task-local JSON while the service claims replacement durability. **Impact:** reviewer evidence may disappear after acceptance. **Cheapest validation:** inspect the consumed Mission 5/Mission 8 storage contract before cut and refuse remote revision until capture durability is observed.

## Accepted constraints and guarded invariants

- **STOP-THE-LINE — bounded authority:** canonical state changes only under the scenario's declared reviewer authority. Guard: authority fixture plus allowed/refused outer witness.
- **STOP-THE-LINE — evidence retention:** original and reviewer evidence stay exact, attributed, immutable, and reachable; model prose is never presented as quotation. Guard: capture identity/excerpt assertions and provenance inspection.
- **STOP-THE-LINE — no recency overwrite:** prior supported meaning survives unless explicitly corrected, qualified, context-split, or retired under authority. Guard: successive-revision oracle across every accepted class.
- **STOP-THE-LINE — patch locality:** unrelated ids and behavior remain stable, and necessary expansion is declared before commit. Guard: before/after id inventory, accepted impact set, and semantic/simulation check where applicable.
- Flue history remains the canonical conversation log; the capture ledger is not a second transcript.
- Mechanical capture remains domain-opaque and harness-owned. The foreground Markdown workpiece owns semantic synthesis.
- The foreground model neither receives nor schedules a sweep tool. Ordinary turns do not block on extraction, fold, completion, or projection.
- Petrinaut owns canonical SDCPN schemas and mutations. Brunch imports or mechanically consumes them and does not copy field shapes.
- Brunch remains a second assistant; preserve stock-assistant operation and distinct histories. Keep the panel on AI SDK `useChat` / `onToolCall`.
- No comprehensive ontology, closed claim kinds, typed completion algebra, generic assertion fold, generalized runtime, TUI, second agent, or second server is earned.

## Cross-cutting obligations

- Workpiece sufficiency: a cold reader can understand both revisions and the disposition without transcript archaeology.
- Projection fidelity and evidence provenance: the patch follows the committed workpiece change, and every changed consequential element reaches projection rationale and both generations of evidence.
- Revision integrity and patch locality: class handling, semantic diff, retained meaning, stable ids, and explicit impact widening remain inspectable as separate claims.
- Petrinaut semantic acceptance: canonical validation, non-empty result, and selected behavior are checked; tool-call or parser success alone is insufficient.
- Interaction quality and visible failure: focused foreground turns remain in a healthy latency class, and authority conflict, staleness, unsupported change, schema failure, or locality failure cannot silently advance state.
- If Petrinaut user-visible behavior changes, update the relevant pages under `libs/@hashintel/petrinaut/docs/` in the same change and prompt the owner to replace any screenshots made stale.

## Expected touched paths

Tentative until the Mission 5/6 joins and live UI boundary are inspected:

```text
libs/@hashintel/brunch-agent/
├── packages/core/src/SYSTEM.md                                      ~ revision/authority conduct if needed
├── packages/core/src/evidence/                                     ? generic retained-evidence/revision mechanics only if earned
├── packages/plugin-sdcpn/src/skills/sdcpn-modelling/               ~ foreground review and workpiece revision guidance
├── packages/plugin-sdcpn/src/tools/                                ~ canonical update/patch capability selected by Mission 6
├── evaluations/oracles/                                            + successive-revision oracle
├── evaluations/protocols/                                          + frozen class fixtures/protocol
└── docs/evidence/evaluations/                                      + observed revision campaign/adjudication
apps/brunch-agent/
├── src/agents/chat-agent/                                          ~ compose only accepted capabilities
├── src/capture/                                                    ~ settled-range durable join, not semantic fold
├── src/conversation/                                               ? explicit phase-boundary operation if this is the earned home
├── src/http/                                                       ? only if the existing real door needs generic transport support
└── test/                                                           ~ production-path revision, refusal, persistence, and locality coverage
libs/@hashintel/petrinaut-core/
├── src/action-schemas.ts                                           ~ only if a canonical mutation gap is proven upstream
└── src/simulation/                                                 ? only if selected behavior comparison is discriminating
libs/@hashintel/petrinaut/
├── src/ui/views/Editor/panels/ai-assistant-panel*                  ? visible diff/impact/refusal surface if chat is insufficient
└── docs/                                                           ~ when user-visible behavior changes
```

No path is permission to edit before the cluster is cut. Prefer existing generic host extension points over Brunch-specific Petrinaut library logic.

## Fog-line

- The exact accepted scenario portfolio beyond the selected correction tracer.
- The exact authority declaration and whether any class requires original-expert or owner confirmation.
- The semantic-diff representation that is understandable without imposing per-statement semantic typing.
- The smallest linked neighborhood sufficient for synthesis and impact analysis.
- What counts as unchanged behavior outside the region and when simulation is a useful discriminator.
- How legitimate impact widening is previewed, authorized, and either committed or refused.
- The exact durable storage/transaction boundary across captures, workpiece revision, derivation links, and net commit.
- Whether the short path crosses Flue compaction; if not, which limitation must remain visible in the handoff.
- Whether the chat answer alone makes prior/current meaning and patch impact inspectable or a generic linked detail surface is required.
- Exact latency and usage ceilings must come from the accepted scenario and deployment budget, not invention.

## Stop or reorient

- Stop if reviewer authority cannot be named per scenario or a tentative proposal can silently become canonical truth.
- Stop if a correction, qualification, coexistence, conflict, or refusal cannot preserve and explain prior meaning.
- Stop if phase-boundary synthesis blocks each ordinary turn, repeatedly loses supported meaning, reads stale state, is unrecoverable, or unavoidably depends on unbounded history.
- Stop if reviewer evidence is not durable before canonical workpiece or net state changes.
- Stop if the patch rereads the transcript as its primary model, mutates from an uncommitted workpiece, or silently rebuilds unrelated regions.
- Stop if unrelated ids or behavior churn without an explicit, authorized impact widening.
- Stop if canonical Petrinaut schemas must be copied into Brunch or parser/tool success is presented as semantic success.
- Stop if deployment is claimed from the local Mission 8 image evidence without the remote infrastructure proof.
- Stop if implementation grows an ontology, deterministic capture-to-workpiece reducer, typed fold, completion algebra, or generalized revision platform to handle the selected stratum.
- Stop and reassess observer re-entry only under the named strain below; do not add it by momentum.

## Carried evidence and rejected alternatives

- **Default retained:** one bounded foreground phase-boundary synthesis over the prior workpiece revision and newly mechanically captured reviewer evidence. Whole-workpiece synthesis already has a distinct, higher latency class than ordinary turns; measure it at the boundary rather than moving semantic work into every turn.
- **Observer/fold rejected by default:** no observer exists on the production path, and the current IR ruler has not tested successive observer revisions. The canonical promotion mechanics and extraction ladder live in [`MISSION.next.md`](../../MISSION.next.md#foreground-revision-and-observer-re-entry). Mission 7 is the decisive strain gate: re-entry is considered only after repeated consequential foreground blocking, loss of prior supported meaning, stale state, unrecoverability, or unavoidable unbounded-history dependence. An admitted observer still may not mutate the net, and its likely short-review barrier is a forced tail sweep/queue flush because the token threshold alone may never fire.
- **Recency overwrite rejected:** newer testimony may correct, qualify, coexist with, or conflict with earlier testimony. Time order alone is not authority.
- **Append-only journal rejected:** it preserves history but leaves excessive cold-reading and canonical-meaning burden; the observed workpiece intent is a maintained current account with retained revision history.
- **One artifact rejected:** immutable captures and editable semantic workpiece revisions have different lifecycles.
- **Deterministic typed fold rejected:** Condition 5's typed mapping plus in-loop model judgment caused minute-scale ordinary turns. Re-entry requires evidence that foreground synthesis cannot reliably preserve or classify meaning and that the narrower mechanism fixes the observed failure.
- **Full regeneration rejected as a visible patch claim:** an implementation may reconsider broader context internally only if the applied diff remains bounded and unrelated identities/behavior are proven stable; otherwise it must report widening or refuse.
- Mission 3 evidence establishes an accepted, cold-usable workpiece leg and one observed correction, but its construction leg failed 0-for-9 on nested provider-visible shape and produced a vacuous empty net. Mission 6 must retire that risk before this cluster treats patching as available.
- The v3 Flue composition comparison found packaged universal guidance more reliable for opening elicitation but exposed shared review routing as weak. Mission 4 owns the selected one-job-skill content repair; Mission 7 must consume its actual accepted review route rather than reopen topology by momentum.
