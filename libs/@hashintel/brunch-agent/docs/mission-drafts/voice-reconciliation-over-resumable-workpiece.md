# Draft — reconcile Voice with resumable browser work

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

## Accepted sequencing decision

On 2026-09-07 Lu selected a replacement branch/PR under his ownership for KA's Voice contribution, integrated above Mission 6 and below Mission 7. KA's original branch and PR #9531 remain untouched as the source record; replacement does not authorize closing, rewriting, retargeting, or otherwise changing them. The replacement is the intended landing candidate, not a second implementation to merge alongside #9531. Preserve KA's authorship and exact source references. Linear assignment, issue edits, and eventual retirement of the original PR require their own authorization.

```text
Mission 5 — unified Flue conversation
  → Mission 6 — resumable workpiece and browser mutations
  → replacement Voice reconciliation — this draft
  → Mission 7 — construct and explain Vestera
```

Lu subsequently selected: prepare this contract now, but wait for the in-flight Mission 6 repairs to be committed before importing code. At initial preflight, Mission 6 had uncommitted work in the `bravo` worktree affecting the fixture host, settled manifest, workpiece recovery, and canonical mutation handling. During preparation, that repair landed as `25392822f3fa838a7b4dca12963ecbc2126f1460`; `bravo` then switched to Mission 5 and held further uncommitted composer/Voice-input-withdrawal/Stop changes. The parent stack therefore still needs its owner's committed handoff and restack, not just observation that one Mission 6 commit landed. Leave that worktree's files and branches alone; re-inspect the committed parent changes and resolve the departure contract after handoff. Mission 7 is currently still based on Mission 6; this draft does not claim that the replacement branch, PR, or restack exists.

Before implementation, Lu reviews the converted six-section authority and its acceptance dispositions. Commit that authority separately from the import. Keep the squashed source contribution distinguishable from subsequent reconciliation fixes, documenting unavoidable import conflict resolutions. Restack Mission 7 onto the verified replacement before its shared transport/browser-host implementation and paid integrated runs, and amend its dependency and protected-contract references separately. Do not recut Vestera scope or transfer Mission 7's paid budget through this operation.

## Cold-start reads and source pins

Paths beginning `packages/`, `docs/`, or `MISSION` are relative to the Brunch context root; `apps/` and `libs/` are repository-root paths. Read source-branch documents with `git show <pinned-head>:libs/@hashintel/brunch-agent/<path>` until they are imported; their absence in the current checkout is not permission to substitute a different version.

