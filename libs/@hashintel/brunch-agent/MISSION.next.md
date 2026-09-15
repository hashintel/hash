# Brunch future mission spine

> Future sequence and decision register only; not execution authority. [`MISSION.md`](MISSION.md) owns live scope and progress. Successor drafts become executable only after an owner-authorized cut; archives and git history retain prior contracts.

## How to use this spine

Read this file to answer four questions:

1. What product boundary are we working toward?
2. What follows the live mission?
3. Which product choices need an owner or PM decision?
4. Which deeper draft or evidence record should be opened for a particular branch?

Keep one authoritative home for each kind of information:

- [`MISSION.md`](MISSION.md) — current contract, progress dispositions, next action and accepted deferrals.
- This spine — future sequence, cross-mission facts, scope strains, open product decisions and re-entry gates.
- [`docs/mission-drafts/`](docs/mission-drafts/) — detailed provisional successor contracts.
- [`docs/mission-archive/`](docs/mission-archive/) — accepted or closed mission contracts.
- [`docs/evidence/`](docs/evidence/README.md) — retained conclusions and reusable evidence under its retention rules; implementation results stay in code, tests, native records and the PR.
- `CONTEXT.md` — stable project vocabulary.

State durable historical decisions here as present-tense facts only when they constrain future work. Use an archive or git history for the narrative of how they were reached.

## Product boundary

Brunch core owns universal, context-, domain-, editor- and formalism-independent elicitation semantics. A plugin pairs one reusable domain typology with one target formalism and owns that pairing's recognition, operations, coverage and verification guidance.

The first composed product is `process-sdcpn`: operational processes represented as stochastic dynamic coloured Petri nets in Petrinaut. “Operational process” includes organizational, software and cyber-physical operations. It does not include everything that can be expressed as a Petri net.

Brunch is intended to become Petrinaut's default operational-process assistant. Petrinaut's stock assistant remains an alternate selected by a host feature flag. Stock mode retains its canonical frontend tools and separate history; Brunch uses its own projected or adapted tool surface. The host must not splice histories, reinterpret prior tool calls across modes or make stock behavior depend on Brunch.

