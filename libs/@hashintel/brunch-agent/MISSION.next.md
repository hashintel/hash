# Brunch future mission spine

> Forward plan and decision register only; not execution authority. [`MISSION.md`](MISSION.md) is the sole live mission contract. Detailed successor scope lives in linked drafts and becomes executable only after an owner-authorized cut replaces the root mission on its own branch. Historical contracts and evidence live in archives. The pre-subtraction planning spine remains inspectable at commit `5ab31705e43609da2ae4f1ce05b0cd6791c54094`.

## How to use this spine

Read this file to answer four questions:

1. What product boundary are we working toward?
2. What follows the live mission?
3. Which product choices need an owner or PM decision?
4. Which deeper draft or evidence record should be opened for a particular branch?

Keep one authoritative home for each kind of information:

- [`MISSION.md`](MISSION.md) — current imperative, throughline, proof, constraints, fog, stop lines and accepted deferrals.
- This spine — future sequence, cross-mission facts, scope strains, open product decisions and re-entry gates.
- [`docs/mission-drafts/`](docs/mission-drafts/) — detailed provisional successor contracts.
- [`docs/mission-archive/`](docs/mission-archive/) — accepted or closed mission contracts.
- `docs/evidence/` — observations, decisions, campaigns and implementation records.
- `CONTEXT.md` — stable project vocabulary.

State durable historical decisions here as present-tense facts only when they constrain future work. Use an archive or git history for the narrative of how they were reached.

## Product boundary

Brunch core owns universal, context-, domain-, editor- and formalism-independent elicitation semantics. A plugin pairs one reusable domain typology with one target formalism and owns that pairing's recognition, operations, coverage and verification guidance.

The first composed product is `process-sdcpn`: operational processes represented as stochastic dynamic coloured Petri nets in Petrinaut. “Operational process” includes organizational, software and cyber-physical operations. It does not include everything that can be expressed as a Petri net.

Brunch is intended to become Petrinaut's default operational-process assistant. Petrinaut's stock assistant remains an alternate selected by a host feature flag. Stock mode retains its canonical frontend tools and separate history; Brunch uses its own projected or adapted tool surface. The host must not splice histories, reinterpret prior tool calls across modes or make stock behavior depend on Brunch.

The accepted naming target is:

- Brunch agent identity and mount: `process-sdcpn` / `/agents/process-sdcpn/:id`.
- Petrinaut website route: `/api/brunch/:id`.
- Current implementation until a live mission authorizes migration: `/agents/chat/:instanceId` with the existing stored agent identity.

Adopting the target names requires an explicit migration or fresh-start decision. Naming alone authorizes neither persisted-state reset nor remote exposure.

## Product claim discipline

Every numbered product mission must make a visible advance that a product manager can exercise without developer vocabulary. State:

- one release-note sentence;
- one runnable product-manager script;
- what was impossible before;
- the named scenario and contract classes covered;
- the evidence level actually reached.

Keep these claims separate:

1. canonical mutation applied;
2. TypeScript code compiles;
3. model meaning corresponds to the workpiece;
4. executable behavior corresponds to the operation;
5. the result is useful to its intended consumer.

A flagship proves one accepted product path. It does not prove every operational process or every Petri net. “All scenarios” always means an explicitly named portfolio.

## Current and successor map

### Mission 7 — construct and explain an operational model

