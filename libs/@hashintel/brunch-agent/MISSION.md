# Experiment Live Full Brunch Integration

## Status

The provider-free implementation and manual Brunch-backed sessions establish the
dual WebRTC handshake, canonical input admission, tool-backed Brunch work and
settled commentary handoff. They do not establish naturalness, transcription
fidelity or production readiness. Acceptance is blocked by phantom input observed
during silence and by server-VAD splits that can exceed the existing one-waiting-input
policy. FE-1712 owns capture-constraint investigation; Kostandin owns further live
testing. The PR records exact checks and limitations. No agent-started provider
session is authorized.

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
→ frozen canonical speech source → delegation-correlated Live commentary and native
unbuffered delivery. Live's native client-delegation loop supplies timing metadata,
never canonical input or another backend invocation. An unserved delegation receives
an instruction to ask the person to continue, not a fabricated backend answer.
Settlement gates supplied Brunch context, not all audible speech.

### Owner decisions

- **2026-09-14:** Kostandin requests the existing Thinking dock status during
  Brunch work. Map submitted/streaming composer status to Thinking only while Live
  is connected, not stopped, and not playing output; preserve connection/error
  precedence and Speaking during playback. This is local status presentation,
  not `session.thinking.append`, progress speech, a new invocation or proof of
  completion.
- **2026-09-14:** Kostandin accepts the bounded consent UI correction on an isolated
  FE-1664 checkout: use a plain voice-permission heading, concise OpenAI voice and
  transcription disclosure, permission checkbox, Start voice and Cancel. Remove
  experiment-specific warnings from this surface, not from the retained mission
  risks. Keep the compact dock and viewport controls stationary while consent opens
  above them; show Voice setup rather than Connecting before Start.
- **2026-09-12:** Kostandin accepts a Live prompt delegation policy describing Brunch's
  interview, follow-up and model-building capabilities; delegation-id correlation of
  settled commentary; `session.instructions.append` for delegations Brunch cannot
  serve; and replacing the local 500-byte commentary cap with provider validation
  correlated through `client_event_id`. `session.thinking.append` for event-backed
  progress is not accepted.
- **2026-09-11:** Kostandin accepts `gpt-4o-transcribe` with default `server_vad`
  for canonical transcription, including the risk of splitting hesitation into
  separate submissions. Native Live speech, canonical admission and queue policy
  remain unchanged.

### Selected experiment

- **Input:** use a separate OpenAI transcription-only session for canonical user
  text. The model is `gpt-4o-transcribe`, using browser WebRTC and the
  existing server credential boundary. One consented microphone capture supplies
  Live and transcription; neither session starts automatically. Disclose the second
  stream in the concise voice-permission surface. Separate transcription still
  incurs additional provider usage; simplifying the disclosure does not change it.
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
  delegate substantive questions/answers to Brunch using the official personality,
  backchannel, interruption and Delegation policy structure. Brunch interviews the
  person, asks follow-ups and builds/updates the model. Live has no tools or independent
  substantive answers; it delegates before answering and does not guess while waiting.
  These are best-effort instructions, not an enforced output boundary. Independent
  questions, lost corrections and unsupported claims are manual failure observations,
  not canonical answers or evidence that work succeeded. No Live tool authority.
- **Canonical result handoff:** retain complete-turn settlement and source freezing
  before sending Brunch prose as commentary. A finalized input claims the most recent
  unclaimed client delegation; a later delegation attaches to the newest turn without
  one. Send its opaque ID unchanged, or `null` when none is attached. Dropped input,
  failed turns and textless settlements with a delegation receive
  `session.instructions.append` saying the backend could not take that request now
  and asking the person to continue. No delegation event admits input itself.
  Commentary is paraphrasable and provider-limited to 500 tokens: send the frozen
  source intact once, without a local byte cap, truncation, chunking or replay.
  Match commentary/instruction acknowledgements by `client_event_id` and rejections
  by `error.client_event_id`; distinguish local send failure, provider rejection and
  unknown acceptance. Stop invalidates pending correlations and ignores late events.
  Acceptance is not playback. Full reports stay on screen; longer-source delivery
  after provider rejection remains unresolved, not grounds for a new queue.