| Source | Pin at preparation | Role |
| --- | --- | --- |
| Mission 5, PR [#9528](https://github.com/hashintel/hash/pull/9528) | `fb38101a34bc9edda5cdd213fcb920a39dae1df4` | Current tracked unified-route foundation. |
| Mission 6, PR [#9537](https://github.com/hashintel/hash/pull/9537) | Initial `c1539c1f02a8fa4bf842663577875639214c9537`; first repair `25392822f3fa838a7b4dca12963ecbc2126f1460` | Parent repairs are still in progress on Mission 5; re-pin the fully restacked substrate before import. |
| KA's original [#9531](https://github.com/hashintel/hash/pull/9531) | `be56a18ff0244c5750a8702e9c7f45c0b607dc06` | Replacement source. Its actual inherited parent is `58f75840804766a84ce85b9daab5b5194f3875ec`, the parent of its first contribution commit `40ce63926e`. Import only that parent-to-head contribution, not a distant merge-base delta. |
| Mission 7, PR [#9562](https://github.com/hashintel/hash/pull/9562) | `2506ec5ce0aec267073888a0a8d4307f7aef2ad4` | Live Step A authority, still directly above Mission 6. Implementation and paid evidence had not begun at preparation. |
| Earlier comparative analysis | KA `eecbe99e20..b53b1006fb`; Mission 6 `58f7584080..9b94604cb0` | Historical analysis ranges, not the import target. The later KA source includes `db8184b2e6`, preventing repeated output cancellation, plus restack import/evidence updates. |

Required reads:

- KA's pinned `MISSION.md`, `docs/evidence/implementations/mission-5-voice-safety-parity/{donor-behavior-matrix,provenance-blocker,witness-blocker}.md`, and `docs/evidence/design/mission-5-question-marker-and-provenance-decision-2026-09-04.md`. These preserve accepted half-duplex, exact speech, upstream provenance, and pending human/latency decisions; they are not this branch's live authority.
- Mission 6's [archive](../mission-archive/6-resumable-workpiece-petrinaut.md), [implementation record](../evidence/implementations/fe-1575-resumable-workpiece-petrinaut.md), [corrected browser witness](../evidence/implementations/fe-1575-outer-browser-witness-2026-09-04-r2/witness.md), both witness bundles' raw snapshots, and the [human gate](../evidence/implementations/fe-1575-outer-browser-witness-2026-09-04-r2/product-manager-gate.md). If cutting onto Mission 6 before its archive is present, read the archive from the pinned Mission 7 head and preserve that accepted contract when replacing the root mission.
- `packages/transport-aisdk/src/{index,transcript,ui-stream,client-tool-history}.ts`; website `src/main/app/local-storage-demo/{brunch-panel-transport,use-flue-chat-history,use-crew-reservation-fixture-session,crew-reservation-settled-manifest}.ts`; Petrinaut `src/ui/views/Editor/panels/ai-assistant-panel.tsx` and its mutation helper.
- Website `src/main/app/voice-interview/{openai-realtime-session,realtime-brunch-bridge,voice-turn-controller,canonical-speech,voice-interview-control}.ts*`, server Voice policy, and matching tests from the pinned KA source. Read the new repeated-cancellation regression rather than treating the earlier analysis as current source.
- [Mission 7 authority](../../MISSION.md), especially A2 tool/batch semantics, A3 browser effects, shared-file ownership and paid budget; its [Step B packet](7-explainable-construction.md) owns the genuine Vestera lifecycle regression.
- [Flue routing](../reference/architecture/flue-routing.md), installed `@flue/sdk` types and runtime docs, package instructions, and the repository Git/PR workflow. Prior green tests and SDK documentation are priors, not combined-path proof.

## Visible product advance

**Proposed release note:** speak to Brunch, let it change the open prepared net, interrupt or stop safely, and reopen the same work without replaying speech or duplicating the change. Transcript, tool failures, and stopped responses remain understandable rather than becoming misleading success states.

**Proposed demo:** run `yarn dev:brunch`, open the honestly labelled crew-reservation fixture, and make a typed turn followed by a spoken confirmation. Watch the one crew-reservation arc appear and the coherent bundle settle. During a subsequent response, use **Your turn** and observe safe fresh capture; separately use durable **Stop** before completion. Reopen in another tab, inspect the conversation and net, and continue without duplicate preparation, mutation or autoplay. Inspect the compact and expanded Voice views and one visible tool failure. Direct spoken-message Voice attribution on reopen must be demonstrated or explicitly identified as unsupported under an owner-approved disposition, never silently inferred.

**Previously unproved:** KA's Voice behavior and Mission 6's deferred/recovered browser-tool execution have not been demonstrated together. The separate branches' tests and witness records do not establish their shared turn lifecycle.

## Contract stratum and boundary crossings

The proposed mission closes safe Voice interaction over the existing local browser-work substrate. It does not establish Vestera construction, declared basis, workpiece-revision tooling, why queries, broad projection, concurrent editing, remote durability, a different conversation route, or a new interaction policy.

```text
completed, current-turn microphone transcript
  → shared panel admission and deterministic Flue delivery
  → committed canonical assistant segments and browser-tool requests
  → existing browser validates and executes against the bound document
  → original call-id outputs resume the same conversation
  → canonical speech queue and acknowledged cancellation
  → coherent workpiece/document settlement
  → canonical history reopen and another real turn
```

Keep these meanings distinct: a text segment is durably committed; one Flue submission settled; browser execution or a continuation remains pending; the document/workpiece bundle is coherent; provider output/cancellation is terminal. The panel's `ready` state is not sufficient evidence for all five. Reconcile the existing mechanisms at their real boundaries; do not invent a parallel scheduler, conversation authority, or general state machine just to give these meanings names.

## Observed integration pressures

1. **Intermediate readiness.** Mission 6 schedules static browser tools after the panel becomes `ready`, awaits insertion of their output, and explicitly schedules a continuation. KA's bridge can release the active Voice submission when correlated prose exists and chat is `ready`. Premature microphone handoff or post-Stop continuation is a source-grounded integration risk, not a reproduced combined failure. Probe both text-plus-tool and textless-tool cases before choosing a repair.
2. **Tool classification.** KA's host hard-codes the docs reader and hides the new server question marker. Mission 6 configures fixture-specific browser tools and input normalization. Preserve configurable admission and identical live/history normalization together with hidden marker projection. A marker remains server-owned; a browser mutation must not become `providerExecuted` through a lost catalogue entry.
3. **Delivery identity.** Both branches added idempotency independently. Mission 6 uses `ai-sdk:user:` and `ai-sdk:client-tools:` keys with sorted call IDs; KA uses `ai-sdk:` and `ai-sdk-tool:`, validates the 256-character bound, and distinguishes rejected, conflicting, ambiguous and locally aborted admission. Reconcile stable identity and payload ordering together, including retained deliveries and cumulative result batches; choosing a key prefix alone is not the contract.
4. **Per-tool failure reporting.** KA's `safelyAddToolOutput` writes a matching `output-error` after output-insertion rejection. Mission 6's automatic static-tool path bypasses that helper and catches into local stream error. A textual panel merge succeeds without preserving that static-tool behavior. Carry failure identity, readable error detail and terminal ownership through the actual automatic path; a failed output must not strand Voice or claim successful continuation.
5. **Presentation and host wiring.** Preserve live transcript display, compact consent/dock, expanded behavior and persistent copyable errors without deleting the fixture's coherent-bundle/refusal feedback. The current Mission 5 parent already restores Petrinaut Voice API handlers; retain the single repaired launcher and useful source regression coverage rather than adding a second adapter.
6. **Resume evidence.** At the analyzed Mission 6 head, the history projector emitted IDs, roles and parts without reconstructing Voice metadata or per-message stopped state. Both retained outer-witness bundles contained only completed settlements and no recorded Voice origins. The later claim that those bundles mechanically covered the two presentation repairs was unsupported. Preserve the historical owner close and immutable artifacts; correct current claims and attach an explicit evidence disposition instead of inventing a historical pass.

The pending Mission 6 repairs may change these observations. Record which pressure remains, is resolved by those commits, or needs a new discriminator when the import baseline is re-pinned.

## Throughline proof floor and readiness gate

The first internal milestone is one real spoken fixture turn whose browser mutation returns through the shared Flue route and produces canonical audio without duplication. Completion additionally requires the relevant races, failure/reopen cases, stock-host isolation, human witness and owner-held acceptance dispositions below. Independently green source suites or a conflict-free merge do not close the mission.

### Candidate evidence and oracles

These are prospective assertions in existing test locations, not claims they already exist. At conversion, inspect discovery and finalize exact names. Retain new combined evidence under `docs/evidence/implementations/voice-resumable-reconciliation/<run-id>/`, pinned to the final implementation and post-repair Mission 6 baseline. Existing source evidence remains historical.

| Obligation | Candidate discriminator |
| --- | --- |
| Canonical input and half-duplex ownership survive import | Website `voice-interview/openai-realtime-session.test.ts`, `realtime-brunch-bridge.test.ts`, and `voice-turn-controller.test.ts`: retain keyed completed-transcript, request-before-audio invalidation, queued-output ownership, latest-mute, acknowledged cancellation and repeated-cancellation cases. `voice-preview.integration.test.ts`: completed transcript crosses the real panel/transport wiring exactly once; model tool arguments cannot submit. |
| Intermediate `ready` cannot release pending work incorrectly | `voice-preview.integration.test.ts`: "keeps capture closed across a ready-state browser-tool continuation", once with preceding canonical prose and once without; "does not reopen capture until the explicit handoff and pending conversation work settle". Exercise the real `AiAssistantPanel` automatic-tool path, not only a bridge mock that jumps directly between settled states. |
| Stop and local media actions remain distinct | `voice-preview.integration.test.ts`: "durable Stop suppresses scheduled browser work and later continuation speech"; "Your turn cancels audio without aborting admitted Brunch work". Panel tests cover Stop before tool execution, during output insertion, and before scheduled continuation. Already-applied mutations remain inspectable; no rollback or cross-store atomicity claim. |
| Tool catalogue, markers and normalization agree live and after reopen | `local-storage-demo/brunch-panel-transport.test.ts`, `use-flue-chat-history.test.ts`; transport `test/{ui-stream,transcript}.test.ts`: "preserves fixture browser tools while hiding only the server question marker", "normalizes the same client input live and from history", and "folds continuation parts without losing surviving Voice origins". Missing/unmatched question markers leave replay disabled. |
| Logical retry does not become another admitted turn | Transport `test/chat-transport.test.ts`: exact user retry, cumulative tool-result retry, reordered logical result set, changed-payload conflict with original submission ID, bounded key identity, ambiguous admission without automatic retry, and local abort without durable abort. Built-agent integration verifies deduplicated receipts, not merely the number of `send` invocations. |
| Static browser failures are visible and cannot strand ownership | Petrinaut `ai-assistant-panel.test.tsx`: "records automatic tool-output rejection on the matching tool call"; preview integration: "releases or explicitly fails Voice after a textless browser continuation fails". Cover canonical input rejection, mutation failure/no-op, output insertion rejection and continuation admission failure separately. The prior coherent bundle must not advance on partial failure. |
| Reopen reports the supported facts honestly | Transport history tests and `use-flue-chat-history.test.ts` reconstruct surviving client-tool Voice origins and each aborted assistant entry from canonical data, without browser-origin storage. Retain before/after/Tab-B Flue snapshots and rendered stopped-entry evidence, including another subsequent completed turn so a global latest-status banner cannot pass for per-message presentation. The direct-user limitation below remains a separate gate. |
| Product path and stock coexistence hold | Real `yarn dev:brunch` browser/microphone witness of the proposed demo, original call/result IDs, exactly one target arc, coherent bundle identity, fresh Tab-B continuation, no autoplay or duplicate mutation, and sanitized same-origin network routes. Panel/contents tests and rendered inspection cover compact/expanded Voice and persistent errors; a stock-host regression confirms Brunch absence/unselection retains existing behavior. |

### Inherited acceptance gates requiring explicit disposition

**Direct spoken-user attribution.** KA's supported client-tool provenance is not a fix for direct spoken user messages. Installed Flue 2.0.3 accepts user body/attachments and caller idempotency but does not project caller Voice metadata or the key onto the canonical user message. Agent-authored response metadata is not that seam. Preserve the upstream-supported route decision and rejected sidecar/text-encoding alternatives. Before the cut, Lu chooses either to keep this blocked requirement with a supported upstream solution, or to explicitly defer the Voice chip on reopened direct-user messages and require truthful documented presentation. Neither choice has been made by the replacement-branch decision alone. The success oracle is snapshot-only reconstruction after fresh-process reopen with no browser correlation state; an explicit deferral is a narrower claim, not a passing test.

**Real Voice witness.** KA's complete microphone/handoff/Stop/reload/same-origin artifact bundle remained outstanding at the analyzed source. The replacement needs its own final integrated witness; donor or Mission 6 evidence does not substitute. Lu owns human acceptance. Actual microphone, audible behavior and rendered UI require observation, not synthetic claims.

**Comparative latency.** KA's authority requires ten comparable real-audio trials at donor #9496 head `c7fe8a2e68e8fdc37018b21ec2e9daf4e9ef7c82` and ten at the final candidate, with no median regression and p95 regression below 20%, on the same machine/browser/input/model and warm/cold policy. Single diagnostic turns found almost no canonical-text-to-settlement gap and did not establish an improvement. Carry this gate unchanged into the proposed cut unless Lu explicitly amends it; retain samples, pins, method and limits. A replacement or squash does not waive it, and earlier donor branches remain untouched.

**Paid execution.** This preparation authorizes no paid provider or microphone/latency campaign. Mission 7's $100 envelope is not available here. Before cutting an executable paid witness/latency leaf, name the caller/model, bounded trials, maximum spend and accounting owner with Lu's authorization. Hermetic tests and read-only inspection can establish mechanics but not audible-latency acceptance.

## Inputs and joins with Mission 7

The committed Mission 5/6 repair handoff and resulting Mission 6 head are the input gate. Recheck the shared panel's Voice-input/Stop behavior, fixture selector, actual document binding, mutation/no-op behavior, settled manifest and current workpiece recovery on that head; import neither its uncommitted files nor a stale substitute. Preserve the repaired behavior while adapting KA's contribution.

Mission 7 consumes the verified replacement's transport, tool-continuation, cancellation and presentation contracts. At its dependency amendment, protect the non-interactive question marker alongside A2's core `update_workpiece`, keep server-owned metadata tools distinct from scenario-admitted browser operations, preserve canonical input/result identity through A3's execution changes, and keep workpiece/basis/tool payloads out of automatic speech. Re-pin the actual prompt/tool baseline before Mission 7's instrument freeze or paid run; adding the core marker changes that baseline even though it adds no second answer route.

Mission 7's Step B genuine typed/Voice/stopped-entry scenario remains a breadth/regression obligation over its new revision/basis/mutation semantics. This replacement proves the existing fixture's foundation and documents any explicit limitation; it does not replace the genuine Vestera witness or relax its final claim. A shared unresolved safety defect must not be deferred to Step B merely to begin A3 on an unstable substrate.

## Accepted constraints and guarded invariants

- Preserve one memoized Flue client, canonical log, shared panel `useChat` admission, and mounted `/agents/chat/:instanceId` route. Voice has no direct-send fallback or separate mutable transcript authority.
- Preserve KA's completed-transcript authority, half-duplex explicit handoff, exact canonical speech/replay, fail-closed question markers, independent surviving tool origins, typed admission outcomes, and local-versus-durable cancellation distinctions. This import is not authorization to revert to automatic duplex or add a simplifier.
- Preserve Mission 6's distinct fixture/conversation/document/workpiece identities, canonical browser schemas and callbacks, scoped tool catalogue, live/history normalization, recovered tool execution, no-op honesty, prior-coherent-bundle refusal and automatic document persistence. A transient audio/UI state cannot bless durable work.
- Use source tests as regression obligations, adapting their wiring to the real combined route. A failed integration test can falsify the implementation, not redefine the accepted interaction policy. Delete obsolete implementation only with surviving behavior and its discriminator accounted for.
- Preserve historical source commits, authorship, acceptance decisions and raw witness artifacts. Correct current interpretation with evidence; do not relabel prepared or assistant-authored material as user evidence. Do not import old live/future authority over the current mission spine.
- Maintain stock Petrinaut isolation, local-only claims, secret-free/content-free telemetry, appropriate package changesets and user docs. Do not create broad error protocols, parallel schedulers, provenance sidecars, or cross-store transactions to simplify the join.

## Verification approach and expected touched paths

Start with the smallest combined ready-state/tool/Voice discriminator, then fix the shared boundary and extend to Stop, rejected outputs and reopen. Re-run affected inherited suites; exercise the actual built app/browser wiring and real microphone for claims beyond the controlled harness. Use root Yarn/Turbo checks for changed Brunch core, plugin/binding if affected, transport, app, Petrinaut and website workspaces; follow package-specific verification and architecture-doc rules. Freeze the final evidence head before human/latency acceptance. Record command output and remaining limits; test totals from a previous source head are not a replacement pass.

```text
~ packages/transport-aisdk/src/ and test/                     admission, projection, correlation, failure
~ packages/core/src/flue.ts, prompts/, question-marker*      imported non-interactive marker only
~ apps/petrinaut-website/src/main/app/voice-interview/        imported Voice behavior and combined lifecycle
~ apps/petrinaut-website/src/main/app/local-storage-demo/     repaired fixture host, scoped tools, history
~ libs/@hashintel/petrinaut/src/react/voice-session/          public Voice controls/state from source
~ libs/@hashintel/petrinaut/src/react/notifications/          source error presentation
~ libs/@hashintel/petrinaut/src/ui/views/Editor/panels/       actual tool host and Voice UI
? apps/brunch-agent/petrinaut-local.vite.config.ts and tests  retain already-repaired launcher and coverage
~ package.json, relevant package exports/build config        only necessary source wiring and startup checks
~ affected user docs and .changeset/                         truthful combined behavior
+ docs/evidence/implementations/voice-resumable-reconciliation/ final combined evidence
```

## Fog-line and stop conditions

Re-evaluate the pending Mission 6 repairs, exact source import footprint, SDK/browser continuation ordering, cancellation ownership and retained-idempotency compatibility at the real boundary. Prefer the existing platform/library mechanism and the smallest local repair. If pending work cannot be distinguished without changing the admitted interaction or termination contract, return to Lu before introducing another coordination mechanism.

Stop before import if the Mission 5/6 parent stack is still being repaired without a committed handoff, the source or destination pins moved without inspection, another worktree's edits would be disturbed, or the replacement authority has not been accepted separately. Stop before claiming closure if the combined route permits duplicate mutations, fresh capture before safe handoff, post-Stop scheduled work that should have been cancelled, hidden tool failures, false coherent settlement, misleading historical attribution, or an unperformed inherited acceptance gate. Evidence can establish an explicit blocked outcome; it cannot manufacture a pass.

A local Flue patch, second provenance store, visible-text origin encoding, direct Voice admission path, response rewriting, or new batch/termination policy requires reorientation rather than opportunistic integration. Vestera, declared basis, the new revision tool, broad orphan-code retirement, full projection, concurrent collaboration and remote release remain with their existing mission owners. The owner-held direct-attribution, latency and paid-execution dispositions above must be resolved explicitly at the cut, not by the importing agent.