- Mission 7 tracks [FE-1573](https://linear.app/hash/issue/FE-1573/construct-and-explain-one-real-net-region-from-a-genuine-conversation) and partially advances [FE-1478](https://linear.app/hash/issue/FE-1478/provide-provenance-from-a-generated-net-back-to-the-requirements-graph) without closing the broader provenance objective.
- [Mission 7a](docs/mission-archive/7a-workpiece-construction-explanation-groundwork.md) established workpiece, construction-record and explanation groundwork and landed on `main`.
- [Mission 7b](docs/mission-archive/7b-ordinary-batched-construction-provenance.md) established the ordinary selected structural batch, correction, recorded basis/effects, reopen and experimental create-new seam. Its engineering [PR #9649](https://github.com/hashintel/hash/pull/9649) remains a separate external closeout.
- Live [Mission 7c](MISSION.md) owns the Inventory purchasing flagship, code-bearing operation admission, TypeScript compiler feedback and repair, ELK layout, reliable mechanical why routing, tool topology and Postgres-backed bundle copies.
- [After-demo construction and explanation evaluation](docs/mission-drafts/7-explainable-construction.md) owns broader cross-scenario quality, behavioral correspondence, explanation usefulness, provenance stress and lifecycle evaluation after a useful flagship exists.

Owner direction from 2026-09-11 requires the next reconciliation of live Mission 7c to make these points explicit:

- Inventory is the fully recorded flagship, while the same product path must remain usable across the named operational-process persona portfolio.
- A narrow golden path is insufficient. Every ordinary request inside the declared capability envelope must either succeed through canonical Petrinaut operations or refuse clearly without corruption, hidden omission or false success.
- Petrinaut TypeScript feedback for code-bearing functions and dependency changes is in scope; simulation-backed behavioral correctness is not.
- A realistic persona interview and native product construction recording are required.
- Brunch is the default process assistant and stock Petrinaut AI is the feature-flagged alternate with its existing frontend tools preserved.
- The assumption-based preview fork must be decided explicitly rather than disappearing through omission.

This direction is planning context until incorporated into `MISSION.md`; do not represent the live mission as reconciled before that review.

### Mission 8 successor

The application image, ECR/GHCR publication, fail-closed Flue Postgres support, content-free OpenTelemetry and private `/health` process probe have landed. Publication is not deployment.

[SRE-1013](https://linear.app/hash/issue/SRE-1013/provision-the-brunch-agent-ecs-service) owns ECS, RDS/IAM or password fallback, secrets, collector, restricted ingress and the deployment target. Tim owns that infrastructure work.

Cut a Mission 8 successor only when the resources exist. It must prove one authorized streamed turn through the actual product door, in-place and cross-host replacement, Postgres continuity, bounded provider/database failure, content-free telemetry, graceful drain and rollback. Keep `/health` private and allow the current `/agents/*` product route. Public identity, spend controls, retention, backup/restore and multi-replica ownership require separate authorization.

### Mission 9 — make projection repeatable

[Draft Mission 9](docs/mission-drafts/9-traceable-projection.md) follows immediately after the Mission 7 seam is dependable.

Its tracker projection is [FE-1438](https://linear.app/hash/issue/FE-1438/project-an-evidence-backed-workpiece-into-a-traceable-live-sdcpn); reconcile the issue title and body with the accepted Mission 7 seam before cutting live authority.

It owns:

- unchanged repeat without duplication or churn;
- changed input with a bounded and explained impact set;
- retirement and identity epochs;
- concurrent or hand-edited state that is imported or refused rather than overwritten;
- cross-revision provenance and current-state why;
- broader schema classes required by the selected operational-process portfolio;
- the stable capability surface left open by Mission 7.

Visible advance: ask Brunch to extend a process model, repeat the request without duplication, change one fact and observe only the justified region change.

### Mission 10 — revise meaning without collateral rebuilding

[Draft Mission 10](docs/mission-drafts/10-bounded-reviewer-revision.md) owns general reviewer authority after Mission 9 establishes repeatable projection.

Its tracker projection is [FE-1394](https://linear.app/hash/issue/FE-1394/revise-one-traceable-net-region-through-targeted-reviewer-elicitation).

It adds attributed reviewer evidence, correction, qualification, contextual coexistence, conflict, justified widening and refusal. A second person must be able to challenge one modelled fact and see a bounded, attributable revision while unrelated identities and behavior remain stable.

### Mission 11 — hand an accepted model to optimisation

[Draft Mission 11](docs/mission-drafts/11-optimisation-handoff.md) starts only after Chris and Yannis accept one concrete consumer contract: input artifact, optimization question, scenario/parameter representation, execution boundary, expected result and minimum credibility checks.

Its tracker projection is [FE-1503](https://linear.app/hash/issue/FE-1503/hand-one-accepted-sdcpn-to-an-optimisation-experiment).

Dynamics alone is not optimization readiness. Lightweight non-binding consumer discovery should occur before Mission 9 selects the region that later needs to become complete.

## PM scope-strain register

This register records product consequences, not every engineering idea. A scope strain stays here until it is admitted to a live mission, explicitly declined or assigned to a successor with a re-entry gate.

### Decisions to report or confirm now

- **Assistant scope — owner direction; PM communication required.** Brunch targets operational processes represented as SDCPNs, including organizational, software and cyber-physical operations. It is not a universal Petri-net copilot.
- **Assistant selection — owner direction; product implementation required.** Brunch is the default. Stock Petrinaut AI remains a feature-flagged alternate with its existing tool surface and separate history.
- **Simulation scenarios and metrics — likely out of Mission 7c; PM confirmation required.** TypeScript feedback does not imply simulation-product support.
- **Structured questions — likely out of Mission 7c; PM confirmation required.** Free-text conversation remains the product route; choice widgets and questionnaires require a separately cut vertical capability.
- **Assumption-based preview — open product fork.** Decide whether Brunch may offer a provisional model when evidence is incomplete. Recommended default: evidence-first, explicit user assent, visible assumptions, and later confirm/replace/reject behavior.
- **Second worked-model bundle — stretch.** Inventory is the completion gate. Add another polished bundle only if capacity permits or PM makes portfolio breadth part of acceptance.
- **Behavioral evidence — explicit non-claim for Mission 7c.** Compiler-clean code can still implement the wrong process. Simulation-backed checking belongs to later evaluation unless PM raises the evidence tier.

### Capability and lifecycle strains

- **Mutation/editing envelope — resolve in Mission 7c.** Build a capability matrix from the named operational-process portfolio. Admit and test the canonical add/update/remove classes that ordinary construction and correction require. Unsupported requests must refuse visibly; one scripted success cannot define support.
- **Named-case portability — resolve in Mission 7c.** Inventory is the only full flagship recording. Reusable guidance and execution must also remain usable across the operational-process packs under [`evaluations/cases/`](evaluations/cases/): Vestera Scheduling, Data Centre Thermal Operations, Industrial Gas VMI, Pharma Cold Chain, Semiconductor Fab Operations and Truck Fleet Maintenance. Exercise the same path at the level needed to reveal each distinct capability class; these packs do not automatically become polished bundles.
- **Repeat/change/retirement/concurrency — Mission 9.** Mission 7c should leave stable IDs, fresh-base discipline, ordinary correction and current-state why as a usable handoff.
- **General reviewer revision — Mission 10.** Mission 7c's ordinary correction does not establish reviewer authority, qualification, conflict handling or general patch locality.
- **Optimization handoff — Mission 11.** Do not infer an optimization product from code-bearing dynamics.

### Conditional technical strains

- **Compaction survival.** Long conversations may compact old turns that provenance and `brunch_why` still need. If the realistic flagship crosses compaction, Mission 7c must prove reopen, current-workpiece recovery and why after compaction. Otherwise disclose uncompacted-history dependence and prove the product path before Mission 9 or a long-lived hosted claim.
- **Passage identity across revisions.** Mission 7c must cite the correct current revision and refuse missing or ambiguous provenance. Rename/move/paraphrase/split/merge/delete/reintroduce continuity belongs to Mission 9/10.
- **Arbitrary import/clone.** Mission 7c owns its selected Postgres template-to-owned-copy path, not a general importer, attachment rebinder or complete effect-history migration. Re-enter only for a named portability consumer.
- **Provider migration — unallocated; Lu owns assignment.** Re-enter when a provider change is proposed or the current provider cannot reliably carry the named portfolio. Compare canonical tool-schema carriage, tool selection, argument acceptance, compiler-repair behavior, latency and cost on representative cases. Provider success does not establish semantic or behavioral correctness.

### External-owner strains

- **Hosted deployment — Tim / SRE-1013.** Mission 7 may use local Postgres without implying hosted readiness.
- **Voice — Kostandin.** Direct spoken-user attribution after hydration, durable recovery of withheld post-settlement browser work, comparative latency and a typed/Voice/stopped-entry reopen witness remain outside Mission 7c.
- **Guidance policy remediation — FE-1652.** HASH-policy alignment proceeds independently and does not become Mission 7 acceptance.

## Open product forks

### Assumption-based preview

Candidate interaction:

1. Brunch reaches a consequential evidence gap.
2. It offers to build a provisional preview using clearly labelled assumptions.
3. The user explicitly assents.
4. The workpiece, model explanation and provenance distinguish assumptions from testimony.
5. Later evidence confirms, replaces or rejects each assumption.

The deciding PM questions are when Brunch may offer preview, what assent authorizes, which assumptions are acceptable, how provisional content appears in the UI and what review turns it into accepted meaning.

### Host choice and continuity

The initial product should select an assistant at session start. Mid-conversation switching is not a history-splicing operation and requires an explicit continuity contract before admission.

Resolve:

- where the stock-alternate feature flag is controlled;
- whether users see a picker or a deployment-level choice;
- how an existing net chooses or resumes the correct assistant history;
- what happens when a feature flag changes after a conversation exists.

### Structured questions

Conversation remains primary. Re-enter structured questions only for a named interaction that free text handles poorly.

The capability must cross model → binding → transport → frontend → correlated reply → resumed model turn and preserve free-text fallback, cancellation, redirect, replay and stock-assistant isolation. A rendered widget or model tool call alone is not proof.

### Source consultation and external ledgers

Brunch prepares an evidence-backed Markdown account for external authorities; it does not become a universal claims ledger. A first source tool must preserve source identity, authorship and the person's standing toward consulted material without treating URLs or tool-result IDs as true-user messages.

The claims, Gherkin and Dafny packages are design probes for other domain-typology/formalism pairs. They are not mounted product capabilities or evidence that Brunch supports multiple formalisms.

### Universal elicitation teaching

Core retains purpose-relative source-side elicitation: objective, audience, boundary, horizon, accuracy, non-claims, assumption tolerance, evidence, inference, unknowns, conflict, correction, omission and loss. Candidate question tactics or typed epistemic machinery enter only when repeated observed failures earn them.

The inferential observer remains unplanned. Foreground phase-boundary synthesis is the default until repeated blocking, meaning loss, stale state, compaction failure or unavoidable unbounded history establishes a concrete consumer and oracle.

### Workpiece shape

Markdown remains the recoverable semantic account. A cold reader must be able to reconstruct the objective and operation, distinguish evidence from inference and assumption, find conflicts and unresolved matters, and identify the smallest consequential construction gap.

Typed claims, closed slots, per-statement epistemic enums or a target-shaped workpiece re-enter only if repeated cold-reading or projection failures show that the Markdown account cannot preserve or retrieve consequential meaning. Do not introduce them merely to make completion mechanically enumerable.

### Review-to-elicitation continuation

Immediate switching from a review or gap report into renewed elicitation remains unimplemented. Re-enter when a real review must continue immediately or repeated gap-only reports create visible user friction. Preserve the ability to report a gap without automatically starting an interview.

### Voice after the live transport cut

Kostandin owns the current Voice continuation. The accepted path covers microphone input, mutation, resume and durable Stop. Direct spoken-user attribution after hydration, durable recovery of locally withheld post-settlement browser work and comparative latency remain unproved.

Before a mission claims Voice plus exact resume or broad pre-release continuity, run one reproducible product scenario containing typed-origin and Voice-origin messages and a durably stopped assistant entry. After reopening, verify per-message origin and stopped presentation, and distinguish local Exit voice mode from durable Stop.

## Standing architecture

- Flue history is the canonical conversation log.
- The Markdown workpiece is the recoverable semantic account and projection input.
- Petrinaut owns canonical model schemas, mutations, commands, parsing, compilation and simulation.
- Constructor-declared basis plus observed mutation effects records why model content changed.
- Lineage records what happened; declared basis records the constructor's stated reason; neither proves semantic truth.
- Generated, sanitized, migrated and layout effects do not automatically inherit operational testimony.
- One model-facing agent owns the conversation. Bindings, transports and hosts adapt that agent without creating a second history or protocol.
- Core owns universal elicitation; plugins own domain-typology/formalism guidance; the app owns composition; the Petrinaut website owns browser execution and assistant selection.
- HASH Graph, Temporal, Redis, HASH API, S3, Kratos and Petrinaut Optimizer are not Brunch runtime dependencies without a named consumer.

Retain the thin architecture unless observed product strain earns more. Do not introduce a comprehensive process ontology, graph database, universal subject/predicate/value schema, deterministic conversation reducer, full regeneration engine, typed completion algebra, second event log or general multi-agent system as speculative infrastructure.

## Detailed planning homes

- [After-demo construction and explanation evaluation](docs/mission-drafts/7-explainable-construction.md) — cross-scenario acquisition/conservation/construction quality, behavioral correspondence, explanation usefulness, provenance stress and lifecycle breadth.
- [Mission 9](docs/mission-drafts/9-traceable-projection.md) — repeat, change, retirement, concurrency, expanded schema classes and current-state explanation.
- [Mission 10](docs/mission-drafts/10-bounded-reviewer-revision.md) — reviewer authority, attributed revision, conflict, qualification, bounded patching and refusal.
- [Mission 11](docs/mission-drafts/11-optimisation-handoff.md) — consumer-accepted complete-model handoff and optimization experiment.
- [Mission-draft lifecycle and template](docs/mission-drafts/README.md) — rules for converting a provisional cluster into live authority.

Open a detailed draft only when cutting or evaluating that branch. Re-read actual predecessor evidence at cut time; draft promises are not inherited proof.

## Re-entry gates

- **Broader operational-process portfolio:** name the cases and new capability classes before claiming breadth.
- **Behavioral checking:** select one workpiece-derived expectation that execution can discriminate more cheaply than human inspection.
- **Compaction:** exercise it on the real product path before claiming long-lived exact provenance.
- **Arbitrary portability:** name the import/export/clone consumer and the identities, attachments and histories it needs preserved.
- **Structured questions:** identify a free-text interaction failure and prove the full correlated-reply vertical.
- **Observer or automatic fold:** show repeated foreground failure and preserve attribution, revision atomicity and ordinary-turn latency.
- **Public release:** establish trusted identity, authorization, spend/rate controls, retention, backup/restore, telemetry, rollback and ownership.
- **Multi-replica:** prove active ownership and replacement overlap; shared Postgres alone is insufficient.
- **New formalism pair:** identify a real user job, accepted target artifact, checks and a product route; paper plugins do not qualify.
- **Provider migration:** name the target provider and run the representative schema, selection, repair, latency and cost comparison before changing the production default.

## Historical and evidence pointers

Use these records for rationale without restoring their chronology to this spine:

- [Provenance and tooling decision log](docs/evidence/design/provenance-and-tooling-decision-log-2026-09-04.md)
- [Provenance-by-lineage mini spec](docs/evidence/design/provenance-by-lineage-mini-spec-2026-09-04.md)
- [Independent provenance review](docs/evidence/design/provenance-by-lineage-independent-review-2026-09-04.md)
- [Follow-up provenance review](docs/evidence/design/provenance-by-lineage-follow-up-review-2026-09-04.md)
- [Mission 4 accepted architecture](docs/mission-archive/4-owner-led-runbook-and-workpiece-redesign.md)
- [Mission 6 resumable workpiece archive](docs/mission-archive/6-resumable-workpiece-petrinaut.md)
- [Mission 7a archive](docs/mission-archive/7a-workpiece-construction-explanation-groundwork.md)
- [Mission 7b archive](docs/mission-archive/7b-ordinary-batched-construction-provenance.md)

### 2026-09-04 provenance replanning migration disposition

Provenance uses Flue lineage, settled workpiece revisions, constructor-declared mutation basis and observed effects. Capture envelopes and retrospective hand-authored derivation records are not the product seam. The decision log and mini spec above preserve the migration rationale and rejected alternatives.

The old six-beat FE-1476 presentation sequence and earlier delivery dates are historical framing, not current schedule or acceptance authority. The application image being published or returning HTTP 200 is not evidence that Brunch is deployed, durable or publicly safe.
