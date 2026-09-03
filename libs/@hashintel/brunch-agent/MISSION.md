# Mission 5 successor — Voice safety and UX parity on the unified Flue route

## Status

**Live as of 2026-09-03** for [FE-1580](https://linear.app/hash/issue/FE-1580/harden-voice-safety-and-ux-on-the-unified-flue-route) on `kostandin/fe-1580-harden-voice-safety-and-ux-on-the-unified-flue-route`, stacked directly on [PR #9528](https://github.com/hashintel/hash/pull/9528) at the GitHub-verified head `036fb06ee83e840fd7a87dd1bc758a2dd49ddd4c`. This file is the sole execution authority for the successor branch. The parent remains the authority for its own admission/Stop races, stream cancellation, hydration overwrite, client-tool classification, response/submission correlation, and PR/CI defects; this branch must restack onto parent fixes rather than repair them.

The owner selected **half-duplex turn ownership** on 2026-09-03. While canonical assistant audio is pending or playing, the microphone is closed. The explicit **Your turn** action cancels output, waits for provider acknowledgement and response settlement, and only then opens a fresh input turn. Automatic duplex barge-in is rejected because assistant playback can become a false user turn.

### Turn-ownership decision

1. **Adopted — half-duplex explicit handoff.** It gives assistant playback exclusive ownership, makes cancellation settlement a visible boundary, and guarantees fresh post-handoff capture. The product cost is one extra **Your turn** action and barrier latency when the user interrupts.
2. **Rejected — automatic duplex barge-in.** It offers the most conversational interruption and avoids an explicit control, but an open microphone can transcribe assistant playback as a user answer, and capture can race an unsettled cancellation. This risk is unacceptable for authoritative completed transcripts.

Sections independent of canonical hydration may proceed. The hard-reload witness is blocked until the parent prevents its once-per-conversation hydration from overwriting a locally submitted turn. Prepare that witness but do not patch the parent defect here.

The pinned donor-behavior decision record is the [FE-1580 donor matrix](docs/evidence/implementations/mission-5-voice-safety-parity/donor-behavior-matrix.md). Donor PRs are read-only evidence at their named heads; semantic reimplementation is required, never merge or cherry-pick.

## Imperative

Make Voice safe and product-complete on the one Flue conversation route established by the parent. Only a completed provider transcription may become a spoken answer; one logical typed or Voice delivery must admit at most one Flue turn; assistant output must yield the microphone through an acknowledged cancellation barrier; exact canonical responses must be replayable; and Voice attribution must survive canonical hydration and reopen.

Voice path B is the **only admissible submission shape**:

```text
Voice completed transcript
→ Voice controller validates one keyed transcript identity
→ panel submitVoiceInputWithAdmission
→ panel submitVoiceInput
→ shared useChat submitText
→ host-supplied Flue ChatTransport
→ client.send({ message, idempotencyKey, signal })
→ /agents/chat/:instanceId
```

Voice may not call `FlueClient.send()` directly and may not own a second mutable transcript. A direct-send fallback would recreate the second admission path this stack exists to remove.

The parent's claim that Flue 2.0.3 cannot accept caller idempotency is false. The installed `@flue/sdk` 2.0.3 typings expose `AgentPromptOptions.idempotencyKey?: string`, `AgentSendResult.deduplicated?: boolean`, and the 409 `submission_conflict` response with the existing `submissionId` in `FlueApiError.body.error.meta.submissionId`. The invariant is **at most one admitted turn**, not exactly one invocation of `send()`.

## Throughline

The production throughline is the local Petrinaut Brunch surface driven by `yarn dev:brunch`:

```text
OpenAI Realtime microphone input
→ semantic VAD marks an input boundary but creates no model response
→ conversation.item.input_audio_transcription.completed
→ keyed transcript authority (connection epoch, item id, content index)
→ half-duplex Voice controller and shared panel submission path B
→ browser AI SDK ChatTransport over the memoized FlueClient
→ idempotent Flue admission on the same-origin /agents/chat/:instanceId proxy
→ agentOwnershipGuard → mounted Brunch ChatAgent
→ submission-correlated canonical response and settlement
→ exact canonical segment queue → visible panel text and TTS
→ replay controls and durable Voice provenance
→ observe({ live: "sse" }) hydration and reopen
```

Realtime exposes no tools, uses `tool_choice: "none"`, and configures semantic VAD with `create_response: false`. Model function-call arguments are ignored even if a provider violates the policy. Provisional transcription is display-only and disappears without submission.

Local playback cancellation, local observation cancellation, the HTTP request `AbortSignal`, and durable conversation-wide `FlueClient.abort()` remain separate operations. The first three never masquerade as durable Stop; durable Stop never appears as a Voice transcription or playback failure.

## Proof

This mission closes the Voice safety and UX-parity stratum on the parent's route. It does not establish production identity, remote deployment, structured questions, a live `brunch_ask` capability, response simplification, workpiece mutation, or fixes for the parent's named defects.

### Product-manager litmus

**Release note:** Voice now submits only what the microphone actually transcribed, waits for a safe **Your turn** handoff before listening over Brunch, can replay the exact full response or question, and keeps its Voice attribution after reopening the conversation.

**Demo script:** run `yarn dev:brunch` and select the Brunch preview. Speak one answer and see exactly one matching user turn. While Brunch is speaking, confirm the microphone remains closed, choose **Your turn**, wait for the handoff, and speak again. Use the playback menu to read the full response and repeat the question verbatim. Start another turn, press durable **Stop** before settlement, and see a stopped turn rather than a Voice error. After the parent hydration blocker is fixed, hard-reload the settled conversation and confirm the same Voice attribution remains without resubmission or replay.

**Previously impossible:** model-generated function arguments rather than completed audio transcription could become the answer; assistant playback could create a false user turn; cancellation could reopen capture before the provider settled; replay controls and durable Voice attribution were incomplete.

**Completion:** sections 1–6 close when their tests and focused checks pass. Mission acceptance additionally requires the real microphone, handoff, Stop, hard-reload, and same-origin route witness after the parent hydration fix. Mocked or server-only proof cannot substitute for that witness.

1. **Completed-transcript authority and half-duplex ownership.** Realtime session configuration has no tools, no model-created semantic-VAD response, and no automatic interruption policy. Only a unique completed transcript can reach the shared panel submission path. Duplicate, empty, failed, unavailable, stale, playback-overlapping/pre-handoff, and over-limit transcripts do not submit and produce the specified passive or recoverable notice. The microphone remains closed through assistant output and cancellation; **Your turn** opens only a post-barrier input turn. Oracle: transplanted-first cases in `openai-realtime-session.test.ts`, `realtime-brunch-bridge.test.ts`, `voice-turn-controller.test.ts`, `voice-interview-control.test.tsx`, and `voice-preview.integration.test.ts`.
2. **Idempotent admission.** Typed turns derive a stable key from the AI SDK message id; Voice turns derive it from connection epoch, item id, and content index. A repeated same-payload key converges on the original receipt, including `deduplicated: true`; a 409 `submission_conflict` surfaces the original `submissionId` without admitting another turn. An admission whose outcome cannot be established stays visibly ambiguous and is never automatically retried. Oracle: transport unit tests plus Voice integration tests asserting one admitted submission rather than one `send()` invocation.
3. **Acknowledged cancellation barrier.** `cancelOutput()` resolves only after input/output buffer clears, matching provider acknowledgements, and all targeted response terminal events. The latest mute preference wins while it settles. Audio captured before the handoff cannot submit afterward. Durable Stop remains a stopped Flue turn rather than a Voice failure. Oracle: donor-adapted session/controller race tests and the unsettled-Stop integration case.
4. **Canonical replay.** `canReadFullResponse`, `canRepeatQuestion`, `readFullResponse()`, `repeatQuestion()`, and the playback menu retain and enqueue exact canonical segments without a simplifier. Replay enables only after the matching response terminal and output completion and remains disabled during submission, capture, cancellation, pause, and errors. Oracle: canonical speech, controller, panel, and integration tests comparing segment identity and text.
5. **Durable Voice provenance.** An assistant message may retain multiple `voiceToolCallIds`; one failed sibling origin does not erase successful origins. Attribution survives canonical projection, hydration, and reopen through a supported Flue representation or deterministic reconstruction from durable correlation facts, never through user text. Oracle: snapshot projection, panel provenance, partial-failure, hydration, and reopen tests.
6. **Dormant ask removal.** If still present after restacking, the website does not register `brunchAskInteractiveTool` for Voice and canonical speech does not recognize `"brunch-ask"`. No spoken ask answer can enter a wait state the transport cannot resume. Oracle: registration/canonical-speech negative tests and a repository search showing no mounted Voice `brunch_ask` surface.
7. **Real witness and same-origin route.** After the parent hydration fix lands, a human performs one microphone turn, explicit interruption/handoff, durable Stop on an unsettled turn, and hard reload of a settled turn. The retained network route summary proves the absolute Flue `streamUrl` remains on the same-origin proxy. Oracle: `witness.md`, sanitized `voice-events.jsonl`, `network-routes.json`, canonical `flue-snapshot.json`, `settlements.json`, commit manifest, and hashes under `docs/evidence/implementations/mission-5-voice-safety-parity/`.
8. **Focused repository verification and truthful docs.** The requested four-workspace Turbo command passes. `apps/petrinaut-website/README.md` and `libs/@hashintel/petrinaut/docs/ai-assistant.md` describe half-duplex handoff, replay, Stop, transcript rejection, and durable attribution. If the published Petrinaut package changes, exactly one patch changeset covers it. Oracle: the command recorded in the PR and changeset inspection.

## Constraints

- Preserve the parent's one product route, memoized Flue client, browser `ChatTransport`, shared panel `useChat`, path-B Voice submission, canonical speech selection, durable Stop seam, and SDK observation hydration. Do not rebuild them.
- Transplant relevant regression tests before implementation. Reimplement donor behavior semantically against the current Flue path; donor branches and PRs are never merged, cherry-picked, rebased, rewritten, retargeted, or closed by this implementation.
- Derive one deterministic admission key per logical delivery. Treat `deduplicated` as successful convergence and `submission_conflict` as evidence of the already-admitted submission. Do not automatically retry an ambiguous admission.
- Normalize completed transcripts exactly once with trim plus Unicode whitespace collapse, then enforce the 32,000-code-point bound. Provisional text remains ephemeral and display-only.
- The half-duplex microphone is closed during output, cancellation, pause, error, and submission states. A cancellation promise is part of the turn boundary, not a cosmetic animation state.
- Brunch canonical text is never summarized, shortened, paraphrased, or regenerated for speech or replay.
- Preserve every surviving Voice origin independently. Provenance must use supported Flue data or deterministic durable correlation; never encode it in visible user text.
- Do not fix the parent's admission/Stop races, stream cancellation, hydration overwrite, client-tool classification, response/submission correlation, CI, title, or body. Restack onto Lu's fixes; report any blocker.
- Keep local playback cancellation, local observation cancellation, HTTP request cancellation, and durable `abort()` distinguishable in code, UI, tests, and evidence.
- No simplifier, structured questions, live `brunch_ask`, Petri-net generation/mutation, FE-1575 workpiece work, production identity, CORS/remote deployment, or panel `useChat` removal.

### Expected touched paths

```text
~ apps/petrinaut-website/src/main/app/voice-interview/             transcript authority, half-duplex state, cancellation, replay tests/code
~ apps/petrinaut-website/src/main/app/local-storage-demo/          path-B correlation and dormant ask removal if still present
~ apps/petrinaut-website/src/server/voice/                         Realtime policy tests/code
~ libs/@hashintel/brunch-agent/packages/transport-aisdk/           stable idempotency and canonical projection/provenance tests/code
~ libs/@hashintel/petrinaut/src/react/voice-session/                public Voice state required by the panel
~ libs/@hashintel/petrinaut/src/ui/views/Editor/panels/             Your turn, replay menu, durable provenance
~ apps/petrinaut-website/README.md                                  operator behavior
~ libs/@hashintel/petrinaut/docs/ai-assistant.md                    end-user behavior
? .changeset/                                                       one patch changeset if published Petrinaut changes
+ libs/@hashintel/brunch-agent/docs/evidence/implementations/mission-5-voice-safety-parity/  donor matrix and gated witness
```

## Fog-line

- **Parent movement.** Lu owns #9528 and may push more commits. Before each implementation phase, compare the GitHub head and restack this branch; an observed parent change is adopted only through restack, never copied into this branch.
- **Durable provenance representation.** Inspect the current Flue event/snapshot vocabulary and existing correlation facts before choosing between a supported persisted metadata field and deterministic reconstruction. If neither can preserve multiple origins without a second authority or user-text encoding, stop with the exact missing platform seam.
- **Conflict normalization.** The installed SDK exposes the 409 contract through `FlueApiError.body: unknown`. Narrow only the documented envelope needed to recover `error.meta.submissionId`; do not create a general error protocol or infer success from prose.
- **Dormant `brunch_ask`.** Remove or gate only the parent surfaces that remain after the next restack. If Lu has already removed them, record the parent commit and make no duplicate change.
- **Hard-reload witness.** Hold proof leaf 7 until the parent's hydration overwrite is fixed. Unit/integration tests for this branch may cover deterministic projection, but they cannot substitute for the blocked real witness.

## Stop or reorient

Stop and report if the work would require direct Voice `send()`, a second transcript or conversation authority, hand-rolled stream offsets/recovery, automatic retry after ambiguous admission, canonical text rewriting, a live structured-question path, or any excluded parent fix.

Stop if half-duplex handoff cannot guarantee that pre-handoff audio is rejected and post-barrier audio is fresh, or if provider acknowledgements cannot bound `cancelOutput()` without inventing events. Stop if provenance requires visible-text smuggling or a second durable store. Stop if replay can enable before both matching terminal conditions, or if local cancellation invokes durable abort.

Do not manufacture the hard-reload witness while the parent hydration defect remains. Retain the blocker and wait for a new parent head.

## Deferred

- The real witness and same-origin absolute-`streamUrl` observation wait on the parent hydration fix; once unblocked, they are part of this mission rather than a successor.
- Donor retirement waits until this replacement is accepted and each donor owner explicitly approves closure. Do not close #9496, #9500, #9507, or #9512 as an implementation side effect, and never close stakeholder-owned H-6763.
- Response preparation/simplification, structured questions, Petri-net work, FE-1575, production identity, CORS/remote deployment, and panel migration away from `useChat` remain in their existing owners or the future mission spine.
