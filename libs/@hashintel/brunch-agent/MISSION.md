# Experiment Live Full Brunch Integration

## Status

Live mission for provider-free implementation and Kostandin's later manual testing.
The accepted policy is committed separately in authority commit
`10d8f5c11a951916767ac40be63cd5741943a021`. The short-turn integration has passing
provider-free checks, but transcription credential creation rejects semantic VAD
with HTTP 400, `invalid_value` on `session.audio.input.turn_detection`.
No transcription SDP exchange is reached with semantic VAD. The owner accepts the
narrow server-VAD recut for a separately committed authority change followed by
local implementation and provider-free checks. The first real no-tool exchange and
manual acceptance remain unproved. No new push or provider-session authorization
is granted by this recut.

[FE-1664](https://linear.app/hash/issue/FE-1664/experiment-live-full-brunch-integration)
depends on [FE-1663 / #9671](https://github.com/hashintel/hash/pull/9671) and retains
[FE-1661](https://linear.app/hash/issue/FE-1661/evaluate-gpt-live-1-migration-effort-before-the-demo)
as the migration assessment. This is the child branch's sole execution authority.

## Imperative

Preserve a fluid, realistic interview while Brunch directs it and performs real
application work. The person has room to hesitate, elaborate, correct consequential
details and continue while Brunch reasons or executes. Avoid repetitive
acknowledgements, monologues, irrelevant questions, lost corrections and unsupported
progress/completion claims. A possible release claim is “Talk naturally while Brunch
updates the model, without losing corrections.” It is not established yet.

## Throughline

Finalized transcription → existing composer/submission path → one Flue admission
→ Brunch reasoning and authorized Petrinaut execution → complete-turn settlement
→ frozen canonical speech source → Live commentary and native unbuffered delivery.
Settlement gates supplied Brunch context, not all audible speech.

### Owner decisions

- **2026-09-11:** Kostandin accepts the proposed transcription-only switch from
  semantic VAD to server VAD with provider defaults, including the risk of splitting
  hesitation into separate submissions, and authorizes its separate local
  mission-only authority commit before dependent implementation. Native Live
  speech, canonical admission and queue policy remain unchanged.

### Selected experiment

- **Input:** use a separate OpenAI transcription-only session for canonical user
  text. The model is `gpt-live-transcribe`, using browser WebRTC and the
  existing server credential boundary. One consented microphone capture supplies
  Live and transcription; neither session starts automatically. Disclose the second
  stream and additional provider usage in the existing consent surface.
- **Finalization:** consume `conversation.item.input_audio_transcription.completed`
  for its `item_id` and `content_index`; deltas and Live delegation notices cannot
  admit text. Use provider-supported turn detection to commit audio chunks, not
  application silence timers. Use `server_vad` with provider defaults rather than
  unmeasured tuning. A final transcript is final for that audio item, not proof
  the person has finished their thought or that transcription is semantically correct.
- **Ordering:** transcription completions can arrive out of order. Reconcile them
  against provider committed-item ordering before offering finalized text to the
  existing composer. Keep session/item identity through duplicate detection and
  admission correlation. This transport reconciliation is not a new application
  FIFO: preserve the existing one-waiting-input policy, expose inability to retain
  further input, and never silently replay uncertain admission or substitute Live's
  transcript when transcription fails.
- **Speech:** play native Live audio without an approval buffer. Instruct Live to
  defer substantive questions/answers to Brunch and use only event-backed progress.
  These are best-effort instructions, not an enforced output boundary. Independent
  questions, lost corrections and unsupported claims are manual failure observations,
  not canonical answers or evidence that work succeeded. No Live tool authority.
- **Canonical result handoff:** retain complete-turn settlement and source freezing
  before sending Brunch prose as commentary. This gates context supplied to Live,
  not all audible speech. Commentary is paraphrasable and limited to 500 tokens;
  keep full reports on screen and do not silently truncate or claim exact relay.
  The first short exchange must fit; longer-source delivery remains a specific
  follow-up design question, not grounds for a premature chunk/playback queue.

The browser path avoids a new service and reuses existing credentials. Transcription
configuration belongs on `/v1/realtime/client_secrets`; the server retains the returned
short-lived credential and exchanges raw SDP at `/v1/realtime/calls`. The SDK's
multipart calls configuration only types `realtime`, not `transcription`. This is a
handshake correction within the selected WebRTC/credential boundary, not a new input
policy. Both requests share the existing deadline and neither is retried.
Live provider compatibility remains unproved. Keep both connections under
one session lifetime: failure/Stop invalidates late callbacks and tears down media
without an automatic standalone or Realtime fallback. Do not infer playback completion
from commentary acceptance, use it to release pending work, or restore historical audio.
Acoustic interruption remains native Live behavior; durable composer Stop still
cancels canonical work separately and must immediately silence local playback.

The separate authority commit satisfies the implementation prerequisite. The owner
now authorizes committing the integration and publishing a draft child PR on the
parent branch, without rewriting the parent's history or merging either experiment.

### Inspected departure and stack

- Published parent: [b72c2ac9f83875d34f585bc672ef62496144fe6a](https://github.com/hashintel/hash/commit/b72c2ac9f83875d34f585bc672ef62496144fe6a),
  branch `kostandin/fe-1663-experiment-live-full-duplex-migration`, #9671 open.
  The authorized child-only restack includes the parent's media-activity indicators,
  revised standalone instructions, microphone-loss shutdown and bounded/cancellable
  SDP uploads. Activity remains telemetry, never a turn or playback-completion signal.
  The original standalone comparison remains
  [771712c1af](https://github.com/hashintel/hash/commit/771712c1afe2d4f3d3e5ee8fac39d17303bee7a1).
- Remote main: [67f60d5446ed3224609161f938e1b36bc9d62f89](https://github.com/hashintel/hash/commit/67f60d5446ed3224609161f938e1b36bc9d62f89),
  the initial inspected baseline and an ancestor of the parent. Local main is older at
  [74f37ab517](https://github.com/hashintel/hash/commit/74f37ab517fc7f67eebc3514c863a1893807b782).
  #9562 is merged; its inherited mission/PR pre-merge wording is stale status,
  not evidence that its code is absent or that its deferred acceptance passed.
- Main is now [35587f9dd2](https://github.com/hashintel/hash/commit/35587f9dd2a795d44aac1938aff74e0acab4d994),
  including #9649's construction, host, recovery and mission changes. That main delta
  is not included in this child or its parent. Coordinate the stack update before claiming
  compatibility with those newer host contracts; do not restack the parent independently.
- Child: `kostandin/fe-1664-experiment-live-full-brunch-integration` in
  `/Users/kostandin/Projects/hashdev/worktrees/fe-1664-live-brunch-integration`.
  Eventual PR targets the parent branch while #9671 remains unmerged. Recheck
  both remote heads before resuming; inspect deltas and coordinate any stack update.
  Do not rebase or modify the parent independently.
- Only the published parent revision is imported. The protected parent worktree
  and branch remain untouched by this child's restack.
- Kostandin reports that the standalone experience looks fine. The exact tested
  revision was not supplied. This supports proceeding, not comprehensive
  acceptance. Keep the original comparison revision separately from the restacked base.

The outgoing Mission 7a and Ex1 contracts remain preserved at the pinned published
parent at their original paths. This independent child does not close either parent
mission or claim its outstanding acceptance. The website mission is a pointer to
this authority. The consumed integration draft is removed; 7b, after-demo evaluation,
construction/reviewer/optimisation and shared recovery obligations retain their
existing homes in [the future spine](MISSION.next.md).

### Cold-start reads

Read [AGENTS.md](AGENTS.md), this mission and the
[retained Voice/recovery record](MISSION.next.md#voice-after-the-live-transport-cut).
The parent commit above preserves the outgoing contracts at
`libs/@hashintel/brunch-agent/MISSION.md` and `apps/petrinaut-website/MISSION.md`.
Use the actual seams below for current signatures. Mission 6b's accepted causal
Voice/mutation/Stop behavior is regression input, not proof of the explicitly
deferred direct-user hydration, post-settlement withholding or latency claims.

Reuse Ex1's session handler, WebRTC, consent, provider selection and cleanup; do
not rebuild the standalone experience or add another panel. Use client delegation,
not managed Responses. The first milestone is one short, no-tool exchange, not
a tool-heavy interview. Only after inspecting that exchange should the line add
one already-authorized operation, correction during work, acoustic interruption
and durable Stop. Kostandin performs live testing; the agent runs mocks only.

### Actual seams, not a ready-made adapter

Paths below are relative to the repository root.

| Boundary | Inspected contract and consequence |
| --- | --- |
| Live startup | `apps/petrinaut-website/api/voice/live-session.ts` composes `createOpenAILiveSessionHandler({environment, fetch})`. The server validates origin/SDP/enablement, creates client-delegated `gpt-live-1`, returns `{sessionId, sdp}` and does not retry unknown outcomes. |
| Live media | `createLiveConversation(onState, connectionTimeoutMs, onFinalizedInput)` returns `{start, stop, appendCommentary}`. One consented capture feeds two WebRTC sessions. Transcription completed items are reconciled against committed predecessor IDs; Live deltas/delegations never admit input. Audio remains native and unbuffered. |
| Live controls | `LiveConversationControl` receives canonical messages, submission resolution, settlements and response/Stop subscriptions. `LiveBrunchBridge` calls the existing admission helper and freezes correlated prose only at complete-turn settlement. Local end/pause silences both sessions; canonical Stop also invokes that local teardown. |
| Transcription creation | `api/voice/transcription-session.ts` composes `createOpenAITranscriptionSessionHandler`, with the existing credentials and enablement boundary. `/v1/realtime/client_secrets` configures `type: transcription` and `gpt-live-transcribe`; the accepted recut requires server VAD with provider defaults instead of the rejected semantic VAD. The server uses that credential for a raw-SDP `/v1/realtime/calls` exchange. Neither credential reaches the browser. Origin, upload size, abort and timeout failures are bounded; unknown creation is never retried automatically. |
| Canonical entry | `voice-interview-control.tsx` exposes `submitVoiceInputWithAdmission`: subscribe before composer submission, correlate stable message identity to Flue admission, race abort, distinguish ambiguous/rejected/conflicting admission. `submitVoiceInput` retains at most one waiting input; abort withdraws only unsubmitted work. |
| Canonical source | `canonical-speech.ts` selects non-streaming assistant prose, with message/part/hash/submission identity and a marked question only if it occurs in finalized prose. This is source selection, not whole-turn or playback approval. Workpiece, reasoning, basis and raw tool payloads are excluded. |
| Baseline delivery | `realtime-brunch-bridge.ts` can call `speakCanonical` for completed segments while chat is streaming. Its test “speaks a completed canonical segment while chat remains streaming and settles separately” makes that intentional. Preserve Realtime; do not label this whole-turn-gated Live delivery. |
| Host history | `BrunchPanelConversationTracker.canReplaceMessages` rejects absent/in-flight/incomplete snapshots and resolves `answeredBySubmissionId`. `local-storage-demo-app.tsx` joins admissions, settlements, history and durable Stop. Keep these source contracts rather than substituting a latest-message lookup. |
| Execution | `apps/brunch-agent/src/provider-admission.ts` buffers complete proposals and refuses mixed server/browser calls, multiple browser calls and inconsistent streamed/final arguments. Construction bindings and observed effects remain authoritative; a proposal approval is not settlement or speech eligibility. |

## Proof

### First real-turn milestone

One finalized input enters the existing composer with stable identity, produces
one Flue admission and one correlated Brunch answer, settles completely, and is
offered to Live as frozen commentary. Kostandin compares the actual audible answer
with that source, including whether it was heard at all; append acceptance is not
that witness. Record premature independent speech separately. The local integration
is prepared; no live witness exists yet. Mocked tests establish item ordering,
deduplication, admission correlation, complete-turn settlement and teardown, not
transcription accuracy or live provider compatibility. Strict native output
eligibility is deliberately not a claim. Mocked events cannot prove speech adherence.

### Provider-free regression portfolio

Use the existing suites, extending only the newly crossed boundary. The portfolio
below names the intended checks; the executed subset and its limits follow it:

| Claim to test | Existing oracle / required discriminator |
| --- | --- |
| Realtime default, pinning, consent, isolation and cleanup | Website `src/server/voice/openai-live-session.test.ts`, `src/main/app/voice-interview/live-conversation.test.ts`, `live-conversation-control.test.tsx`, `voice-interview-control.test.tsx`. No provider creation before consent; no mid-session provider change or fallback. |
| Input identity and admission | `realtime-brunch-bridge.test.ts`, `voice-interview-control.test.tsx`; approved Live input tests must distinguish incomplete input, repeated text with different identity, duplicate identity, stale session and uncertain admission without replay. |
| Complete-turn source freeze | `canonical-speech.test.ts`, `buffered-admission.integration.test.ts`, bridge/controller tests; add Live-specific root plus textless/failed continuation cases. A completed earlier segment, a later correction, or `ready` without positive correlated settlement must not authorize sending the final Brunch source to Live. This does not gate independent native speech. |
| Stop and reconstruction | `voice-turn-controller.test.ts`, `brunch-panel-transport.test.ts`; Stop before admission, during work and after settlement; late events cannot revive speech, stale replacement cannot erase current output, reconnect cannot replay history. |
| Rejected proposals and effects | Brunch `test/provider-admission.test.ts`, `test/reconciliation.test.ts`, `test/integration/admission-controls.test.ts`; reject before browser execution and never narrate conflicting/unknown effects as successful or reapply them. |
| Mounted UI | Petrinaut `ai-assistant-panel.test.tsx` and `ai-assistant-panel/ai-assistant-contents.test.tsx`; switch AI/Workpiece during work, retain draft/Voice/Stop and verify cleanup. Inspect rendered changed states with provider endpoints mocked and real microphone blocked. |

Run affected `test:unit`, `lint:tsc`, `lint:eslint` and formatting checks via Yarn/Turbo
after actual code changes; read evaluation execution safety before hermetic runs.
Do not port the synthetic audio harness. Provider-free tests do not establish
speech fidelity, native full duplex, naturalness or migration readiness.

Executed provider-free checks on the child:

- Website `yarn test:unit`: 51 files / 554 tests. Includes the real admission helper
  and conversation tracker with mocked composer/provider boundaries. The Live bridge
  distinguishes stale completion positions, failed/textless continuations, Stop and
  uncertain admission. This is not a real Brunch interview.
- Website `yarn test:integration`: 2 tests using the built Brunch application and
  its existing faux-provider proposal/settlement probe. Brunch
  `yarn test:unit test/provider-admission.test.ts test/reconciliation.test.ts`: 45 tests.
  These retain existing host/effect regression evidence, not Live tool-turn acceptance.
- Petrinaut mounted `ai-assistant-panel.test.tsx` and
  `ai-assistant-panel/ai-assistant-contents.test.tsx`: 125 tests. They retain the
  AI/Workpiece, composer and Voice control contracts without changing their owners.
- Website typechecking, lint and production build, and Brunch production build pass.
  The remaining website lint warning is in the unchanged Realtime control. Existing
  compiler/chunk-size warnings are not migration-quality evidence.
- Browser consent and mocked microphone-rejection checks pass with zero session
  requests. Inspected captures are local-only / not portable:
  `apps/brunch-agent/.data-wipe-me/fe-1664-ui/{consent,error}.png`. They establish readable disclosure,
  disabled Start before consent, visible failure and consent reset, not connected
  audio. Tests ran under OS outbound-network denial; browser verification allowed
  loopback only and replaced microphone capture with a rejecting mock.

The first tracer sends at most 500 UTF-8 bytes per frozen commentary source, a
conservative bound beneath the API's 500-token cap. Larger sources remain on screen
with a visible notice; they are neither truncated nor queued for replay. No progress
commentary is injected before settlement. Cross-submission `answeredBySubmissionId`
and multi-turn recovery still rely on the existing host and need the later Live
operation/correction/recovery witness; these checks do not establish that broader path.

### Manual witness for the prepared integration

Allow about 15–20 minutes, with a familiar process and a disposable local document:

1. Give an account and answer one short Brunch clarification. Compare spoken
   questions and answers against the canonical Brunch text.
2. Hesitate, give a short answer, then elaborate. Correct a consequential number,
   negation or condition. Check that subsequent questions preserve it.
3. Request one operation available in the current authorized mode. Add one
   follow-up while work proceeds. Inspect admission order, workpiece and actual
   tool effects; a queued correction does not retroactively cancel execution.
4. Interrupt speech acoustically, then separately exercise composer Stop during
   work. Verify the microphone/audio state, queued input and canonical stop state
   separately. “Your turn” is not an acoustic-interruption witness.
5. Compare history, effects and audible responses. Record excess acknowledgements,
   missed answers, lost corrections and whether the interview advances. Separate
   backend work duration, queue wait and provider/playback delay. No numerical
   latency/naturalness threshold has been approved.
6. Before migration-readiness closure, include typed-origin, Voice-origin and
   durably aborted entries, close and reopen in a second tab without concurrent
   editing, and inspect per-message provenance/stopped presentation. Separately
   reproduce locally withheld post-settlement work. No autoplay or automatic
   resubmission is allowed. These remain unproved; FE-1604's waiver does not transfer.

The last recovery checks gate readiness, not unrelated hardening before the first
tracer. Failure remains visible and returns to the owner rather than becoming a
new store, cross-store transaction or concurrency project by default.

## Constraints

### Owner decisions

- **2026-09-11 — Native best-effort experiment.** The owner conversation accepts
  native Live with best-effort speech instructions, separate authoritative
  transcription and the mission recut, including one local mission-only commit.
  This explicitly replaces strict audible-output enforcement for this experiment,
  not canonical answer/tool ownership, queue policy or production acceptance.
  Independent questions and unsupported claims remain manual-test failures.
  No paid sessions or automatic microphone access are authorized. Manual testing
  belongs to Kostandin.
- **2026-09-11 — Publish the draft stack.** The owner authorizes removing Amp thread
  IDs from the child's unpublished commits, committing and pushing the integration,
  publishing its draft PR against FE-1663, and keeping both experiment PRs draft
  with template-based descriptions. This supersedes the no-product-commit and
  no-PR-publication restrictions, not provider, merge, deployment or parent-history
  protections. The unresolved connection failure remains a visible blocker.

### Continuing boundaries

- Brunch owns interpretation, substantive questions/answers, evidence sufficiency,
  workpiece meaning and tool selection. Flue owns canonical identity, admission,
  ordering, settlement and reconstruction. Petrinaut owns authorized native
  execution and observed effects. Live is conversational delivery, not a second
  domain agent in the intended division of responsibility. The selected experiment
  permits unbuffered speech that may violate that intention;
  measure those violations without granting canonical or tool authority. Never
  insert its paraphrase as another canonical assistant answer.
- Exactly `PETRINAUT_VOICE_PROVIDER=realtime|live`, unset `realtime`; reuse current
  enablement/credentials. Pin provider and delivery policy for the session. No
  `live-experience`, `live-brunch`, new provider framework, automatic replay or
  standalone fallback. The child's `live` path is the local integration; the pinned
  parent remains the standalone comparison. Neither is a migration-readiness claim.
- Retain current host queue policy. The one-waiting-input contract is not #9638's
  FIFO. Realtime's interruption preference and echo/noise filtering are transport
  behavior, not proof that native Live establishes input ordering. Interrupting
  audio, retaining/admitting speech, correcting pending work and durable Stop are
  four different actions. Corrections are subsequent Brunch input, not silent
  modification of an in-flight operation; if that strains the interview, surface
  the policy decision instead of changing it.
- Preserve #9562's complete proposal validation, bindings, actual effects, tool
  result metadata, history replacement and mounted controls. Unknown/conflicting
  execution cannot be reapplied or spoken as success. A completed explanation of
  a rejected operation differs from a failed/unfinished agent continuation.
- Exact relay and settlement-gated faithful rephrasing are different policies.
  The selected policy is best-effort paraphrasing from settlement-gated context,
  not settlement-gated audio. Fidelity is a manual criterion: preserve facts,
  quantities, negation, uncertainty, corrections and Brunch-authored questions;
  prompting cannot guarantee that. Keep complete
  reports visible. No truncation to fit 500 tokens and no private reasoning/raw
  payloads sent as “progress.” Only real application events may ground permitted
  acknowledgements. Keep them brief and non-repetitive as a prompting objective,
  with no claimed deterministic wording/frequency enforcement.
- No agent-started provider sessions/inference/microphone, synthetic recordings,
  audio harness, Brunch model/prompt edits, new service/infrastructure, donor host
  overwrite, parent-worktree/history changes, merge, deploy or Notion writes.
  Local provider-free work and the explicitly authorized draft stack publication
  remain allowed within current authority.

## Fog-line

Official documentation inspected 2026-09-11:
[migration](https://developers.openai.com/api/docs/guides/live-migration),
[Live reference](https://developers.openai.com/api/reference/resources/live/),
[server controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live).

The selected input proposal additionally uses the current official
[transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription)
and [VAD guide](https://developers.openai.com/api/docs/guides/realtime-vad).
They document `gpt-live-transcribe`, browser WebRTC, final transcript events and
out-of-order completion. The creation schema, item-order reconciliation and
dual-session cleanup are implemented and checked with mocks against that contract.
Actual provider compatibility and transcription/Live disagreement remain manual-test
obligations, not established results.

### Input: no supported native finalization marker

`session.input_transcript.delta` explicitly has no transcript-done event.
`session.delegation.created` carries an ID/timing/target, not final text. The
migration example's `readContext()` is an application callback that assumes a
ready context; it does not provide the missing finalizer. Silence, timeout,
delegation and transcript timestamps cannot serve as authoritative admission.

Input alternatives considered:

1. **Explicit review and composer submission:** the user approves the displayed
   draft text, making that frozen text authoritative. Late deltas cannot silently
   extend a submitted message. Not selected: it changes hands-free interaction
   and does not solve output eligibility.
2. **Separate authoritative transcription:** route consented input to a supported
   transcription lifecycle as well as Live, with stable capture identity and an
   explicit final event. This is a hybrid, with extra cost, timing/ordering,
   disagreement and cleanup obligations. Selected by Kostandin, with the concrete
   OpenAI path above; locally implemented but not live-tested.

### Output: context acceptance is not permission to hear speech

Live chooses when to speak even while Brunch works. `session.commentary.append`
supplies up to 500 tokens of paraphrasable context; `session.commentary.appended`
only acknowledges acceptance. It supplies neither exact relay, a response-scoped
audio association, nor speech/playback completion. `session.thinking.append` is
not a secrecy boundary. Sideband output timestamps describe audio ranges, not
which frozen Brunch answer authorized them or word-level playback. Live has no
Realtime-style per-response terminal event. Input mute does not stop output.

Output alternatives considered:

1. **Keep strict ownership:** retaining Realtime remains the application fallback,
   not an automatic session fallback or the selected experiment. A controlled hybrid
   could use authoritative transcription and bounded speech delivery; Live audio
   must remain muted/dropped unless eligible. Replacing Live's audible path would
   change what the experiment tests. Buffering native Live is only a feasibility
   candidate: source/audio association, coverage of late transcripts, approval,
   cancellation, completion, stale-audio removal and suppressed-context recovery
   must be justified before release. Its latency may defeat the goal.
2. **Change the speech policy explicitly:** permit native unbuffered Live speech
   with best-effort prompting and post-hoc inspection. This accepts the possibility
   of independent substantive questions/claims before settlement. This is the
   accepted experimental exception. Protected
   tool execution does not itself enforce speech ownership. This is not exact relay
   or enforced faithful rephrasing.

Neither input alternative fixes output, and output approval does not finalize input.
Both alternatives are explicitly selected by Kostandin. Neither the selected policy
nor draft publication establishes production acceptance.

## Stop or reorient

Kostandin's supplied terminal record for request `09162724-a422-425f-82df-976960dddc67`
shows HTTP 400 at `reading-transcription-secret`, with `invalid_value` on
`session.audio.input.turn_detection`, without timeout or cancellation. The submitted
value is `semantic_vad`; the provider rejects that configuration before SDP exchange.
This establishes neither that all transcription VAD is unsupported nor that a different
VAD configuration will connect. The successful parent Live connection does not validate
the added transcription connection.

**Accepted recut:** replace only transcription's
`semantic_vad` with provider-side `server_vad` using provider defaults, retaining
`gpt-live-transcribe`, WebRTC, completed-transcript admission, ordering and the existing
one-waiting-input policy. Keep native Live audio and best-effort speech control unchanged.
The [client-secret reference](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets)
lists server VAD for transcription, but acceptance for this exact model/session remains
unproved. Its silence-based boundaries may split hesitation or elaboration into separate
canonical submissions; they are not evidence that the person has finished their thought.
The alternative is explicit user-controlled commit, which changes hands-free interaction
and is not selected. Commit this accepted authority recut separately before dependent
implementation; do not bundle the product change into the authority commit.

The change's first oracle is Kostandin's manual connection attempt reaching
`answer-ready` and both ready sessions, followed by a short no-tool exchange. Compare
completed transcript items and canonical admissions while hesitating and elaborating;
premature or lost submissions fail the interaction test even if connection succeeds.
If the replacement is also rejected, stop and resolve provider compatibility rather than
silently disabling VAD, changing the model, or adding application silence timers.
Do not start a paid session to obtain this witness. Once connected, manually assess
the short no-tool exchange rather than reopening strict speech control as its prerequisite.
If the experiment fails, retaining Realtime is a recommendation, not a silent fallback.
Do not reopen FE-1624 based on Ex1's pleasant conversation. During later testing,
premature speech, lost corrections, reordered admissions, invented progress,
replayed uncertain execution or revived stopped speech require reassessment.

### Carry-over classification

Heads below were rechecked through GitHub; no donor code is imported.

| Source | Required data/authority contract | Realtime mechanism or policy disposition |
| --- | --- | --- |
| [#9585](https://github.com/hashintel/hash/pull/9585), [038e7471be](https://github.com/hashintel/hash/commit/038e7471be3f654d3612e411e8a3fc868eb348cd), open/paused | Full reports stay canonical and visible; delivery is not another answer. | Bounded offers/exact replay and Voice-specific prompting are experiment mechanisms, not copied. Negative short-answer naturalness is not a passing baseline. Brunch prompts stay unchanged. |
| [#9638](https://github.com/hashintel/hash/pull/9638), [a2d01de0b2](https://github.com/hashintel/hash/commit/a2d01de0b2a500164448b8d215609edde0e799e0), open/paused | Whole-turn settlement including textless continuations; frozen source; event-backed notices; no history autoplay or late speech revival. | Isolated `response.create`/response terminal machinery is Realtime-specific and cannot be fabricated in Live. Rephrasing fidelity and FIFO/Resume/Discard are explicit policies, not inherited authority here. |
| [#9651](https://github.com/hashintel/hash/pull/9651), [6af148d2eb](https://github.com/hashintel/hash/commit/6af148d2eb05e7d78a534aafa325189c3c309654), open | Distinguish canonical evidence, acknowledgements, actual audible answer and application effects. | No harness or synthetic recordings. Published evidence does not establish a successful live sweep; attribution, silent containers, pre-admission failures and playback wait must not become success claims. |
| [#9622](https://github.com/hashintel/hash/pull/9622), [1677453c87](https://github.com/hashintel/hash/commit/1677453c874eb94300e01f05ce79be1f543609d8), closed/unmerged | Model adherence is not proved by mocked routing. | Negative speech-authoring control, not a donor or permission for another Brunch prompt/tool variant. |
| [#9571](https://github.com/hashintel/hash/pull/9571), [8e45c9edc1](https://github.com/hashintel/hash/commit/8e45c9edc19171ea3721fdc8ca07fcf2bdf6e1de), closed/unmerged | Domain/conversation/execution boundaries and honest reconstruction remain required. | Planning only, not permission for autonomous interviewing or a second dialogue store. |

## Deferred

The shared [recovery obligation](MISSION.next.md#voice-after-the-live-transport-cut)
remains in the future spine. This experiment consumes its readiness witness, not
the old waiver. Broader construction, demo content, deployment, concurrency and
optimisation remain in their existing planning homes. Native naturalness and live
end-to-end compatibility remain Kostandin's manual observations, not agent verdicts.

- [Mission 7b](docs/mission-drafts/7b-september-demo.md) retains substantial worked
  scenarios, exploration/correction, explanation coverage, persona construction
  recording and selected-model tool/dynamics/delivery obligations on this pinned base.
- [After-demo evaluation](docs/mission-drafts/7-explainable-construction.md) retains
  full-region semantic, behavioural, passage, adversarial and lifecycle evaluation.
- [Future spine](MISSION.next.md) retains general repeat/change/retirement,
  concurrency/reviewer, optimisation and other source/plugin work. Reconcile these
  homes with #9649 on a coordinated stack update, without resurrecting consumed drafts.
