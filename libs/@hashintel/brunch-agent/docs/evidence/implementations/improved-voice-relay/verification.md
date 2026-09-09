# FE-1630 — Improved Relay evidence

## Status

Implemented as a bounded experiment under the separately committed [historical branch contract](mission.md), including Kostandin's explicitly approved [local Flue 2.0.3 context patch](flue-context-patch.md). This is **not upstream-supported functionality**. The credential/routing blockers below are historical. Real local before/after observations and an inspected audible demonstration now exist. Post-merge preview inspection is blocked by the same Voice configuration HTTP 500 on this PR and the parent preview; human acceptance remains outstanding.

**Recommendation: the relay still fails for short local follow-ups; use this evidence to reconsider #9571.** The final clarification remained 151 words and required the Brunch round trip before even a non-substantive notice (7.437 seconds after completed transcription). Bounded delivery fixed automatic report reading and the observed Realtime preamble, not conversational responsiveness. This recommendation does not authorize or establish the correctness of split ownership; the long-report/tool-stall findings alone do not select it.

- Issue: [FE-1630 — Optimize and measure the Brunch Voice relay](https://linear.app/hash/issue/FE-1630/optimize-and-measure-the-brunch-voice-relay) _(internal)_, created in FE / brunch-agent and assigned to Kostandin Angjellari.
- Branch: `kostandin/fe-1630-improved-voice-relay`.
- Dedicated worktree: `/Users/kostandin/Projects/hashdev/worktrees/fe-improved-voice-relay`. It already existed, clean, on a placeholder branch; only that branch was renamed. CORS, donor, and ownership worktrees were not modified.
- Foundation: [#9564](https://github.com/hashintel/hash/pull/9564), pinned at [bfd99d38fe53baa2ec15045dadf585f4c7890ffc](https://github.com/hashintel/hash/commit/bfd99d38fe53baa2ec15045dadf585f4c7890ffc).
- Related future design: [#9571](https://github.com/hashintel/hash/pull/9571), untouched. FE-1624 was not reused or changed.

## Requested experiment and preserved boundary

Determine whether Voice-mode prompting and bounded Realtime delivery make the existing relay sufficiently natural. Deliver implementation, comparable before/after observations, and a short demonstration video. Record one short clarification and one long analytical response before changing prompts, after verifying corrected API usage on the latest foundation. Do not reimplement or broaden the tool-order fix.

Brunch must receive a supported Voice-mode hint in effective system context, without changing canonical user text or inventing provenance. Voice answers should be conversational and concise, put necessary questions/conclusions first, avoid preambles/repetition, preserve consequential qualifications, and retain complete detailed reports on screen. Typed turns must remain unchanged.

Realtime must retain no domain tools or authority. Application-requested bridging may contain only short non-substantive phrases, never evidence interpretation, workpiece confirmations, domain follow-ups, qualification changes, or tool calls. Autonomous semantic-VAD responses must remain disabled. Long reports should be announced as available on screen, offered for reading, and read verbatim only on request. Diagnostics must distinguish bridging from canonical speech.

Preserve shared Voice → Flue → Brunch routing, canonical transcript/UI content, admission, correlation, interruption, durable Stop, tools, and reopen without autoplay or duplication. Split ownership, delegation/`clarify_by_voice`, client-tool handback, sidecar storage, persistence-only Flue extensions, and workpiece/provenance redesign remain out of scope.

## Observed prerequisites

### Foundation moved during setup

The worktree initially matched remote [704f961aea2109a2297efa877898a76bb6e29818](https://github.com/hashintel/hash/commit/704f961aea2109a2297efa877898a76bb6e29818). During setup, Lu's remote branch was restacked and gained the cancelled-response retention fix. Before making any tracked change, this empty child was moved to the new foundation above. `gh stack` is unavailable; no parent or sibling branch was rebased or pushed.

#9564 remained **OPEN**, with `mergedAt: null`, when checked on 2026-09-08. No preview deployment was tested. If the parent moves again, the final reviewable PR must be restacked and all affected evidence re-pinned; the old checks do not establish the new base.

The latest subsequently available head was [743c3c89c1f11309f49fe97ab97f93b3437adb0e](https://github.com/hashintel/hash/commit/743c3c89c1f11309f49fe97ab97f93b3437adb0e). Its exact Git tree equals the tested pin's tree (`7faa9e5e5724f57eba3021979634e24af638d4fb`), so the experiment used the latest parent content.

#9564 then merged at **2026-09-08 16:29:59 UTC**, as [fb96f213188da885becd3248fdbe6e84abb65877](https://github.com/hashintel/hash/commit/fb96f213188da885becd3248fdbe6e84abb65877). GitHub retargeted #9585 to main. A normal merge of `origin/main` at [94dff8e33c](https://github.com/hashintel/hash/commit/94dff8e33c) reconciled ancestry without rewriting remote history. Every conflicted main-side file was byte-identical to the pinned foundation; the experiment's existing version was retained. The merge changed no Brunch/Voice/transport product file, patch, package resolution, or lockfile. All 258 targeted tests passed again afterward. No parent or sibling was changed.

A later normal merge of `origin/main` at [ef0f444987](https://github.com/hashintel/hash/commit/ef0f4449876d63d82657147fb4e29cdf024e9f79) retained the current repository `MISSION.md` and preserved this experiment's unaccepted contract beside its evidence as [`mission.md`](mission.md). That was the only content conflict; no experiment product file conflicted.

### No supported per-turn Voice hint on canonical user deliveries

At baseline, both installed `@flue/sdk` and `@flue/runtime` were unpatched 2.0.3. Their upstream public `DeliveredMessage` contracts allow `kind: "user"`, `body`, and optional image attachments. Only `kind: "signal"` supports attributes. `send` admits a message, creation-only `initialData`, `uid`, and an idempotency key; it has no per-turn instruction/context option. `useDelivery()` exposes the message, not its idempotency key or HTTP request context. `useInitialData()` is immutable and cannot distinguish later typed and Voice turns in the same conversation.

Authoritative 2.0.3 source: release [bf86b8726f5ba189844185fdbeca0e194344ded1](https://github.com/withastro/flue/commit/bf86b8726f5ba189844185fdbeca0e194344ded1), pointing to source [ac610378741d879a9d12d3f927ff9634e0b4f7ae](https://github.com/withastro/flue/commit/ac610378741d879a9d12d3f927ff9634e0b4f7ae).

- [SDK send contract](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/sdk/src/public/send.ts).
- [Runtime delivery types](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/runtime/src/types.ts).
- [HTTP admission validation](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/runtime/src/runtime/schemas.ts).
- [Delivery hook](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/runtime/src/hooks/use-delivery.ts) and [instruction hook](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/runtime/src/hooks/use-instruction.ts).

Changing Voice users into signals, adding a separate admission, carrying mode in user text, or storing an application-side mode map would not establish the requested supported per-turn system-context contract. None was implemented. Kostandin subsequently approved the version-pinned dependency-patch exception, recorded separately in the historical branch contract and patch maintenance note. It adds delivery-scoped JSON context and recovery in existing records, without a new store or provenance claim.

### Real local baseline blocked by provider authentication

The unmodified local app was built and started at `127.0.0.1:4321`; the real Petrinaut panel ran at `127.0.0.1:4915/?brunch-fixture=crew-reservation-v1`. Browser inspection reached the prepared net, AI panel, and Voice consent screen through the same-origin `/agents/chat` proxy. The initial history 404 for a fresh conversation was followed by fixture preparation.

The Brunch provider boundary failed during preparation:

```text
401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}
```

This initial authentication blocker was cleared by the user's updated root `.env.local`. No credential is included in this record. A secondary operational warning reported the local OpenTelemetry collector unavailable at port 4317.

### Local retry and synthetic-speech baseline — 2026-09-08

The retry found a second configuration issue: `VITE_BRUNCH_CHAT_ENDPOINT` still pointed to `http://127.0.0.1:4321/api/chat`. Changing the ignored root `.env.local` entry to `/agents/chat` restored the current same-origin Flue route. Fresh processes loaded the updated environment at Brunch `127.0.0.1:4322` and panel `127.0.0.1:4926`, with `BRUNCH_CHAT_ORIGIN=http://127.0.0.1:4322`. The original running processes were not restarted or modified. The fixture reached settled revision zero and displayed a real Brunch preparation response. OpenAI's models-list endpoint denied the restricted key's `api.model.read` scope, but the actual local Realtime call returned 200 and reached Listening; model-list permission is not needed for this Voice flow.

[Baseline record](baseline-2026-09-08.json) retains the exact canonical speech requests, provider output transcripts, selected timestamped events, and visible panel text. Method: local headless Chrome, macOS Samantha synthetic speech injected as a Web Audio MediaStream, real OpenAI WebRTC/transcription, and real Brunch/Flue with unchanged prompts. A continuously connected silent source was needed to let the synthetic stream deliver silence after speech; an earlier harness attempt did not finalize input and is not counted as a successful trial. Models were `claude-haiku-4-5` and `gpt-realtime-2`. This was two diagnostic turns, not a paid evaluation campaign or a human microphone witness.

| Baseline input | Observed result |
| --- | --- |
| “What does reserving a dispatch crew mean here?” | Brunch sent 192 whitespace-delimited words, including a prefatory compliment/explanation and a concluding question. Realtime emitted an additional 12-word preamble, “Let me walk through how that resource behaves and why it matters.” That string was absent from the canonical speech request. |
| “Give me a detailed analysis of this model, including assumptions, possible bottlenecks, missing constraints, and what still needs validation. Do not change the model.” | Brunch sent an 11-word preliminary statement followed by a complete 1,178-word report. The full report was automatically submitted for speech without a read-aloud request. Its summary remained visible on screen while Voice showed Speaking. Fixture revision zero and the absent target arc were unchanged. |

Browser-received event timings, **not first-audible measurements**: short input end → completed transcription was 7.854 seconds; completed transcription → first provider audio-buffer-start was 11.497 seconds. A second audio-buffer-start for the same response arrived at 26.663 seconds; these events carry a response id, not an output-item id. Long completed transcription → preliminary audio-buffer-start was 16.044 seconds; → report audio-buffer-start was 41.248 seconds. These single observations do not establish medians, percentiles, or regression bounds.

The short response was still Speaking at the capture. Clicking **Your turn** cleared the output buffer, received the provider's clear acknowledgement, and permitted the second input; it was not a durable Stop test. The long report was also still Speaking when the browser session ended. Provider output-transcript completion is not proof of completed playback. Both screenshots were inspected for visible canonical text, Voice status, and unchanged fixture revision. A silent browser recording was captured diagnostically, but it is not an audible demonstration of an optimized relay.

At this baseline checkpoint, after observations, human naturalness judgment, audible latency measurement, durable Stop/reopen witness, and optimized demonstration were still missing. The after section below records which gaps are now addressed. No preview test was run.

## Local verification

On the pinned new foundation, this targeted baseline command passed **4 files / 123 tests**:

```sh
yarn workspace @apps/petrinaut-website exec vitest run \
  src/main/app/voice-interview/realtime-brunch-bridge.test.ts \
  src/main/app/voice-interview/openai-realtime-session.test.ts \
  src/main/app/voice-interview/voice-turn-controller.test.ts \
  src/server/voice/openai-voice-policy.test.ts
```

These are existing deterministic relay/cancellation/policy tests, not proof of the proposed optimizations or real speech quality.

Setup needed a focused immutable install (`yarn workspaces focus hash @apps/brunch-agent @apps/petrinaut-website`) after the full install exhausted disk space. Only this run's partial `node_modules` was removed. The focused install passed with existing peer warnings. The initial transitive Turbo build failed at missing `redocly`; a direct backend-utils build reported missing generated graph/type-system dependencies. It emitted the telemetry dependency needed by Brunch, but that failed build is not claimed as passing. `yarn workspace @apps/brunch-agent build` then passed. Scoped Petrinaut, Petrinaut core, plugin, optimizer-client builds and website example generation made the local panel runnable. No unrelated generated source or toolchain-lock changes are retained.

Additional baseline checks passed:

- `yarn workspace @apps/petrinaut-website lint:tsc`.
- `yarn workspace @apps/petrinaut-website lint:eslint`: zero errors, one existing React set-state-in-effect warning at `voice-interview-control.tsx:627`.
- `yarn oxfmt --check` on `realtime-brunch-bridge.ts`, `openai-realtime-session.ts`, `voice-turn-controller.ts`, and `openai-voice-policy.ts`: all four matched files formatted correctly.

Those are baseline checks, not implementation verification. Brunch Markdown is excluded from repository Oxfmt/Markdownlint policy.

## Implementation and after observations — 2026-09-08

The transport derives `{ responseMode: "voice" }` from live Voice metadata on the existing user admission and causally linked browser-tool results. Automatic static-tool continuations inherit the originating live user preference; dynamic interactive answers use their own source. Automatic results are not labelled user-authored Voice evidence. Brunch reads only the fixed preference through `useDelivery` and adds fixed system instructions; arbitrary context instructions are ignored. Typed effective prompts remain byte-identical in the real-runtime isolation test.

The application withholds automatic reading above 120 whitespace-delimited words, 1,200 characters, or a fenced code block. This is a delivery budget, never canonical truncation. An already-completed short step can speak before a later long continuation appears; this does not predict future response length. Once a long response is ready, the application requests exactly “The full response is on screen. Choose Read full response to hear it.” Realtime receives no tools, `conversation: "none"`, and a bounded 256-token request. Autonomous semantic-VAD responses remain disabled. Bridging has distinct metadata/events and `speechKind: "bridging"` diagnostics, remains absent from canonical content, and is not counted as first canonical TTS latency.

### Comparable final run

[After record](after-2026-09-08.json) retains exact canonical text, relevant Realtime events, contexts, UI text, and Stop/reopen evidence. [Audible demonstration](demo-2026-09-08.mp4) is approximately 98 seconds, encoded at 15 fps with synchronized synthetic microphone and received remote audio. It was inspected with audio and screenshots, not merely captured. The same Samantha WAV inputs, models, prepared revision-zero fixture, and local Chrome path were used; the after run used a fresh conversation. Transcription omitted the long input's final period; its substance was unchanged. These are individual diagnostic observations, not statistical benchmarks or a paid evaluation campaign.

| Check | Before | After / verdict |
| --- | --- | --- |
| Short clarification | 192 words; additional unsolicited 12-word Realtime preamble | 151 canonical words, still repetitive and not suitably concise. It crosses the delivery budget, so only the offer is spoken. **Failed desired short-answer experience.** |
| Typed isolation | Ordinary typed behavior | Actual typed HTTP admission omitted context; real runtime test compares typed → Voice → Voice signal → typed → unknown preference. Typed system context is unchanged. |
| Long report | 11-word intro + 1,178-word report automatically queued | Complete 952-word report, including Summary, retained in UI. No canonical speech request before explicit reading; only the fixed offer. Real `getLatestNetDefinition` continuation retained Voice context. |
| Bridging authority | Unsolicited preamble absent from Brunch text | Both final offer transcripts exactly match the fixed string. No substantive claims, tools, or canonical transcript insertion. Observed compliance is not a provider guarantee. |
| Requested reading | Automatic report playback | **Read full response** submitted all 952 canonical words unchanged. Received text before cancellation is an exact prefix without paraphrase. Full uninterrupted acoustic reproduction was not tested. |
| Interruption | Your turn acknowledged buffer clear | During requested reading, Your turn sent cancel + buffer clear; provider reported `client_cancelled`; UI returned to Listening and retained the report. This did not abort Brunch. |
| Durable Stop and reopen | Not witnessed in baseline | A separately admitted typed turn received HTTP 202, then Stop called `/abort`. Stored Flue settlement is `aborted`. Two reloads emitted no POST/autoplay and retained each user turn once, plus the previous report. The transient “Response stopped” notice was not visible after reload; durable evidence is the Flue settlement. |

Final browser event timings, **not first-audible measurements**:

- Short input end → completed transcription: **9.015 seconds**; completed transcription → bridge audio-buffer-start: **7.437 seconds**, versus baseline 11.497 seconds to its first audio event. The after event is a notice, **not the answer**, so this is not a like-for-like answer-latency win.
- Long input end → completed transcription: **2.714 seconds**; completed transcription → offer audio-buffer-start: **34.709 seconds**. Baseline preliminary audio was 16.044 seconds and report audio 41.248 seconds; after intentionally waits for complete visible content before offering.
- Requested reading was interrupted about **7.4 seconds** after the application request. Generation runs ahead of playback; the received prefix does not establish which complete sentences were heard.

Demo landmarks: first offer around 00:29, silent report streaming around 00:54–01:22, report offer around 01:22, explicit reading around 01:27, Your turn around 01:34. It intentionally shows the failed concise-clarification outcome as well as successful bounded delivery.

### Retained negative findings and limitations

1. The initial after clarification was also verbose (roughly 170 words). Preferring one or two spoken sentences did not reliably fix it: the final answer is still 151 words and repeats its explanation. It contains literal `<brunch_mark_question>` markup instead of a proper marker tool call. The relay preserves that Brunch defect rather than silently editing it.
2. An initial long after turn settled in Flue but remained Thinking after `activate_skill` + `getLatestNetDefinition`; no client-result admission arrived. The final fresh run completed the real automatic continuation. The initial cause remains unestablished, so this is an unresolved reproduction, not a claimed fix or evidence selecting new architecture. No parent tool-order fix was broadened.
3. The initial 128-token offer budget was insufficient: one live response ended `incomplete / max_output_tokens` (29 text + 99 audio tokens), terminating the session. The budget was raised to 256, with failing-then-passing request tests; final offers completed at 117 and 143 output tokens. The finite ceiling still cannot guarantee provider behavior.
4. Canonical domain quality was not adjudicated. The report contains unsupported-looking capacity claims and a strong “correct” conclusion; preserving text does not validate those claims. No workpiece or net change occurred. The overlay and scrolling panel remain visually dense. No human participant accepted naturalness, and no first-audible latency benchmark was run.

### Final targeted verification

```sh
yarn workspace @apps/brunch-agent exec vitest run \
  test/petrinaut-chat.test.ts test/flue-delivery-context.test.ts \
  test/voice-context.test.ts test/architecture/boundaries.test.ts
yarn workspace @hashintel/brunch-agent-transport-aisdk test:unit
yarn workspace @apps/petrinaut-website exec vitest run \
  src/main/app/voice-interview src/server/voice/openai-voice-policy.test.ts
```

Results: Brunch **4 files / 33 tests**, transport **4 / 49**, website **10 / 176**. The session budget regression also passed **41 tests** after the 256-token correction. Builds passed for Brunch, transport, and website. `lint:tsc` and `lint:eslint` passed for all three affected workspaces, with zero errors; transport retains two existing sequential-await warnings and website one existing set-state-in-effect warning. Changed TypeScript/JSON Oxfmt and `git diff --check` outside the version-pinned patch fixtures complete the packet checks; the patch files preserve upstream tab-indented context that Git's outer whitespace check reports as space-before-tab. Selecting `boundaries.integration.ts` directly found no tests; the correct wrapper `boundaries.test.ts` subsequently passed.

The root package commit hook attempted an unrelated Rust `task-dependencies` build and exhausted local disk. Only that attempt's generated `target/` was removed; the dependency patch commit excluded that hook, retaining other hooks. No full monorepo clean-build claim is made.

### Preview inspection after the parent merge

At approximately **16:50 UTC**, after #9564 merged and the implementation's [Vercel deployment](https://vercel.com/hashintel/petrinaut/9T17j7A6mkBPsHpGhBAEyuRUT4ZX) reported success for [07458ed944](https://github.com/hashintel/hash/commit/07458ed944), the [PR preview](https://petrinaut-git-kostandin-fe-1630-improved-voice-relay.stage.hash.ai/) returned HTTP 200 and rendered the editor/AI panel without page exceptions. Its `/api/voice/config` returned **HTTP 500, `FUNCTION_INVOCATION_FAILED`**, so no Voice controls appeared. The rendered screenshot was inspected. An earlier inspection while the build was pending was only an alias-shell check and is not counted as current implementation proof.

The same request to the [#9564 preview](https://petrinaut-git-ln-fe-1580-reconcile-voice-resumable-workpiece.stage.hash.ai/api/voice/config) returned the same HTTP 500. This PR does not change that API entrypoint or its configuration handler. That comparison shows the failure also exists without this experiment; it does not establish the root cause. The available Vercel account has no Hash team access, so function logs could not be inspected. No deployment, environment, access policy, or backend was manually changed. Full preview Voice verification is blocked on diagnosing that shared failure and confirming a backend containing the local patch; local success does not establish remote patch deployment.

## Remaining gate and decision

Reconsider #9571 using the failed short-follow-up experience and its current Brunch round trip; do not describe the optimized relay as adequate. Bounded delivery is independently useful, but a notice is not an answer, Voice prompting is unreliable, and long reports remain slow. This is a scoped recommendation, not architecture approval or human acceptance. Keep #9571 untouched. Full preview verification and owner review remain outstanding; the parent merge gate is now open and ancestry reconciled. The experiment's historical branch contract is not marked accepted.