For live route and assistant-selection behavior, see [mission ownership constraints](MISSION.md#authority-and-ownership). Future deployment policy and remote switching are the [host-choice fork](#host-choice-and-continuity).

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
- [Mission 7c](docs/mission-archive/7c-browser-persona-construction.md) landed on `main` through [PR #9667](https://github.com/hashintel/hash/pull/9667), with browser-visible persona construction and verified repairs. The Inventory worked example remains unaccepted; Mission 7d now builds directly on `main`, without replaying 7c's pre-squash history.
- Live [Mission 7d](MISSION.md) owns worked-example demo completion, persona/model options, interaction refinements and configuration-only experiments; consult its [Status](MISSION.md#status) and [readiness dispositions](MISSION.md#readiness-gate). Lu authorized FE-1573 reuse without a tracker state change.
- Its tooling-context remediation is closed; the [projection contract and regression owners](docs/reference/architecture/flue-routing.md#model-context-projection) retain the lasting constraints, while [Mission 7d](MISSION.md#readiness-gate) owns live acceptance. The temporary side quest is removed without promoting synthetic original-store recovery into fixture portability, general history consolidation, semantic acceptance or live-provider reliability.
- A second documentation-only side quest (2026-09-15) diagnosed the `run-5uSidX` construction stall as policy arbitration under perceived action cost with an unbounded settlement trigger, and its bounded settlement lifecycle was promoted into Mission 7d's guidance recut (WP-F.4). A mechanical overdue-settlement signal and an enforceable disposition gate remain a remedy ladder that re-enters only on a real-model failure after the guidance change; the diagnosis packet is retained in git history and the PR.
- Mission 7d's remediation (WP-A–F) closed with the `run-SB5pgx` observation: one Ledger upload per revision with text-cited evidence, no stall across 102 submissions, and a live compaction crossing with continued construction. Latency improved but is not demo-scale; the remaining strain (whole-Ledger regeneration per revision, retained `read_petrinaut_net` bodies, Ledger collapse) is owned by [draft 7e](docs/mission-drafts/7e-ledger-patch-and-net-observation-economy.md), the next cut after 7d's review.
- [After-demo construction and explanation evaluation](docs/mission-drafts/7-explainable-construction.md) owns broader cross-scenario quality, behavioral correspondence, explanation usefulness, provenance stress and lifecycle evaluation after a useful flagship exists.

**7d cut audit, 2026-09-14:** compared the parent contract with its archive and the affected future drafts. The archived owner decisions and contract are unchanged except relative-link rebasing; open example gates transfer without acceptance, while distribution/breadth and wider lifecycle obligations retain their planning homes. Checked all 220 relative file/heading links across the nine changed Markdown files, required mission sections and whitespace. This verifies the documentation cut, not product behavior or upstream API suitability.

**7d topology remediation close audit, 2026-09-14:** the disconnected capture/archive lane and
consumerless runbook files are removed; the still-consumed ask contract is active under core
`conversation/`; the Linear graph utility is parked; package direction and source/test separation
are mechanically checked; library externals follow their manifests. The architecture negative
control, affected Brunch integration tests, library gates, bundle inspection, formatting, and
targeted website ask consumers pass. The website's full unit gate remains independently red in the
Voice browser-tools test because Monaco reads a missing `CSS.escape`; it fails unchanged outside
this remediation's paths and is not treated as topology proof.

### Beyond the demo — distribution and portfolio breadth, unscheduled

The [future draft](docs/mission-drafts/worked-example-distribution-and-breadth.md) consumes an accepted original example. It owns fixture extraction/distribution, connected-bundle copying and tiered portfolio breadth, including their carried capability gaps and proof obligations. These are deferred beyond the demo, not automatically next after Mission 7d. Numbering, priority, issue and branch assignment remain for an owner-authorized cut; collecting readable review artifacts does not activate this scope.

### Mission 8 successor

The application image, ECR/GHCR publication, fail-closed Flue Postgres support, content-free OpenTelemetry and private `/health` process probe have landed. Publication is not deployment.

[SRE-1013](https://linear.app/hash/issue/SRE-1013/provision-the-brunch-agent-ecs-service) owns ECS, RDS/IAM or password fallback, secrets, collector, restricted ingress and the deployment target. Tim owns that infrastructure work.

Cut a Mission 8 successor only when the resources exist. It must prove one authorized streamed turn through the actual product door, in-place and cross-host replacement, Postgres continuity, bounded provider/database failure, content-free telemetry, graceful drain and rollback. Keep `/health` private and allow the current `/agents/*` product route. Public identity, spend controls, retention, backup/restore and multi-replica ownership require separate authorization.

### Mission 9 — make projection repeatable

[Draft Mission 9](docs/mission-drafts/9-traceable-projection.md) follows the [distribution and breadth successor](docs/mission-drafts/worked-example-distribution-and-breadth.md).

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

Mission 7d brings forward upstream API assessment and in-memory experiment configuration only. Reconcile the draft with that evidence at cut time; configuring an experiment does not prove execution, credible results or consumer acceptance.

Its tracker projection is [FE-1503](https://linear.app/hash/issue/FE-1503/hand-one-accepted-sdcpn-to-an-optimisation-experiment).

Dynamics alone is not optimization readiness. Lightweight non-binding consumer discovery should occur before Mission 9 selects the region that later needs to become complete.

## PM scope-strain register

This register records product consequences, not every engineering idea. A scope strain stays here until it is admitted to a live mission, explicitly declined or assigned to a successor with a re-entry gate.

### Decisions to report or confirm now

- **Assistant scope — PM communication required:** communicate the accepted [product boundary](MISSION.md#product-boundary).
- **Assistant deployment policy — future owner decision:** resolve the [host-choice fork](#host-choice-and-continuity).
- **Live exclusions:** [MISSION.md](MISSION.md#scope-boundary-and-external-owners) settles the current boundary; [distribution and breadth](docs/mission-drafts/worked-example-distribution-and-breadth.md) owns the deferred portfolio and bundle scope. These are not pending confirmations here.
- **Assumption-based preview — open PM decision:** the candidate policy and unanswered questions have one home in the [live Fog-line](MISSION.md#fog-line).
- **Behavioral evaluation:** use the [after-demo draft](docs/mission-drafts/7-explainable-construction.md); the live mission's [claim discipline](MISSION.md#claim-discipline) determines its evidence tier.

### Capability and lifecycle strains

- **Capability and portfolio obligations:** [Mission 7d](MISSION.md#proof) owns the selected run's evidence; [distribution and breadth](docs/mission-drafts/worked-example-distribution-and-breadth.md#outcome-2--establish-portfolio-breadth) owns breadth and full-envelope adjudication.
- **Repeat/change/retirement/concurrency — Mission 9.** Mission 7's accepted example should leave stable IDs, fresh-base discipline, ordinary correction and current-state why as a usable handoff.
- **General reviewer revision — Mission 10.** The example's ordinary correction does not establish reviewer authority, qualification, conflict handling or general patch locality.
- **Optimization handoff — Mission 11.** Do not infer an optimization product from code-bearing dynamics.

### Conditional technical strains

- **Compaction survival:** consume the live mission's [compaction disposition](MISSION.md#readiness-gate) before Mission 9 or a long-lived hosted provenance claim. Bounded synthetic projection, exact reread and two-element provenance now survive split/compaction/fold and fresh-process reopen without canonical/public loss or tool replay. Re-enter for the accepted live worked example and for any broader claim about semantic usefulness, provider fidelity, power loss, import/relocation or general truncation recovery.
- **Passage identity across revisions:** rename/move/paraphrase/split/merge/delete/reintroduce continuity belongs to Mission 9/10; consume the live mission's current-revision evidence without inferring continuity.
- **Arbitrary import/clone:** re-enter general import, attachment rebinding or complete effect-history migration only for a named portability consumer; the planned fixture-copy boundary is defined in the [successor draft](docs/mission-drafts/worked-example-distribution-and-breadth.md#connected-bundle-contract).
- **Ordinary-document cross-browser continuity — deferred beyond the demo (Lu, 2026-09-14):** the editable net is browser-local (`petrinaut-sdcpn`), with document/incarnation and conversation association separate from the principal ID. Copying only the principal ID into another browser does not restore the net or its conversation association; Flue's retained mutation snapshots are evidence, not automatic document restoration. See [local document storage](../../../apps/petrinaut-website/src/main/app/local-storage-demo/use-local-storage-sdcpns.ts) and [process binding](../../../apps/petrinaut-website/src/main/app/local-storage-demo/assistants/brunch/use-process-agent-binding.ts). Re-enter for a named cross-browser reopening or recovery consumer, independently of fixture distribution and model-context reduction. Require a second-browser witness recovering the same editable net, workpiece, conversation and valid provenance without replaying mutations; original-profile reopening alone does not establish portability.
- **Provider qualification — Mission 7d:** the [live contract](MISSION.md) owns model/effort/fallback choices and recovery for the demo. A general routing framework and portfolio-wide provider comparison remain deferred; re-enter those only for a named broader consumer. Before changing a production default, compare canonical schema carriage, tool selection/arguments, compiler repair, latency and cost on that consumer's representative cases. Provider success does not establish semantic or behavioral correctness.
- **Persona evaluation file placement — after Mission 7d:** reconsider moving `install-faux-provider.ts`, `schema-carrier-probe.ts`, and `launch.test.ts` from production-shaped paths into test-owned placement only after Mission 7d's persona and tool-naming changes land. They remain in place while the live mission edits and names them as oracles; re-homing must preserve spawn-by-path behavior and the launch contract.
- **Shared history interpretation — carried from 7c:** consolidation of verifier/history walks remains deferred, distinct from the completed [model-context remediation](docs/reference/architecture/flue-routing.md#model-context-projection). Re-enter if duplicate interpretation diverges or a named consumer needs consolidation. Shared interpretation of canonical Flue history is the contract, not a predetermined module. Require parity checks before extraction; keep projections recomputable and unpersisted, with no new identities, reordered history, hidden live-net input, ambiguous-record repair or second authority. Keep separate walks if those constraints cannot hold.
- **Question marker retired — Voice owner (Lu, 2026-09-15):** `brunch_mark_question` is removed on the live mission's branch, with Kostandin's confirmation, after `run-5uSidX` showed it consuming 85 of 123 tool calls and one extra full-prompt model step per reply; the voice path derives its question segment client-side from the finalized assistant text of the turn, with legacy `data-brunch-question` parts tolerated as inert on hydration. The [live mission](MISSION.md#work-packages) owns the retirement contract and fixtures. Re-enter only if Voice needs a narrower segment than the whole finalized text; that is Kostandin's call to raise with Lu, not a marker revival, and a server-emitted marker is not the default path back.
- **Patch-style workpiece mutation — re-entered, [draft 7e](docs/mission-drafts/7e-ledger-patch-and-net-observation-economy.md):** Mission 7d reduced duplication to one full body per revision through tool defaults and model-context projection; `run-SB5pgx` then showed that one body still costs a median 22 s settlement and that the model collapses the Ledger under whole-document regeneration — a cost-driven choice, proven from the run's retained reasoning summaries. Lu's order of attack: a server-side shrink guard plus guidance rule first, paired with the net-observation economy; section-keyed operations second, promoted only if the guarded whole-body upload still blocks demo scale. The draft owns both stages under the same revision, evidence and recovery contract as full resubmission; a patch must not become a second document authority.
- **Net-observation economy — [draft 7e](docs/mission-drafts/7e-ledger-patch-and-net-observation-economy.md):** retained `read_petrinaut_net` bodies were about 40% of the pre-compaction prompt in `run-SB5pgx`; layout is a minor share, the bulk is arcs and `lambdaCode`. The draft owns projection dedupe of superseded net reads and a compact model rendering without layout, keeping the observation identity (`toolCallId`, `sha256`) that `mutate_petrinaut_net` requires.
- **Live tool-call channel fan-out — Tim / hosted:** the live mission's pending-tool side channel is in-memory, single-process and ephemeral, fed by Flue `observe()` and merged client-side. Re-enter multi-process fan-out only for a hosted multi-instance deployment; its absence is a deployment limitation, not a hosted-readiness claim, and does not authorize persisting speculative tool state or an upstream Flue change.

### External-owner strains

- **Hosted deployment — Tim / SRE-1013.** Mission 7 may use local Postgres without implying hosted readiness.
- **Voice — Kostandin.** Direct spoken-user attribution after hydration, durable recovery of withheld post-settlement browser work, comparative latency and a typed/Voice/stopped-entry reopen witness remain outside the worked-example mission.
- **Guidance policy remediation — FE-1652.** HASH-policy alignment proceeds independently and does not become Mission 7 acceptance.

## Open product forks

### Host choice and continuity

Ordinary website documents select an assistant through the implemented host-local preference. Mid-conversation switching is not a history-splicing operation and requires an explicit continuity contract before broader admission.

Switching inside a remote worked-model document is deferred. Re-enter only after accepting a stock-history continuity contract that determines whether stock history on remote documents is local-only, remote, or absent.

Resolve:

- where deployment policy controls the stock alternate;
- whether deployments preserve the current picker or choose one assistant;
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
- Document-lifecycle roles and worked-model terms live in [`CONTEXT.md`](CONTEXT.md#document-lifecycle); copy requirements and known limitations live in the [distribution draft](docs/mission-drafts/worked-example-distribution-and-breadth.md#connected-bundle-contract).
- Browser-local preferences and document records currently use the website's narrow `usePersistedState` boundary so reads begin after commit and writes stay outside React state updaters. FE-1713 already added a cross-tab `storage` subscription inside that primitive and its follow-up added same-document adoption in the host, so one stated re-entry condition has fired; the remaining ones are persisted state shared across repositories, migration, or the boundary growing beyond isolated values. Compare an explicit application dependency such as Zustand with the retained primitive at that gate; never depend on Zustand only because React Flow supplies it transitively.
- HASH Graph, Temporal, Redis, HASH API, S3, Kratos and Petrinaut Optimizer are not Brunch runtime dependencies without a named consumer.

Retain the thin architecture unless observed product strain earns more. Do not introduce a comprehensive process ontology, graph database, universal subject/predicate/value schema, deterministic conversation reducer, full regeneration engine, typed completion algebra, second event log or general multi-agent system as speculative infrastructure.

## Detailed planning homes

- [Worked-example distribution and portfolio breadth](docs/mission-drafts/worked-example-distribution-and-breadth.md) — deferred beyond the demo, with no automatic next-mission priority; consumes an accepted original example before delivering reusable copies and proving broader construction capability.
- [Draft 7e — Ledger patching and net-observation economy](docs/mission-drafts/7e-ledger-patch-and-net-observation-economy.md) — section-keyed Ledger operations, net-read projection dedupe and compact rendering, refusal-recovery guidance, tool-row lifecycle colour, and the engineering items carried from Mission 7d's review; the next cut after 7d.
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
- [Mission 7c archive](docs/mission-archive/7c-browser-persona-construction.md)

### 2026-09-04 provenance replanning migration disposition

Provenance uses Flue lineage, settled workpiece revisions, constructor-declared mutation basis and observed effects. Capture envelopes and retrospective hand-authored derivation records are not the product seam. The decision log and mini spec above preserve the migration rationale and rejected alternatives.

The old six-beat FE-1476 presentation sequence and earlier delivery dates are historical framing, not current schedule or acceptance authority. The application image being published or returning HTTP 200 is not evidence that Brunch is deployed, durable or publicly safe.
