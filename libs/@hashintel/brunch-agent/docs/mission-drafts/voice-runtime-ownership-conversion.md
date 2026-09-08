# Voice ownership — bounded conversion and gated implementation plan

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

Prepared for owner review on 2026-09-07. This document owns the conversion proposal, source inspection, stage sequencing, and proposed acceptance checks. The [ownership design](voice-runtime-ownership.md) remains the sole detailed architectural planning home; it is not promoted by this proposal. Neither the existing mission nor that design is changed here. The successor issue and draft PR are authorized review surfaces; no dependent product implementation, paid campaign, or mission acceptance is implied.

## Decision requested

Approve a two-step authority conversion: first establish the supported Flue recording boundary; only after that gate passes, separately approve and commit the bounded product mission covering recording, one delegated clarification, and integrated recovery. The first successful clarification is an internal milestone, not mission completion. Expansion remains a later evidence-gated decision.

**Current blocking result:** Flue 2.0.3 and the inspected upstream HEAD do not expose the required persistence-only external dialogue contract. A normal signal can carry a waking, non-human handback; it cannot stand in for no-wake recording. Do not implement dependent UI, prompts, delegation, or a substitute log while this boundary is missing.

Tracker decision is separate from architecture approval. Kostandin Angjellari authorized a new successor issue and draft PR stacked on [PR #9564](https://github.com/hashintel/hash/pull/9564), without modifying that PR or [FE-1580](https://linear.app/hash/issue/FE-1580/reconcile-voice-turn-behavior-on-the-shared-brunch-conversation). [FE-1624](https://linear.app/hash/issue/FE-1624/implement-split-ownership-voice-conversations-with-brunch) is assigned to Kostandin Angjellari and corresponds to `kostandin/fe-1624-split-ownership-voice`. Its planning-only PR targets `ln/fe-1580-reconcile-voice-resumable-workpiece`. This publication is not approval of the mission conversion. The accepted parent authority remains unchanged.

## Re-evaluated foundation

### Exact pins and inspection scope

`gh pr view 9564 --repo hashintel/hash --json headRefOid,headRefName,baseRefName,state` returned current head [a0ca1cbf52ea44420db24cb615c349e151036c14](https://github.com/hashintel/hash/commit/a0ca1cbf52ea44420db24cb615c349e151036c14), open against `ln/fe-1575-resumable-workpiece-petrinaut`. The original local checkout was at [2db4790f19065dc3aa7ff165297d182e6d632a70](https://github.com/hashintel/hash/commit/2db4790f19065dc3aa7ff165297d182e6d632a70). The design's earlier inspected head is [132831f14300c577c5d0b73cea9d817c8e5c6c7d](https://github.com/hashintel/hash/commit/132831f14300c577c5d0b73cea9d817c8e5c6c7d). These are three different baselines; old local source and test totals are not evidence for the current PR head. The successor branch starts at the inspected current PR head in an isolated worktree, preserving the original checkout and its uncommitted files.

Read root/package `AGENTS.md`, original local `MISSION.md`, the complete original local `MISSION.next.md`, [draft lifecycle](README.md#lifecycle), the design, and [Flue routing](../reference/architecture/flue-routing.md). Inspected exact PR Git objects for mission status/deferrals, the owner witness, transport result selection/tests, panel execution/continuation/isolation changes/tests, fixture/plugin evidence repair, Voice policy/session/bridge, workpiece selection, mounted app route/ownership guard, and the built-runtime test entrypoint. No existing branch was switched or restacked, and no product tests were run for this proposal. `gh stack` was unavailable; the child branch and explicit GitHub base establish the stack without rewriting its parent or siblings.

At the PR pin Mission 6b is **accepted with explicit limitations**, whereas the older local authority still says live. Consume the pinned accepted record; do not manufacture another close from the local copy. The [witness at the pin](https://github.com/hashintel/hash/blob/a0ca1cbf52ea44420db24cb615c349e151036c14/libs/%40hashintel/brunch-agent/docs/evidence/implementations/voice-resumable-reconciliation/owner-witness-2026-09-07/witness.md) tested an earlier implementation and records narrowed human evidence, not a rerun of the latest head.

### Repairs and limits the conversion must carry

| Inspected owner | Protected behavior or material limit |
| --- | --- |
| `packages/transport-aisdk/src/index.ts`, `completedClientToolResults` | Select the latest relevant client-tool step, including a later server-only step; never resend stale cumulative read results as mutation verification. |
| `libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.tsx` | Wait for sibling automatic tools; retain batched continuations through effect replay; replace conversation-owned hooks/callbacks when identity changes. Preserve both new tests: `does not continue while a sibling automatic tool is pending` and `replaces conversation-owned busy state when the identity changes`. |
| Website `prepared-crew-reservation-fixture.ts` and plugin `src/flue.ts` | Revision zero is an unconfirmed hypothesis. A fragment, topic label, inspection request, unrelated message, or agent proposal is not explicit human confirmation. |
| Website Voice policy and bridge | Existing mode is a no-tool, verbatim half-duplex relay. New local wording is an explicit policy delta requiring new authority, not a relaxation hidden in the current mission. Keep no-autoplay and input/output contamination barriers. |
| Core `src/workpiece.ts`, `selectRunbookWorkpiece` | Recovery currently selects assistant `runbook-ir` fences. It does not attest Brunch authorship. Newly recorded Realtime assistant text must not become a workpiece merely by containing such a fence. |
| `apps/brunch-agent/src/app.ts`, `src/http/ownership.ts` | One mounted `/agents/chat/:instanceId` route has a principal/conversation ownership guard. Browser-supplied principal headers are not authenticated actor identity. Do not claim trusted authorship from that guard alone. |

The current checkout and PR pin do not implement Mission 7's settled `update_workpiece` protocol. Do not invent a competing revision/basis system or import unapproved Mission 7 changes. The first Voice workpiece proof may use the inherited bounded workpiece path only after its Brunch-authorship eligibility is enforced. A later join to Mission 7 requires inspecting its accepted public seam and reconciling ownership explicitly.

The prepared crew-reservation scenario is diagnostic material, not evidence for general construction, explanation, or customer elicitation quality. General lineage, declared basis, passage identity, compaction, repeatable projection, reviewer revision, and deployment keep their existing planning owners.

## Flue capability finding

Inspected upstream release 2.0.3 at [bf86b8726f5ba189844185fdbeca0e194344ded1](https://github.com/withastro/flue/commit/bf86b8726f5ba189844185fdbeca0e194344ded1) and remote HEAD at [832ad2eeaf5e4b07d39749fc669e7ad556238313](https://github.com/withastro/flue/commit/832ad2eeaf5e4b07d39749fc669e7ad556238313). Their difference is documentation-only. This is source/API evidence, not a runtime extension probe or a claim about future releases.

| Question | Evidence and consequence |
| --- | --- |
| External append without waking Brunch? | Public [SDK client](https://github.com/withastro/flue/blob/832ad2eeaf5e4b07d39749fc669e7ad556238313/packages/sdk/src/client.ts#L47-L98) exposes send/read/wait/abort/history/observe, not external append. [Send](https://github.com/withastro/flue/blob/832ad2eeaf5e4b07d39749fc669e7ad556238313/packages/sdk/src/public/send.ts#L12-L63) admits user or signal submissions. No supported persistence-only dialogue contract was found in either revision. |
| Can `ctx.append` substitute? | No. [Message output](https://github.com/withastro/flue/blob/832ad2eeaf5e4b07d39749fc669e7ad556238313/packages/runtime/src/message-output.ts#L61-L143) is an in-lifecycle signal append that steers the active response, rejects user append, and is not an external dialogue writer. |
| Can a structured handback avoid a synthetic human turn? | Yes, normal `send({ message: { kind: "signal", type, body, attributes, tagName }, uid, idempotencyKey })` is supported. [Signal projection](https://github.com/withastro/flue/blob/832ad2eeaf5e4b07d39749fc669e7ad556238313/packages/runtime/src/conversation-projections.ts#L127-L172) is system/dispatch/diagnostic, not human testimony. This wakes Brunch as intended. It does not solve the missing original dialogue records. |
| Are source/evidence attributes authenticated? | No. They are caller-controlled strings in the [input schema](https://github.com/withastro/flue/blob/832ad2eeaf5e4b07d39749fc669e7ad556238313/packages/runtime/src/runtime/schemas.ts#L28-L70). The application must authenticate the runtime actor, validate delegation/evidence, and construct or verify the handback. A claimed source-agent attribute is not an attestation. |
| Does public abort close post-settlement browser work? | No. [Execution-store abort](https://github.com/withastro/flue/blob/832ad2eeaf5e4b07d39749fc669e7ad556238313/packages/runtime/src/agent-execution-store.ts#L233-L245) marks eligible unsettled submissions, not terminalizing/settled ones. No corresponding durable browser-operation disposition is supplied by this API. A generic Stop signal would not enforce cancellation. |

The required extension must carry the design's [persistence-only contract](voice-runtime-ownership.md#persistence-only-events): canonical ordered append, durable actor/modality attribution, causal references, stable event identity, identical retry/conflicting payload semantics, hydration, and later model visibility, with no invocation or domain effect. Authentication is a composition obligation, not a requirement that Flue invent a user directory. Do not prescribe private database records or an unearned wire API before an upstream-supported surface exists.

**Gate result: blocked on supported external recording.** An upstream-supported implementation and distributable pin plus real boundary evidence are needed to change that result. Merely locating an internal reducer, retaining JSON in a browser, or dispatching a signal does not pass. Opening an upstream issue/PR or publishing an extension requires separate external-write authorization.

**Upstream effort authorized; supported-contract gate still blocked:** On 2026-09-07, Kostandin Angjellari approved the separately bounded upstream prerequisite effort. Flue's inspected contribution policy requires a feature Discussion rather than an unsolicited implementation PR. With subsequent explicit posting approval, the [maintainer request](flue-external-recording-request.md) was posted as [Flue Discussion #653](https://github.com/withastro/flue/discussions/653); publication is not maintainer acceptance. The [built-runtime baseline](../evidence/implementations/voice-runtime-ownership/flue-baseline.md) confirms that normal signals invoke the agent and hooks, that zero model calls is an insufficient no-wake oracle, and that ordinary settled history survives a second process. It does not test or implement the missing recorder.

The effort must establish maintainer-supported public SDK/router semantics and an inspectable implementation pin; a private fork or approval of this HASH plan alone cannot discharge the supported-contract requirement. Until such a candidate exists, keep the accepted parent mission unchanged and retain this planning packet. Do not create a live implementation mission whose only action is waiting for an unspecified dependency. The first candidate re-entry check is the real no-wake/hydration/attribution test below, not an assumption that an upstream announcement establishes compatibility.

## Proposed mission conversion envelope

The following are candidate contents of the six live semantic addresses, not a second live mission.

| Address | First bounded authority: establish the recording prerequisite | Separately approved product amendment after the prerequisite |
| --- | --- | --- |
| Imperative | Establish whether a supported canonical no-wake recorder can satisfy the first Voice consumer, or return an actionable blocked result. Explicitly an internal prerequisite, not a product-manager-visible advance. | Make one natural clarification update Brunch's workpiece while preserving one continuous typed/spoken conversation, recoverability, and safe effects in the named scenario. |
| Throughline | Supported public SDK/router → same mounted conversation → durable dialogue → fresh-process history → one normal handback admission. No autonomous Realtime or mutation. | Brunch delegation → two recorded Realtime exchanges → agent-authored handback → Brunch validation → workpiece update → fresh-process reconstruction; then modality/interruption/browser-effect recovery gates. |
| Proof | Real built-runtime, faux-provider test counts zero agent calls during recording, reconstructs original identities/attribution from a second process, and exposes those records to the one intended handback invocation. Reject forged authorship/conflicts/cross-conversation access. | The acceptance matrix below plus named-scenario browser/media witness and owner adjudication; the tracer alone does not close the mission. |
| Constraints | The design's protected ownership table and persistence contract; unchanged normal admissions; no private Flue patch, sidecar, synthetic user message, provider-history authority, or paid run. | Same constraints, plus Brunch-only workpiece eligibility and mutation authorization, original call/step results, coherent-state refusal, distinct speech interruption and durable Stop. |
| Fog-line | Supported append availability; trusted runtime actor path; ordering/idempotency across reconnect; how original dialogue reaches later context. Do not design past a missing public contract. | Media durability versus buffering, stale delegation/basis, existing workpiece eligibility, execution/disposition atomicity and reconciliation, useful clarification versus leading questions. |
| Stop or reorient | Required API absent or only private; need to wake Brunch to record; actor identity cannot be validated; canonical reconstruction loses evidence. | Domain strategy moves into Realtime, interpretation is laundered into human evidence, cancelled work revives, effects duplicate, or apparent settlement exceeds authoritative evidence. |

The owner must explicitly accept the first cut's prerequisite-only outcome rather than accidentally presenting it as the product mission. Its present source-only blocked result is already known; a new implementation plan for that gate becomes executable only when a supported candidate exists. If none exists, retain this proposal and stop dependent work rather than create an empty scaffolding mission.

### Authority and lifecycle procedure

1. Use the authorized FE-1624 successor topology. Before conversion, re-query #9564 and inspect any delta. Inspect worktrees/stack before any checkout; do not stash, reset, move, or overwrite the user's local design/spine or unrelated files to make room. The successor starts at the inspected PR head, not local `main` or assumed `origin/main`.
2. Preserve the accepted Mission 6b authority in its archive according to the [archive rules](../mission-archive/README.md), using the pinned accepted version rather than the stale local live version. Preserve all its deferrals and source attribution. Do not edit the original PR or stack siblings as an incidental archive action.
3. Convert only the approved envelope into `MISSION.md`, with one current Status, six required addresses, and Deferred links. Identify precise permitted deltas to no-local-wording/no-local-dialogue constraints. Commit this authority change alone before any dependent implementation or evaluation.
4. Consume this conversion proposal only after every remaining obligation has an explicit surviving home. At a prerequisite-only cut, return unadmitted product sequencing and test leaves to a residual provisional planning home at full fidelity before removing the consumed proposal. Retain the ownership design as residual architecture planning, not duplicate execution authority; preserve its rationale and historical full artifact before later subtraction.
5. Compare every affected planning file before/after for loss or duplicated authority. The design's current bytes and original spine pointer remain preserved during this review. Nothing is archived, consumed, or promoted merely by accepting tracker assignment.

## Implementation sequence and promotion gates

All steps below are proposed. Only execute stages admitted by the separately committed mission. Work in the existing owners; do not create a general orchestration framework. New API names and detailed implementation code remain deliberately unspecified because the required public substrate does not exist at the inspected pin.

### A — Supported recorder and dependable foundation

- [ ] Re-pin source and dependency, review upstream public contract, and record whether it is supported/released. If absent, retain the blocked verdict and stop. Do not patch installed dependencies.
- [ ] On an approved supported candidate, extend `apps/brunch-agent/test/petrinaut-chat.test.ts` and its `petrinaut-chat.integration.ts` child-process fixture. Use its real built app, mounted route, isolated temporary database, and faux provider; do not introduce another runtime harness. Add the failing no-wake/restart/attribution/conflict tests before integration code.
- [ ] Integrate only the supported route/client contract through `apps/brunch-agent/src/app.ts` and `packages/transport-aisdk` as required by the public seam. Exercise trusted actor enforcement at the app boundary; reject self-asserted Brunch authorship. Ordinary typed and Brunch-owned sends must retain their existing route and admissions.
- [ ] Extend `packages/transport-aisdk/test/{chat-transport,transcript,ui-stream}.test.ts` and core `test/workpiece.test.ts`: local assistant records cannot be parsed as Brunch workpieces, tool requests, results, or validation receipts. Fence text and tool-shaped content are inert evidence. Preserve causal results with dialogue interleaved between calls and results.
- [ ] Run targeted checks, inspect fresh-process records, and present the no-wake contract evidence for the product-amendment gate. No autonomous clarification or product-readiness claim yet.

### B — Recorded delivery, then one conservative delegation

- [ ] First wire runtime-authored recording without autonomous follow-ups in website `voice-interview/{openai-realtime-session,realtime-brunch-bridge,voice-turn-controller}.ts`. Record raw finalized transcript separately from normalization, actual generated wording, author, delivery identity/attempt, playback acknowledgements, interruption and unknown tail. Test disconnect before wording persistence; use buffered/text-first delivery if audio would escape the durable record.
- [ ] Compose role-specific material from Brunch core `src/prompts/SYSTEM.md`, `src/skills/elicitation/SKILL.md`, and website `src/server/voice/openai-voice-policy.ts`. Share evidence/uncertainty vocabulary, not the entire domain strategy. Record effective prompt/skill/resource/model versions. Keep domain tools unavailable to Realtime.
- [ ] Add one Brunch-authored clarification scope at the existing core/Flue binding capability boundary: purpose, permitted exploration, evidence/workpiece basis, return conditions, identity/version. Test enforcement and invalidation before relaxing the relay policy. Realtime may acknowledge/rephrase/ask permitted local follow-ups, not select strategy or decide sufficiency.
- [ ] Use a validated application-authored signal for handback through normal admission, referencing original recorded events, scope/version, proposed meaning, uncertainty, and return reason. Check useful answer, conflict, new topic, out-of-scope uncertainty, decline, and Stop; missing or foreign evidence cannot authorize an update. Brunch reads originals and accepts, refuses, or asks again.
- [ ] Run the exact tracer: one delegation, two local exchanges (each containing a user utterance and Realtime response), one logical handback, Brunch-validated workpiece update, then fresh-process reconstruction. Inspect originals, actual wording, attribution, update source, and preserved uncertainty. No general projection claim and no scope-completion UI.

### C — Integrated recovery before the broader safety claim

- [ ] Add failing panel and runtime tests for Stop after the Flue step has settled but before its browser operation is claimed. Establish an authorized durable operation disposition on a supported canonical runtime seam; Petrinaut must consult it before claiming work and on recovery. Reject changed-payload reuse of operation identity and preserve original call/step ownership and validated document basis.
- [ ] Distinguish cancelled-before-execution, executing, applied, failed, and uncertain outcomes. Test Stop/claim races and crashes before effect, after effect/before receipt, after receipt/before acknowledgement, and between sibling effects. If no atomic effect/receipt boundary exists, reconcile authoritative document state before retry; unknown is a valid refusal, not permission to replay.
- [ ] Test typed input, voice exit/re-entry, relevant workpiece changes, and explicit Stop invalidating/suspending scope; playback acknowledgements alone do not invalidate it. Fence old connection events and old-tab execution authority. Keep one active execution owner per workpiece; second tab observes until an explicit safe transfer, not active-active execution.
- [ ] Keep speech interruption local to delivery, without implicit durable cancellation. Expose distinct interrupt-speech and Stop-work controls during Voice in the existing panel/control owners. No autoplay on reopen, no silent replay of cancelled work, no claim of rollback for applied work.
- [ ] Add the existing fixture browser mutation to the integrated throughline only with explicit original human evidence and Brunch-selected work. Partial failure retains the prior coherent bundle; a proposal based on an old state cannot overtake unsettled work. Run real browser/media verification and seek owner acceptance of this named-scenario readiness claim.

### D — Expansion only under new evidence

The design's [expansion and experiment gates](voice-runtime-ownership.md#migration-stages-and-readiness-gates) retain ownership here; they are not authorized by a green tracer. Compare an improved Brunch relay with split ownership on useful information, unsupported assumptions, repetition, correction effort, and naturalness. Before real paid trials, obtain explicit models/callers, numerical quality/latency thresholds, trial counts, ceiling, and accounting owner. Mission 7's budget is not available. No quality/latency win is inferred from unit tests or preference alone.

## Candidate acceptance matrix

Names below specify new assertions to add, not tests claimed to exist or pass. Reuse adjacent existing tests and the built-runtime harness. Tests must inspect structured evidence rather than matching a transcript substring alone.

| Proposed discriminator | Owner / observable oracle |
| --- | --- |
| `records two local exchanges without invoking Brunch` | App `petrinaut-chat.test.ts`/`.integration.ts`: observe Brunch execution entry and hook activity as well as model requests and submissions before/after four dialogue records. After initialization settles, local appends must schedule no Brunch work, execute no Brunch hooks, and leave IR/document unchanged, including after process replacement. One logical later handback admission and a normal typed send are positive controls proving the execution observer is live. Zero model requests alone is insufficient. If the supported runtime offers no credible execution observation, mark this proof blocked rather than substituting a sleep or provider-call count. |
| `reconstructs attributed originals after process replacement` | Same two-process test over the same isolated database: exact canonical event identities/order/actors/modalities and separate raw/normalized text; subsequent Brunch input includes original evidence, not only the proposal. No browser/provider history used. |
| `deduplicates identical recording and rejects identity conflicts` | App boundary plus transport tests: lost append/admission acknowledgement, duplicate final transcripts/proposals, same key with changed payload, wrong incarnation, cross-conversation references, forged actor, concurrent order, and reconnect. Reuse identity on retry; no blind new admission. |
| `Realtime content cannot update a workpiece or execute tools` | Core `workpiece.test.ts`, transport projections, and real panel tests: inject assistant `runbook-ir`, tool-shaped parts, a forged Brunch validation, leading suggestion, ambiguous assent, and `SDCPN`; no update/effect. Explicit original evidence plus Brunch validation is the positive control. |
| `stale delegation is evidence but not current authority` | Bridge/controller and app admission tests: typed interruption, Stop, new topic, changed workpiece, delayed old connection handback; no unauthorized update. Playback-only records leave an otherwise-current scope valid. |
| `local records preserve causal browser continuation` | Transport `chat-transport.test.ts` and panel tests: mixed server/browser step with later server-only activity, staggered siblings, unrelated later call, local exchanges between request/results, reordered retries, StrictMode effect replay, conversation switch with an old callback. One result per original call; no stale cumulative results. |
| `settled-step Stop survives reopen` | Panel + app persistence + browser integration: Stop pending post-settlement work, replace process/tab, observe durable cancelled disposition, zero effect. Separately prove already-running/applied/uncertain cases report honestly. Do not relabel a completed submission aborted. |
| `partial effects require recovery before retry or settlement` | Actual Petrinaut callback boundary and fixture manifest tests: one sibling applied/another failed, effect before acknowledgement, stale document basis, reconnect; recover receipt or reconcile/refuse. Never advance an incoherent bundle or claim exactly-once effects from send idempotency. |
| `wording and delivery uncertainty survive interruption` | Session/controller tests plus browser capture: recorded actual output differs legitimately from Brunch instructions; cutoff contains acknowledged progress and unknown tail, not invented heard text. Missing final ack, split/folded question marker/prose, late output, no autoplay, explicit replay. |
| `one continuous typed/spoken conversation remains usable` | `voice-preview.integration.test.ts`, `voice-browser-tools.integration.test.tsx`, rendered panel and real microphone witness: no duplicate human turns, no gap-task UI, two distinct accessible interruption/Stop controls, one workpiece, safe modality transfer and stock-assistant isolation. |

### Verification commands and evidence separation

Run from repository root on the approved implementation checkout, not the original older checkout. Start with each touched owner's targeted suite, then run the relevant package checks. These are planned commands, not results from this planning session.

```sh
yarn workspace @hashintel/brunch-agent-transport-aisdk test:unit chat-transport.test.ts transcript.test.ts ui-stream.test.ts
yarn workspace @hashintel/brunch-agent test:unit workpiece.test.ts
yarn workspace @hashintel/petrinaut test:unit ai-assistant-panel.test.tsx
yarn workspace @apps/petrinaut-website test:unit voice-preview.integration.test.ts voice-browser-tools.integration.test.tsx canonical-speech.test.ts realtime-brunch-bridge.test.ts voice-turn-controller.test.ts openai-realtime-session.test.ts
yarn workspace @apps/brunch-agent build
yarn workspace @apps/brunch-agent test:unit petrinaut-chat.test.ts agent-ownership.test.ts prepared-workpiece.integration.test.ts
yarn turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@hashintel/petrinaut --filter=@apps/petrinaut-website
yarn workspace @local/petrinaut-arch-docs lint:arch-docs
git diff --check
```

Read package instructions and run the repository formatter on changed files only. For product changes, update Petrinaut's `docs/ai-assistant.md`, website README, and affected API documentation; add the required package-scoped patch changeset only for new published consumer behavior. Do not duplicate the foundation's existing changeset as proof of this work.

Use `yarn dev:brunch` and the named diagnostic fixture for browser verification without silently starting billable turns. Inspect screenshots of the default, Voice-active, interrupted, stopped, error, and reopened states that actually change. Exercise DOM/accessibility semantics for controls. A synthetic media test cannot establish audible naturalness or real microphone behavior. Obtain authorization before billable provider use; a human witness and owner promotion remain explicit gates.

Retain sanitized canonical snapshots, event/submission/operation identities, workpiece/document hashes, browser route export, generated wording/playback-progress evidence, screenshots, fault-injection results, and exact source/dependency pins. Exclude secrets, credentials, SDP, private model reasoning, and unnecessary raw audio. Classify each claim as implemented, automated evidence, human-witnessed, owner-accepted, or unresolved. Historical witness counts are never a current test result.

## Residual planning disposition

| Material not consumed by a prerequisite-only cut | Sole detailed planning owner and re-entry gate |
| --- | --- |
| Ownership policy, continuous-conversation experience, alternative approaches and reasons | [Ownership design](voice-runtime-ownership.md#authority-boundaries); product amendment must name its permitted semantic deltas. |
| Recording fidelity, delegation, handback, prompts/resources, media uncertainty, operation dispositions | Corresponding sections of the ownership design; stages B/C are the first consumers. Execution sequencing and test leaves in this proposal must move intact to residual planning if this proposal is consumed at A. |
| Broad delegation, freer substantive expression, improved-relay comparison | Design expansion/experiment gates; re-enter only after scoped readiness and approved measurements/budget. |
| Mission 6b accepted deferrals and witness limitations | Pinned owner witness and future spine; direct-user attribution re-enters at A/B, post-settlement withholding at C, comparative latency only when its owner-approved criterion applies. Do not call old deferrals passes for this new scope. |
| General revision/basis/lineage/compaction, repeatable projection, reviewer semantics, deployment and optimisation | Existing numbered drafts and shared spine; no competing Voice ledger or wholesale Mission 7 import. Inspect the current accepted consumer seam before integration. |

## Review checkpoint

The planning review retained the four ownership boundaries, the continuous-conversation interaction, the full staged recovery obligations, and the distinction between tracer and readiness. It tightened the blocked-stage re-entry decision and the no-wake oracle; it did not approve the mission or establish runtime feasibility. The successor tracker topology is resolved, and the bounded upstream prerequisite effort and feature-request publication are authorized. Mission conversion, resolution of the Flue dependency, paid media evidence, and final product acceptance remain separate decisions. The next dependency is a maintainer-supported candidate; its boundary proof remains required before speculative Voice code becomes executable work.