The browser path avoids a new service and reuses existing credentials. Transcription
configuration belongs on `/v1/realtime/client_secrets`; the server retains the returned
short-lived credential and exchanges raw SDP at `/v1/realtime/calls`. The SDK's
multipart calls configuration only types `realtime`, not `transcription`. This is a
handshake correction within the selected WebRTC/credential boundary, not a new input
policy. Both requests share the existing deadline and neither is retried.
Keep both connections under one session lifetime: failure/Stop invalidates late
callbacks and tears down media
without an automatic standalone or Realtime fallback. Do not infer playback completion
from commentary acceptance, use it to release pending work, or restore historical audio.
Acoustic interruption remains native Live behavior; durable composer Stop still
cancels canonical work separately and must immediately silence local playback.

### Inspected departure and stack

- Base: `ln/fe-1573-mission-7c`, [#9667](https://github.com/hashintel/hash/pull/9667),
  pinned for this restack at [dee90599e9](https://github.com/hashintel/hash/commit/dee90599e9a07d9fa3e55d0711c14491e9ce5c7c).
  Its host-owned tools, document lifecycle, revision tracking and conversation
  binding are inherited, not replaced by the old voice host.
- Parent: `kostandin/fe-1663-experiment-live-full-duplex-migration`, #9671, based
  on #9667. It retains the standalone Live experiment, activity indicators,
  microphone-loss shutdown, bounded uploads and disconnect recovery.
- Child: `kostandin/fe-1664-experiment-live-full-brunch-integration`, #9673,
  targets #9671 and adds canonical Brunch integration. Activity remains telemetry,
  never a turn or playback-completion signal.
- Kostandin reports that the standalone experience looks fine. The exact tested
  revision was not supplied. This supports proceeding, not comprehensive
  acceptance. Keep the original comparison revision separately from the restacked base.

Mission 7c remains owned by #9667 and preserved in its pinned source, including
`libs/@hashintel/brunch-agent/MISSION.md`; the standalone contract remains in
#9671's `apps/petrinaut-website/MISSION.md`. This child closes neither mission.
The website mission points to this voice authority. The newer future spine and
successor drafts are retained; consumed Mission 7b drafts are not resurrected.

### Cold-start reads

Read [AGENTS.md](AGENTS.md), this mission and the
[retained Voice/recovery record](MISSION.next.md#voice-after-the-live-transport-cut).
The base and parent above preserve their respective contracts at
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
| Transcription creation | `api/voice/transcription-session.ts` composes `createOpenAITranscriptionSessionHandler`, with the existing credentials and enablement boundary. The accepted recut requires `/v1/realtime/client_secrets` to configure `type: transcription`, `gpt-4o-transcribe` and server VAD with provider defaults. The server uses that credential for a raw-SDP `/v1/realtime/calls` exchange. Neither credential reaches the browser. Origin, upload size, abort and timeout failures are bounded; unknown creation is never retried automatically. |
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
that witness. Manual sessions crossed this path, including tool-backed work, but
also exposed phantom and lost input. Mocked tests establish item ordering,
deduplication, admission correlation, complete-turn settlement and teardown; they
do not establish transcription accuracy, speech adherence or naturalness. Strict
native output eligibility is deliberately not a claim.

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

Current provider-free evidence lives in the named website, Brunch and Petrinaut
suites above; the PR records the latest command results. It establishes boundary
behavior with mocked provider and media, not a real Brunch interview.

The accepted tracer sends each frozen commentary source intact once and relies on
provider validation of its 500-token cap, with correlated application-authored
notices for send failure, rejection or unknown acceptance. No progress commentary
is injected before settlement. Cross-submission `answeredBySubmissionId` and
multi-turn recovery still rely on the existing host and need the Live
operation/correction/recovery witness; these checks do not establish that broader
path.

### Manual acceptance obligations

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

The recovery checks gate readiness. Failure remains visible and returns to the owner
rather than becoming a new store, cross-store transaction or concurrency project
by default.

## Constraints

### Continuing boundaries

- Native client delegation changes timing/correlation only. Keep `gpt-4o-transcribe`
  canonical input and Brunch as sole authority, with prompts/models inherited from
  #9667 unchanged by voice work. Add no
  session, store, queue, service or provider call. `session.instructions.append` is
  admitted only to resolve attached delegations Brunch cannot serve; thinking/progress
  appends remain unaccepted. Provider validation replaces only the 500-byte safeguard,
  not no-truncation, no-chunking, no-retry, no-replay or Stop/cleanup requirements.
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
  overwrite, merge, deploy or Notion writes. Only the explicitly authorized restack
  may rewrite the two voice branches; #9667 and unrelated worktree files stay
  untouched. Provider-free verification and draft stack publication are allowed.

## Fog-line

- `session.thinking.append` for event-backed progress is **not yet accepted**. Whether
  progress improves the interview without duplicate or unsupported speech requires
  owner selection after the first manual exchange; do not implement it now.
- Delegation/transcription timing correlation is a selected heuristic, not proof of
  semantic alignment. Provider-free tests can establish the claim rule and append
  outcomes, not that Live waits, avoids repetition or speaks a settled answer.
- Phantom input during silence remains unexplained. Server VAD can split hesitation
  into separate inputs, and the unchanged one-waiting-input policy can lose further
  speech. FE-1712 must distinguish speaker feedback from headphone input and record
  whether capture constraints change either failure.

Official documentation inspected 2026-09-11:
[migration](https://developers.openai.com/api/docs/guides/live-migration),
[Live reference](https://developers.openai.com/api/reference/resources/live/),
[server controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live).

The selected input proposal additionally uses the current official
[transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription)
and [VAD guide](https://developers.openai.com/api/docs/guides/realtime-vad).
The [client-secret reference](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets)
and SDK transcription schemas expose GPT-4o transcription models and server VAD;
the [model card](https://developers.openai.com/api/docs/models/gpt-4o-transcribe.md)
lists Realtime support. This makes `gpt-4o-transcribe` with server VAD the selected
candidate, not proof of the exact transcription-only WebRTC handshake. Documentation
examples do not establish that entire path. Completed-transcript events, out-of-order
reconciliation and dual-session cleanup are checked with mocks. Actual provider
compatibility and transcription/Live disagreement remain manual-test obligations.

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
   OpenAI path above. Live testing established the path and exposed phantom and
   lost input that still block acceptance.

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

If `gpt-4o-transcribe` rejects the current client-secret or SDP exchange, inspect the
provider failure rather than silently changing VAD, switching models or adding
application silence timers. Any model, transport or interaction-policy change
requires an approved recut.

Reorient if live testing reproduces phantom input, loses or reorders finalized
speech, revives stopped work, invents progress, or lets Live answer substantive
questions independently. FE-1712 must first distinguish capture feedback from
transcription behavior. If the experiment cannot meet its interaction bar, retaining
Realtime is a recommendation, not an automatic session fallback.

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
speech/transcription fidelity remain Kostandin's manual observations, not agent
verdicts.

- [Mission 7c on #9667](https://github.com/hashintel/hash/blob/dee90599e9a07d9fa3e55d0711c14491e9ce5c7c/libs/%40hashintel/brunch-agent/MISSION.md)
  is provisionally closed for engineering review, not worked-example acceptance.
  Mission 7d inherits the unresolved example obligations; voice does not claim or
  change that acceptance.
- [Distribution and breadth](docs/mission-drafts/worked-example-distribution-and-breadth.md)
  retains complete-bundle copying, fixture distribution and portfolio obligations.
- [After-demo evaluation](docs/mission-drafts/7-explainable-construction.md) retains
  full-region semantic, behavioural, passage, adversarial and lifecycle evaluation.
- [Future spine](MISSION.next.md) retains general repeat/change/retirement,
  concurrency/reviewer, optimisation and other source/plugin work. Its Mission 7c
  references describe the upstream mission, not another live mission on this child.
