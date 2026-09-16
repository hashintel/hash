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
- [Mission 7c](docs/mission-archive/7c-browser-persona-construction.md) landed on `main` through [PR #9667](https://github.com/hashintel/hash/pull/9667), with browser-visible persona construction and verified repairs. The Inventory worked example remained unaccepted.
- [Mission 7d](docs/mission-archive/7d-complete-worked-example-demo-and-configure-experiment.md) closed for engineering review at Lu's 2026-09-16 branch transition, with its implementation in [PR #9722](https://github.com/hashintel/hash/pull/9722). WP-A–F established one-upload Ledger settlement with text-cited evidence, model-only context projection, live tool visibility and a compaction-crossing construction run; connected-model usefulness, correction, explanation, reopen and experiment acceptance remained unadjudicated. Lu authorized FE-1573 reuse without a tracker state change.
- The 7d tooling-context remediation is closed; the [projection contract and regression owners](docs/reference/architecture/flue-routing.md#model-context-projection) retain its lasting constraints. Its documentation-only stall side quest was consumed by the bounded settlement lifecycle in WP-F.4; the mechanical overdue-settlement remedy re-enters only if a later real-model run reproduces the stall.
- [Mission 7e](MISSION.md) is closed for engineering review as a partial, not accepted or product-scalable. It established an abrupt-loss guard, net-read projection economy and bounded idle recovery, then `run-1L2zTl` met the successor discriminator: whole-body regeneration still permitted cumulative contraction and evidence loss, reached compaction pressure, and could not answer a final current-basis provenance question through a verified chain. Proportional workpiece operations with stable provenance require a separate owner-accepted recut.
- [Worked-example semantic close after 7e](#worked-example-semantic-close-after-7e) keeps Mission 7d's unadjudicated product bar. [After-demo construction and explanation evaluation](docs/mission-drafts/7-explainable-construction.md) owns broader cross-scenario quality, behavioral correspondence, explanation usefulness, provenance stress and lifecycle evaluation after a useful flagship exists.

**7d cut audit, 2026-09-14:** compared the parent contract with its archive and the affected future drafts. The archived owner decisions and contract are unchanged except relative-link rebasing; open example gates transfer without acceptance, while distribution/breadth and wider lifecycle obligations retain their planning homes. Checked all 220 relative file/heading links across the nine changed Markdown files, required mission sections and whitespace. This verifies the documentation cut, not product behavior or upstream API suitability.

**7d topology remediation close audit, 2026-09-14:** the disconnected capture/archive lane and
consumerless runbook files are removed; the still-consumed ask contract is active under core
`conversation/`; the Linear graph utility is parked; package direction and source/test separation
are mechanically checked; library externals follow their manifests. The architecture negative
control, affected Brunch integration tests, library gates, bundle inspection, formatting, and
targeted website ask consumers pass. The website's full unit gate remains independently red in the
Voice browser-tools test because Monaco reads a missing `CSS.escape`; it fails unchanged outside
this remediation's paths and is not treated as topology proof.

### Worked-example semantic close after 7e

Mission 7d's engineering branch closed without accepting the Inventory worked example. Mission 7e made the long-run path useful but not load-bearing. Re-enter this product bar only after a separately cut Ledger successor restores scalable settlement and verified current-basis provenance; an owner must still recut or explicitly re-admit the remaining work before claiming the flagship complete:

- Lu reviews one connected, operationally coherent Inventory model against the actual testimony and workpiece.
- Native history and before/after records show a model-originated bounded correction without unrelated rebuilding, with clean exact-version diagnostics and a legible final net.
- Two consequential elements receive positive explanations backed by current workpiece passages, native mutation attempts and session testimony.
- A fresh-start browser-visible persona run retains ordinary elicitation, repeated Ledger settlement, Brunch-originated construction, repair, layout, explanation and correction without private actor material crossing except through persona utterances.
- The original document and conversation reopen from their own stores, recover the final net and Ledger, and answer a current-basis question without mutation replay; any compaction dependence is disclosed and exercised where crossed.
- Lu reviews panel attention, layout, direct prose and model/persona behavior. Earlier-run review artifacts remain run-labelled critique copies, not reusable fixtures.
- Configuration-only experiment work resumes only after Chris's lifecycle, presentation, objective/constraint, units, scenario and metric contract can represent the workpiece faithfully without triggering execution. [Draft Mission 8](docs/mission-drafts/8-experiment-configuration-from-the-ledger.md) is the one home for that assessment: HEAD terrain, the consolidated 7d/11 planning record, the Ledger-to-experiment correspondence, the recommended configure-then-user-runs design and its single upstream dependency (constraint carriage on the AI request), and the pending owner input.
- Provider/fallback and cross-provider history continuity remain bounded questions for the selected product path, not authorization for a general routing framework.

The exact historical dispositions and oracles remain in the [Mission 7d archive](docs/mission-archive/7d-complete-worked-example-demo-and-configure-experiment.md#readiness-gate). This spine is the future owner; the archive is evidence, not execution authority.

### Section-keyed Ledger operations after Stage 1

The re-entry condition is met. In `run-1L2zTl`, Stage 1 blocked two abrupt losses and delayed compaction beyond minute 30, but accepted revisions cumulatively contracted from 33,876 to 10,487 characters without a retraction, current-revision evidence relations fell from 26 to four, cached context reached 254,677 tokens, and a final `query_workpiece` explanation could not reconcile the visible place to a verified construction chain. Lu closed Mission 7e as a non-scalable engineering partial. Recut a successor before implementation; this spine is not execution authority.

Replace whole-body `mutate_workpiece` input rather than adding a dual path. Begin by testing a bounded list of section-keyed operations (`replaceSection`, `insertSection`, `removeSection`; first revision may use an explicit whole-body creation form), reconstruct one complete Markdown body server-side, compute the existing sha256, resolve text-cited evidence against that body, persist the existing revision shape and return one identity. The reconstructed Markdown remains the sole workpiece; operations never become a second document authority.

Proportional input is necessary but insufficient. An edit to one section must deterministically retain evidence on untouched passages even when insertions above them shift absolute UTF-16 spans; unrelated claims must not lose support merely because the reconstructed body moved them. Preserve source identity and locator correctness without turning operations into a second authority. Separately, a current observed net must remain explainable after layout or another recorded structural change: record or reconcile those changes so `query_workpiece` can reach the declared construction basis rather than falling back to an untrusted structural explanation.

Start with the stable heading structure already taught by the Ledger template. Unknown or ambiguous headings refuse with the current heading list; reorient to heading paths or server-issued section ids only if the faux/product route shows ordinary heading keys are unreliable. Line diffs and anchor-quote patches remain rejected because exact-quote fragility is already observed in evidence refusals.

The recovery source is deliberately unresolved. `history-retention`, not preference, chooses whether the successful output, persistent state or both carry the reconstructed body. Stop if canonical records alone cannot reconstruct every revision and validated locator after fold and fresh-process reopen; do not add a full-body fallback. Required proof includes operation/full-replacement sha256 equivalence, all current text-evidence cases over reconstructed bodies, unambiguous duplicate-heading behavior, explicit lossy removal, unaffected-evidence preservation under insert/replace/remove above and beside cited passages, current-basis explanation after recorded layout, and create/fold/reopen recovery.

### Beyond the demo — distribution and portfolio breadth, unscheduled

The [future draft](docs/mission-drafts/worked-example-distribution-and-breadth.md) consumes an accepted original example. It owns fixture extraction/distribution, connected-bundle copying and tiered portfolio breadth, including their carried capability gaps and proof obligations. These are deferred beyond the demo, not automatically next after Mission 7d. Numbering, priority, issue and branch assignment remain for an owner-authorized cut; collecting readable review artifacts does not activate this scope.

### Hosted deployment successor

The application image, ECR/GHCR publication, fail-closed Flue Postgres support, content-free OpenTelemetry and private `/health` process probe have landed. Publication is not deployment.

[SRE-1013](https://linear.app/hash/issue/SRE-1013/provision-the-brunch-agent-ecs-service) owns ECS, RDS/IAM or password fallback, secrets, collector, restricted ingress and the deployment target. Tim owns that infrastructure work.

Cut the hosted deployment successor (the follow-on to the historical deployment Mission 8, which stopped at the application boundary) only when the resources exist. It must prove one authorized streamed turn through the actual product door, in-place and cross-host replacement, Postgres continuity, bounded provider/database failure, content-free telemetry, graceful drain and rollback. Postgres continuity includes the two live items in the [persistence-split strain](#conditional-technical-strains): the worked-model `createTables` sequence that runs at every boot must be exercised against a pre-existing schema, not only a dropped one, and conversation-store behavior under Flue's Postgres dialect must be witnessed on the product path rather than inferred from the SQLite development default. Keep `/health` private and allow the current `/agents/*` product route. Public identity, spend controls, retention, backup/restore and multi-replica ownership require separate authorization.

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

Upstream API assessment and in-memory experiment configuration are consolidated in [Draft Mission 8](docs/mission-drafts/8-experiment-configuration-from-the-ledger.md), which stops at an unstarted configuration the user runs in their own browser. Reconcile Mission 11 with that draft at cut time; configuring an experiment does not prove execution, credible results or consumer acceptance.

Its tracker projection is [FE-1503](https://linear.app/hash/issue/FE-1503/hand-one-accepted-sdcpn-to-an-optimisation-experiment).

Dynamics alone is not optimization readiness. Lightweight non-binding consumer discovery should occur before Mission 9 selects the region that later needs to become complete.

## PM scope-strain register

This register records product consequences, not every engineering idea. A scope strain stays here until it is admitted to a live mission, explicitly declined or assigned to a successor with a re-entry gate.

### Decisions to report or confirm now

- **Assistant scope — PM communication required:** communicate the accepted [product boundary](MISSION.md#product-boundary).
- **Assistant deployment policy — future owner decision:** resolve the [host-choice fork](#host-choice-and-continuity).
- **Live exclusions:** [MISSION.md](MISSION.md#scope-boundary-and-external-owners) settles the current boundary; [distribution and breadth](docs/mission-drafts/worked-example-distribution-and-breadth.md) owns the deferred portfolio and bundle scope. These are not pending confirmations here.
- **Assumption-based preview — open PM decision:** evidence-first remains current policy. A provisional model while blocked would require explicit assent, assumptions distinguished from testimony and made confirmable, replaceable and rejectable, plus agreement on authorized assumptions, UI presentation and semantic acceptance. No general preview policy is authorized.
- **Behavioral evaluation:** use the [after-demo draft](docs/mission-drafts/7-explainable-construction.md); the live mission's [claim discipline](MISSION.md#claim-discipline) determines its evidence tier.

### Capability and lifecycle strains

- **Capability and portfolio obligations:** the [Mission 7d archive](docs/mission-archive/7d-complete-worked-example-demo-and-configure-experiment.md#proof) records the selected runs; [worked-example semantic close](#worked-example-semantic-close-after-7e) owns its unadjudicated product bar; [distribution and breadth](docs/mission-drafts/worked-example-distribution-and-breadth.md#outcome-2--establish-portfolio-breadth) owns breadth and full-envelope adjudication.
- **Repeat/change/retirement/concurrency — Mission 9.** Mission 7's accepted example should leave stable IDs, fresh-base discipline, ordinary correction and current-state why as a usable handoff.
- **General reviewer revision — Mission 10.** The example's ordinary correction does not establish reviewer authority, qualification, conflict handling or general patch locality.
- **Optimization handoff — Mission 11.** Do not infer an optimization product from code-bearing dynamics.

### Conditional technical strains

- **Compaction survival:** consume Mission 7e's fresh long-run disposition and the [Mission 7d historical disposition](docs/mission-archive/7d-complete-worked-example-demo-and-configure-experiment.md#readiness-gate) before Mission 9 or a long-lived hosted provenance claim. Bounded synthetic projection, exact reread and two-element provenance survive split/compaction/fold and fresh-process reopen without canonical/public loss or tool replay. Re-enter for the accepted worked example and for any broader claim about semantic usefulness, provider fidelity, power loss, import/relocation or general truncation recovery.
- **Passage identity across revisions:** rename/move/paraphrase/split/merge/delete/reintroduce continuity belongs to Mission 9/10; consume the live mission's current-revision evidence without inferring continuity.
- **Arbitrary import/clone:** re-enter general import, attachment rebinding or complete effect-history migration only for a named portability consumer; the planned fixture-copy boundary is defined in the [successor draft](docs/mission-drafts/worked-example-distribution-and-breadth.md#connected-bundle-contract).
- **Ordinary-document cross-browser continuity — deferred beyond the demo (Lu, 2026-09-14):** the editable net is browser-local (`petrinaut-sdcpn`), with document/incarnation and conversation association separate from the principal ID. Copying only the principal ID into another browser does not restore the net or its conversation association; Flue's retained mutation snapshots are evidence, not automatic document restoration. See [local document storage](../../../apps/petrinaut-website/src/main/app/local-storage-demo/use-local-storage-sdcpns.ts) and [process binding](../../../apps/petrinaut-website/src/main/app/local-storage-demo/assistants/brunch/use-process-agent-binding.ts). Re-enter for a named cross-browser reopening or recovery consumer, independently of fixture distribution and model-context reduction. Require a second-browser witness recovering the same editable net, workpiece, conversation and valid provenance without replaying mutations; original-profile reopening alone does not establish portability.
- **Provider qualification — worked-example close:** the [worked-example semantic close](#worked-example-semantic-close-after-7e) retains model/effort/fallback and selected-path recovery questions. A general routing framework and portfolio-wide provider comparison remain deferred; re-enter those only for a named broader consumer. Before changing a production default, compare canonical schema carriage, tool selection/arguments, compiler repair, latency and cost on that consumer's representative cases. Provider success does not establish semantic or behavioral correctness.
- **Persona evaluation file placement — after Mission 7e:** reconsider moving `install-faux-provider.ts`, `schema-carrier-probe.ts`, and `launch.test.ts` from production-shaped paths only after the live mission no longer names them as oracles. Re-homing must preserve spawn-by-path behavior and the launch contract.
- **Shared history interpretation — carried from 7c:** consolidation of verifier/history walks remains deferred, distinct from the completed [model-context remediation](docs/reference/architecture/flue-routing.md#model-context-projection). Re-enter if duplicate interpretation diverges or a named consumer needs consolidation. Shared interpretation of canonical Flue history is the contract, not a predetermined module. Require parity checks before extraction; keep projections recomputable and unpersisted, with no new identities, reordered history, hidden live-net input, ambiguous-record repair or second authority. Keep separate walks if those constraints cannot hold.
- **Question marker retired — Voice owner (Lu, 2026-09-15):** `brunch_mark_question`, `question-marker.ts`, `data-brunch-question` and their compatibility consumers are removed, with Kostandin's confirmation, after `run-5uSidX` showed the marker consuming 85 of 123 tool calls and one extra full-prompt model step per reply. Voice derives its repeatable segment client-side from the whole finalized assistant turn. Re-enter only if Voice needs a narrower segment; that is Kostandin's call to raise with Lu, not a marker revival.
- **Proportional workpiece mutation and stable provenance — [successor trigger met](#section-keyed-ledger-operations-after-stage-1):** Mission 7d reduced settlement to one full body per revision; `run-SB5pgx` then showed a 22.3-second median and cost-driven collapse. Mission 7e guarded abrupt loss and reduced superseded net-read context, but `run-1L2zTl` still showed cumulative contraction, current-evidence collapse, compaction and failed current-basis reconciliation. Lu closed 7e as a non-scalable partial. A separately cut successor must test proportional operations while preserving unaffected evidence and explanation across recorded structural changes; a patch must not become a second document authority.
- **Net-observation economy — Mission 7e closed partial:** retained `read_petrinaut_net` bodies were about 40% of the pre-compaction prompt in `run-SB5pgx`; layout is a minor share, the bulk is arcs and `lambdaCode`. Mission 7e's projection dedupe kept `run-1L2zTl` below compaction pressure at minute 30 but not beyond minute 40. Compact model rendering was not admitted; a successor may reconsider it only while preserving `output.observation.{toolCallId,sha256}` and every model-required semantic field.
- **Live tool-call channel fan-out — Tim / hosted:** the live mission's pending-tool side channel is in-memory, single-process and ephemeral, fed by Flue `observe()` and merged client-side. Re-enter multi-process fan-out only for a hosted multi-instance deployment; its absence is a deployment limitation, not a hosted-readiness claim, and does not authorize persisting speculative tool state or an upstream Flue change.
- **Substrate coupling — Flue 2.0.3 over Pi 0.83 (Lu, 2026-09-16):** Brunch carries three repository-root patches: an 843-line `@flue/runtime@2.0.3` patch (context projection, Standard Schema tool inputs, per-tool-call persistent-state drain, no-retry on usage-inferred overflow, root `RETRYABLE_INTERRUPTION_MARKER`), a `pi-agent-core` `validateArguments` patch that exists only to support the Standard Schema part, and a `pi-ai` Anthropic `input_schema`/`anyOf` patch. Flue 2.0.7 has absorbed two Flue parts and Pi 0.85.1 has absorbed both `pi-ai` fixes, but Flue declares Pi at `^0.83.0` and the app pins `pi-ai@0.83.0` exactly, so those fixes are unreachable through either path. Assessment accepted by Lu and narrowed after oracle review: Flue remains the better-supported choice and there is no demonstrated reason to rewrite on Pi, which would transfer the obligations rather than remove them while requiring a Brunch-owned HTTP transport, stream protocol, browser client and Postgres store. The burden is mixed: upstream fixes awaiting adoption, plus missing Flue seams for projection and authoritative tool-input parsing that upgrading does not remove. What was unmanaged is that the Flue-plus-Pi combination has no owner or disposition rule; this bullet is now its planning home, and the [substrate-coupling assessment](docs/reference/architecture/substrate-coupling-flue-and-pi.md) holds the patch ledger and classification, the counterfactual, the three moves with their discriminators and oracles (including a gap: the routing doc's `test:reopened-why-retention` no longer exists as an app script), and rejected alternatives. **Standing obligation (owner pending):** review and explicitly disposition each upstream release that absorbs a carried patch part; do not upgrade automatically. That trigger has already fired for Flue 2.0.7 (absorbs the persistent-state drain and no-retry parts). Mission 7e is now closed, so the next runtime-touching mission must explicitly disposition Flue 2.0.7 before changing the combination and must name the 7e recovery baseline evidence it replaces. Default landing order is Flue 2.0.7 first, then the Pi range; upstream requests to Flue (widen Pi to `^0.85`; a pre-model projection seam) are independent of both and should be opened early. Re-enter on: a Flue release absorbing a further carried part; Flue widening its Pi range or Pi 0.85+ otherwise reachable (delete the `pi-ai` patch); a Flue projection seam (remove the projection hunks per the routing doc's exit condition); Flue or Pi accepting an authoritative-parser seam or Petrinaut's tool inputs no longer needing parse-time defaults and transforms (revisit the Standard Schema part and its `pi-agent-core` companion); a named consumer needing a transport or session backend Flue structurally cannot supply (only then reopen Pi-direct). A runtime-touching mission admits the relevant move at its own cut rather than inheriting all three.
- **Dev/prod persistence split — audited read-only (Lu, 2026-09-16):** [`database-config.ts`](../../../apps/brunch-agent/src/database-config.ts) deliberately defaults to SQLite outside production and requires Postgres in production; this is current design from FE-1569, not legacy. [`db.ts`](../../../apps/brunch-agent/src/db.ts) forks two stores on that selector. The Flue conversation store runs one shared SQL body through Flue's SQLite or Postgres dialect, so its divergence class is Flue-owned; the host contributes only the pool/runner. The worked-model store is two hand-maintained host implementations (in-memory versus Postgres) with no shared logic beyond parse and hash helpers, mounted at `/api/worked-models` but serving no fixture, so its behavioral divergences are latent until a fixture lands. Two things are live now: the Postgres worked-model `createTables` migration executes at every production boot inside `openDatabase`, unguarded by any fixture and without an upgrade-branch oracle, and the Postgres worked-model integration test skips in CI because nothing sets `BRUNCH_TEST_POSTGRES_URL`. The mandatory-TLS pool config keeps the compose Postgres unusable locally, which is why in-memory is the de facto development store. Detailed divergences and proof obligations live in the [distribution draft](docs/mission-drafts/worked-example-distribution-and-breadth.md#persistence-split-carried-into-this-cut); the boot-time migration and Flue dialect parity are [hosted deployment successor](#hosted-deployment-successor) continuity obligations. Re-enter the worked-model items when that draft is cut; re-enter a non-production TLS opt-out only as an owner decision, since the README records TLS as mandatory locally.

### External-owner strains

- **Hosted deployment — Tim / SRE-1013.** Mission 7 may use local Postgres without implying hosted readiness.
- **Voice — Kostandin.** Direct spoken-user attribution after hydration, durable recovery of withheld post-settlement browser work, comparative latency and a typed/Voice/stopped-entry reopen witness remain outside the worked-example mission.
- **Guidance policy remediation — FE-1652.** HASH-policy alignment proceeds independently and does not become Mission 7 acceptance.

## Open product forks

### Host choice and continuity

Ordinary website documents select an assistant through the implemented host-local preference. Mid-conversation switching is not a history-splicing operation and requires an explicit continuity contract before broader admission.

Switching inside a remote worked-model document is deferred. Re-enter only after accepting a stock-history continuity contract that determines whether stock history on remote documents is local-only, remote, or absent.

**Settings-dialog escape hatch — design accepted, implementation held (Lu, 2026-09-16).** Stakeholders want the existing palette switch also exposed in Petrinaut's Labs settings tab. Accepted: a host-supplied generic toggle slot in Petrinaut, host-owned state, no storage migration, and every Brunch affordance hidden while Stock is selected; the toggle stays disabled on the remote route. The [escape-hatch draft](docs/mission-drafts/stock-assistant-escape-hatch.md) is the one planning home for the assessment, the open net-preservation check and the cut obligations.

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
- [Mission 7e](MISSION.md) — live Stage 1 authority for no-silent-shrink protection, net-read economy, refusal-recovery guidance, tool-row lifecycle colour and the carried engineering obligations needed for a fresh long-run observation. [Section-keyed operations](#section-keyed-ledger-operations-after-stage-1) remain future until its discriminator and recut.
- [After-demo construction and explanation evaluation](docs/mission-drafts/7-explainable-construction.md) — cross-scenario acquisition/conservation/construction quality, behavioral correspondence, explanation usefulness, provenance stress and lifecycle breadth.
- [Mission 9](docs/mission-drafts/9-traceable-projection.md) — repeat, change, retirement, concurrency, expanded schema classes and current-state explanation.
- [Mission 10](docs/mission-drafts/10-bounded-reviewer-revision.md) — reviewer authority, attributed revision, conflict, qualification, bounded patching and refusal.
- [Mission 8](docs/mission-drafts/8-experiment-configuration-from-the-ledger.md) — configure-then-user-runs experiment assistance: Petrinaut terrain, Ledger-to-experiment correspondence, design assessment, upstream delta list and pending owner input; ends before anything Mission 11 owns.
- [Mission 11](docs/mission-drafts/11-optimisation-handoff.md) — consumer-accepted complete-model handoff and optimization experiment.
- [Stock-assistant escape hatch](docs/mission-drafts/stock-assistant-escape-hatch.md) — small host-and-Petrinaut change exposing the existing assistant switch in the Labs settings tab and hiding Brunch affordances under Stock; design accepted, cut held pending the net-preservation check and its own issue and branch.
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
- [Substrate coupling assessment, 2026-09-16](docs/reference/architecture/substrate-coupling-flue-and-pi.md) — why Brunch stays on Flue over Pi; the operative obligation is the [substrate-coupling strain](#conditional-technical-strains)

### 2026-09-04 provenance replanning migration disposition

Provenance uses Flue lineage, settled workpiece revisions, constructor-declared mutation basis and observed effects. Capture envelopes and retrospective hand-authored derivation records are not the product seam. The decision log and mini spec above preserve the migration rationale and rejected alternatives.

The old six-beat FE-1476 presentation sequence and earlier delivery dates are historical framing, not current schedule or acceptance authority. The application image being published or returning HTTP 200 is not evidence that Brunch is deployed, durable or publicly safe.
