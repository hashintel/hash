# Mission 5 successor — Voice safety and UX parity on the unified Flue route

## Status

**Live as of 2026-09-04** for [FE-1580](https://linear.app/hash/issue/FE-1580/harden-voice-safety-and-ux-on-the-unified-flue-route) on `kostandin/fe-1580-harden-voice-safety-and-ux-on-the-unified-flue-route`, stacked directly on [PR #9528](https://github.com/hashintel/hash/pull/9528) at the GitHub-verified head `6ca81b7bc4d6c112ff3936c38a7209d07f773b8a`. This file is the sole execution authority for the successor branch. The restack adopts the parent's canonical hydration overwrite guard, multi-submission response correlation, settlement-driven durable Stop, aligned live/snapshot projection, queued Voice-input cancellation, and client-tool continuation behavior. The parent remains the authority for defects in those mechanisms; this branch must restack onto further parent fixes rather than repair them.

The owner selected **half-duplex turn ownership** on 2026-09-03. While canonical assistant audio is pending or playing, the microphone is closed. Ownership transfers away from input as soon as canonical speech is requested, before `response.create` is sent: every accepted unfinished input item becomes stale and provisional transcript state is cleared. The explicit **Your turn** action cancels output, waits for provider acknowledgement and response settlement, and only then opens a fresh input turn. Automatic duplex barge-in is rejected because assistant playback can become a false user turn.

On 2026-09-04, the owner approved a non-interactive Brunch-owned question
marker for exact **Repeat question** replay. The marker is a server tool plus a
durable client data part: it identifies exact assistant-authored text but never
suspends for an answer, mounts `brunch_ask`, or creates a second Voice submission
path. For direct-user Voice provenance, the owner selected an upstream Flue
user-metadata contract rather than a local runtime patch or correlated sidecar
signal. The [decision record](docs/evidence/design/mission-5-question-marker-and-provenance-decision-2026-09-04.md)
defines the accepted and rejected mechanics.

### Turn-ownership decision

1. **Adopted — half-duplex explicit handoff.** It gives assistant playback exclusive ownership, makes cancellation settlement a visible boundary, and guarantees fresh post-handoff capture. The product cost is one extra **Your turn** action and barrier latency when the user interrupts.
2. **Rejected — automatic duplex barge-in.** It offers the most conversational interruption and avoids an explicit control, but an open microphone can transcribe assistant playback as a user answer, and capture can race an unsettled cancellation. This risk is unacceptable for authoritative completed transcripts.

The parent now prevents its once-per-conversation canonical hydration from overwriting a locally submitted turn. The real microphone, handoff, Stop, hard-reload, and same-origin witness is therefore executable but remains unproved until the human witness and retained artifact bundle are complete.

Completed-transcript authority, half-duplex ownership, admission idempotency,
the cancellation barrier, exact full-response replay, and exact marked-question
replay have focused regression coverage, including the interval between a
canonical speech request and output start. **Repeat question** is enabled only
for an approved durable Brunch marker whose exact text appears in finalized
assistant prose from the same message; the final text segment remains invalid
question authority. Proof item 5 is complete
only for the supported client-tool-result path: Flue signals persist each
Voice-origin tool-call id beside its output, and canonical projection
reconstructs multiple surviving origins. Direct spoken user attribution is
blocked because Flue 2.0.3 projects the generated `submissionId` but neither
caller metadata nor the caller idempotency key. The discarded
browser-correlation implementation would have violated the explicit
second-durable-store stop condition. The restacked hydration guard removes the
old parent blocker, but no real witness claim is valid until the retained human
evidence exists.

The 2026-09-04 corrective verification covers the current 58-file successor
diff against #9528: the four focused race cases pass 4/4 tests, the filtered
production admission-outcome cases pass 3/3 tests, and the requested Turbo run
passes 30/30 tasks, including 249/249 website tests. Architecture validation
passes with 62 layers, 297 edges, 614 files, 63 generated pages, and 31 authored
pages. `git diff --check` and formatting of all formatter-owned successor files
pass. The root formatter remains red only outside this branch's diff: two
parent-owned #9528 files and an unrelated untracked `.cursor` plan. The exact
commands and dispositions are retained in the [donor matrix](docs/evidence/implementations/mission-5-voice-safety-parity/donor-behavior-matrix.md#corrective-verification).

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
→ exact full-response replay and supported client-tool Voice provenance
→ observe({ live: "sse" }) hydration and reopen
```

Realtime exposes no tools, uses `tool_choice: "none"`, and configures semantic VAD with `create_response: false`. Model function-call arguments are ignored even if a provider violates the policy. Provisional transcription is display-only and disappears without submission. OpenAI permits transcription completion for any committed audio item and does not guarantee completion order across turns; this mission deliberately accepts only an item whose matching `speech_started` boundary occurred during the current input turn. A boundaryless or completion-before-boundary item remains rejected rather than gaining authority retroactively. Requesting canonical speech ends that input turn before `response.create`: unfinished accepted items and their provisional display state are invalidated even if their transcription completes before output audio starts.

Local playback cancellation, local observation cancellation, the HTTP request `AbortSignal`, and durable conversation-wide `FlueClient.abort()` remain separate operations. The first three never masquerade as durable Stop; durable Stop never appears as a Voice transcription or playback failure.

## Proof

This mission closes the Voice safety and UX-parity stratum on the parent's route. It does not establish production identity, remote deployment, structured questions, a live `brunch_ask` capability, response simplification, workpiece mutation, or fixes for the parent's named defects.

### Product-manager litmus

**Release note:** Voice now submits only what the microphone actually transcribed, waits for a safe **Your turn** handoff before listening over Brunch, and can replay the exact full response or exact Brunch-marked question. Client-tool Voice origins survive canonical reopen. Restoring the Voice chip on direct spoken user messages remains blocked on an upstream Flue user-metadata contract.

**Demo script:** run `yarn dev:brunch` and select the Brunch preview. Speak one answer and see exactly one matching user turn. While Brunch is speaking, confirm the microphone remains closed, choose **Your turn**, wait for the handoff, and speak again. After the response and audio settle, use the playback menu to read the full response exactly and repeat only the exact Brunch-marked question; a missing or unmatched marker keeps that action disabled. Start another turn, press durable **Stop** before settlement, and see a stopped turn rather than a Voice error. Hard-reload the settled conversation and confirm the canonical turn remains without resubmission or replay; direct-user Voice-chip restoration additionally waits on the Flue projection seam.

**Previously impossible:** model-generated function arguments rather than completed audio transcription could become the answer; an accepted transcript could complete after canonical speech was requested but before output started; assistant playback could create a false user turn; cancellation could reopen capture before the provider settled; replay controls and multi-origin client-tool Voice attribution were incomplete.

**Completion:** the implemented portions close when their tests and focused checks pass. Exact question replay uses the Brunch-owned marker recorded below; direct-user provenance still needs the Flue re-entry seam recorded below. Mission acceptance additionally requires the real microphone, handoff, Stop, hard-reload, and same-origin route witness, plus the comparative Voice latency gate. Mocked or server-only proof cannot substitute for that witness or for real audible-latency samples.

1. **Completed-transcript authority and half-duplex ownership.** Realtime session configuration has no tools, no model-created semantic-VAD response, and no automatic interruption policy. Only a unique completed transcript can reach the shared panel submission path. Duplicate, empty, failed, unavailable, stale, canonical-speech-overlapping/pre-handoff, playback-overlapping, and over-limit transcripts do not submit and produce the specified passive or recoverable notice. Before sending `response.create`, a canonical speech request invalidates every unfinished accepted item, clears bridge/controller transcript state and provisional UI, and closes the microphone; a completion in the interval before output starts cannot submit or regain authority. **Your turn** opens only a post-barrier input turn. Oracle: transplanted-first cases in `openai-realtime-session.test.ts`, `realtime-brunch-bridge.test.ts`, `voice-turn-controller.test.ts`, `voice-interview-control.test.tsx`, and `voice-preview.integration.test.ts`.
2. **Idempotent admission.** Typed turns derive a stable key from the AI SDK message id; Voice turns derive it from connection epoch, item id, and content index. A repeated same-payload key converges on the original receipt, including `deduplicated: true`; a 409 `submission_conflict` surfaces the original `submissionId` without admitting another turn. An admission whose outcome cannot be established stays visibly ambiguous and is never automatically retried. Oracle: transport unit tests plus Voice integration tests asserting one admitted submission rather than one `send()` invocation.
3. **Acknowledged cancellation barrier.** `cancelOutput()` resolves only after input/output buffer clears, matching provider acknowledgements, and all targeted response terminal events. The latest mute preference wins while it settles. Audio captured before the handoff cannot submit afterward. Durable Stop remains a stopped Flue turn rather than a Voice failure. Oracle: donor-adapted session/controller race tests and the unsettled-Stop integration case.
4. **Canonical full-response and exact question replay.** `canReadFullResponse`, `readFullResponse()`, and the playback menu retain and enqueue all exact canonical text segments in order without a simplifier. A non-interactive `brunch_mark_question` server tool writes a durable `data-brunch-question` marker containing exact question text and tool-call identity. The selector accepts it only when the same finalized assistant message contains that exact text; there is no final-segment or punctuation fallback. `repeatQuestion()` queues only the accepted marked segment. Both replay actions enable only after the correlated Brunch response settles, matching Realtime output completes, and input is idle, and remain disabled during submission, capture, cancellation, pause, and errors. The marker never accepts an answer or changes Voice path B. Oracle: core tool, live transport, snapshot projection, canonical speech, controller, panel-host, and production-preview tests comparing marker identity and exact queued text while proving `brunch_ask` remains unmounted.
5. **Durable Voice provenance.** An assistant message may retain multiple `voiceToolCallIds`; one failed sibling origin does not erase successful origins. Persisted Flue client-tool-result signals support deterministic reconstruction after hydration and reopen. Direct spoken user messages remain Voice-attributed only while live because the canonical snapshot omits their caller origin. Re-entry requires a supported Flue user-message metadata/idempotency projection; browser storage and user-text encoding are rejected. Oracle: snapshot projection and panel partial-failure tests for supported origins, plus the [blocker record](docs/evidence/implementations/mission-5-voice-safety-parity/provenance-blocker.md).
6. **Dormant ask removal.** If still present after restacking, the website does not register `brunchAskInteractiveTool` for Voice and canonical speech does not recognize `"brunch-ask"`. No spoken ask answer can enter a wait state the transport cannot resume. Oracle: registration/canonical-speech negative tests and a repository search showing no mounted Voice `brunch_ask` surface.
7. **Real witness and same-origin route.** A human performs one microphone turn, explicit interruption/handoff, durable Stop on an unsettled turn, and hard reload of a settled turn. The retained network route summary proves the absolute Flue `streamUrl` remains on the same-origin proxy. Oracle: `witness.md`, sanitized `voice-events.jsonl`, `network-routes.json`, canonical `flue-snapshot.json`, `settlements.json`, commit manifest, and hashes under `docs/evidence/implementations/mission-5-voice-safety-parity/`.
8. **Comparative Voice latency.** Ten comparable real-audio trials at pinned donor #9496 head `c7fe8a2e68e8fdc37018b21ec2e9daf4e9ef7c82` and ten at the final restacked candidate use the same machine, browser, microphone/input phrase, model configuration, warm/cold-start policy, and finalized-speech-to-first-audible-canonical-TTS boundary. The candidate median must not regress, and its p95 regression must remain below 20%. The donor runs from an isolated worktree without changing its branch. Oracle: retained raw sanitized samples, calculation method, environment, both commit SHAs, median, and p95; a comparison that cannot be run reliably leaves this proof incomplete.
9. **Focused repository verification and truthful docs.** The requested seven-workspace Turbo command passes, including `@hashintel/brunch-agent`, `@hashintel/brunch-agent-binding-flue`, and `@hashintel/brunch-agent-plugin-sdcpn`. `apps/petrinaut-website/README.md` and `libs/@hashintel/petrinaut/docs/ai-assistant.md` describe half-duplex handoff, exact full-response and marked-question replay, Stop, transcript rejection, and the direct-user attribution limitation. If the published Petrinaut package changes, exactly one patch changeset covers it. Oracle: the command recorded in the PR and changeset inspection.

## Constraints

- Preserve the parent's one product route, memoized Flue client, browser `ChatTransport`, shared panel `useChat`, path-B Voice submission, canonical speech selection, durable Stop seam, and SDK observation hydration. Do not rebuild them.
- Transplant relevant regression tests before implementation. Reimplement donor behavior semantically against the current Flue path; donor branches and PRs are never merged, cherry-picked, rebased, rewritten, retargeted, or closed by this implementation.
- Derive one deterministic admission key per logical delivery. Treat `deduplicated` as successful convergence and `submission_conflict` as evidence of the already-admitted submission. Do not automatically retry an ambiguous admission.
- Normalize completed transcripts exactly once in the Realtime bridge with trim plus Unicode whitespace collapse, then enforce the 32,000-code-point bound. The generic panel validates but does not mutate that already-normalized Voice payload. Provisional text remains ephemeral and display-only.
- The half-duplex microphone is closed from the canonical speech request through output, cancellation, pause, error, and submission states. The request invalidates accepted unfinished input before `response.create`; only an acknowledged **Your turn** handoff can establish fresh post-request capture. A cancellation promise is part of the turn boundary, not a cosmetic animation state.
- Brunch canonical text is never summarized, shortened, paraphrased, or regenerated for speech or replay.
- Preserve every surviving Voice origin independently. Provenance must use supported Flue data or deterministic durable correlation; never encode it in visible user text.
- Do not fix the parent's admission/Stop races, stream cancellation, hydration overwrite, client-tool classification, response/submission correlation, CI, title, or body. Restack onto Lu's fixes; report any blocker.
- Keep local playback cancellation, local observation cancellation, HTTP request cancellation, and durable `abort()` distinguishable in code, UI, tests, and evidence.
- No simplifier, interactive or suspending structured questions, live `brunch_ask`, Petri-net generation/mutation, FE-1575 workpiece work, production identity, CORS/remote deployment, or panel `useChat` removal. The approved non-interactive question marker annotates existing assistant prose only; it is not an answer path or affordance.

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
- **Conflict normalization.** The installed SDK exposes the 409 contract through `FlueApiError.body: unknown`. Narrow only the documented envelope needed to recover `error.meta.submissionId`; do not create a general error protocol or infer success from prose.
- **Dormant `brunch_ask`.** Remove or gate only the parent surfaces that remain after the next restack. If Lu has already removed them, record the parent commit and make no duplicate change.
- **Question-marker compliance.** The owner selected `brunch_mark_question` plus a durable client data part. The remaining implementation uncertainty is whether the model follows the instruction on every eligible question. Missing or unmatched markers must degrade by leaving **Repeat question** disabled; they never justify inference from final prose. Product proof covers structural correctness, not a universal model-compliance rate.
- **Direct-user Voice provenance.** Flue 2.0.3 and current upstream `main` expose a generated `submissionId` but not caller metadata or `idempotencyKey` on canonical user messages. The owner selected an upstream Flue user-metadata contract. Keep this leaf blocked until a released seam can be adopted; do not patch Flue locally, add a provenance signal admission, add sidecar persistence, or encode origin in user content.
- **Human product evidence.** The hydration overwrite guard is present after the restack, so proof leaf 7 may run. Unit/integration tests still cannot substitute for the real microphone/hard-reload witness, and server or synthetic timing cannot substitute for proof leaf 8's first-audible-audio measurements.

## Stop or reorient

Stop and report if the work would require direct Voice `send()`, a second transcript or conversation authority, hand-rolled stream offsets/recovery, automatic retry after ambiguous admission, canonical text rewriting, a live structured-question path, or any excluded parent fix.

Stop if half-duplex handoff cannot guarantee that pre-handoff audio is rejected and post-barrier audio is fresh, or if provider acknowledgements cannot bound `cancelOutput()` without inventing events. The provenance stop condition has fired for direct spoken user turns: the browser-store implementation was removed and the unsupported leaf is recorded as blocked pending upstream Flue support. For **Repeat question**, stop rather than infer question identity when the approved marker is absent or does not exactly match finalized assistant text. Stop if either replay action can enable before both matching terminal conditions, or if local cancellation invokes durable abort.

Do not manufacture the hard-reload witness or latency samples. If the human/browser environment cannot produce reliable observations, retain an incomplete evidence record and request the missing action explicitly.

## Deferred

- The real witness, same-origin absolute-`streamUrl` observation, and comparative latency gate require human browser and microphone evidence; they are part of this mission rather than a successor.
- Direct-user Voice attribution after canonical hydration waits on a released upstream Flue caller-metadata projection seam. The owner rejected a local Flue patch and correlated signal sidecar for this mission.
- Donor retirement waits until this replacement is accepted and each donor owner explicitly approves closure. Do not close #9496, #9500, #9507, or #9512 as an implementation side effect, and never close stakeholder-owned H-6763.
- Response preparation/simplification, structured questions, Petri-net work, FE-1575, production identity, CORS/remote deployment, and panel migration away from `useChat` remain in their existing owners or the future mission spine.
