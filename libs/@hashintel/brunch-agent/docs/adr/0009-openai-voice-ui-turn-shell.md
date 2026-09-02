# ADR-0009: OpenAI Realtime media plane, Brunch control plane

Date: 2026-08-26
Status: accepted for the bounded H-6763 preview stack
Extends: [ADR-0004](0004-in-petrinaut-staging-and-the-monorepo-import.md), which keeps Brunch and
Petrinaut composition in applications and reusable libraries mutually unaware
Preserves: [ADR-0003](0003-three-register-ir.md), which makes Brunch's capture fold authoritative,
and the [Petrinaut integration attach contract](../specs/petrinaut-integration.md#attach-contract)

## Context

H-6763 adds a spoken interface to a Brunch interview shown in Petrinaut. Brunch already owns the
durable AI SDK conversation, correlated `brunch_ask`, captures, completion and projection. OpenAI
Realtime provides a lower-latency media path with semantic turn detection, speech output and
WebRTC interruption, but its conversation history is neither durable nor authoritative.

The first rollout remains a disabled preview. Its authentication, distributed quotas, replay,
complete voice telemetry and final projection contracts are not production-ready.

## Decision

1. **Realtime is the media plane; Brunch is the control plane.** The app uses exactly
   `gpt-realtime-2` as an ephemeral duplex shell for microphone input, semantic turn detection,
   remote audio output and barge-in. Brunch alone chooses questions, updates interview state,
   records captures and decides completion. Realtime history is disposable.
2. **The website owns the bridge.** `apps/petrinaut-website` owns trusted OpenAI policy, WebRTC,
   strict GA event parsing and the Realtime–Brunch bridge. `@hashintel/petrinaut` continues to
   expose provider-neutral composer and Voice mode seams. Brunch packages contain no OpenAI code,
   and there is no generic voice-provider abstraction.
3. **Server policy is fixed.** The website server combines browser SDP with a trusted Realtime
   session and calls the unified `/v1/realtime/calls` endpoint. The session enables audio output,
   low reasoning effort, the `marin` voice and semantic VAD with low eagerness, automatic response
   creation and interruption. Optional provisional input transcription is display-only; neither it
   nor Realtime audio is persisted as chat history. API credentials, model selection, instructions
   and tools never enter browser-controlled configuration.
4. **One narrow function crosses the planes.** Realtime must call `continue_interview` once with a
   complete spoken answer and must not speak first. The browser validates streamed arguments,
   serializes calls and derives stable submission identity from the connection epoch and Realtime
   call ID. It submits through Petrinaut's existing composer path and accepts the result only when
   it correlates to the pending `brunch_ask`.
5. **Only canonical Brunch output may be spoken.** The bridge waits for the correlated Brunch turn,
   returns new canonical segments as the function result, then explicitly requests an audio-only
   response with no available tools. Initial and keyboard-triggered canonical segments use the
   same constrained response path. Realtime is instructed to speak only those strings in order;
   the visible Brunch text remains authoritative because generated speech is not guaranteed to be
   lexically identical. Canonical `response.create` requests are serialized behind Realtime
   response terminal events. Cancelled argument streams are discarded by response identity, and
   only exactly correlated provider no-op errors are treated as recoverable.
6. **The interaction is duplex.** The microphone stays active while the interviewer speaks and
   while Brunch handles a tool call. Semantic VAD finalizes turns without a required button.
   Speech during assistant audio interrupts playback and WebRTC truncates unheard provider audio;
   this does not roll back canonical Brunch history. Pause, end, failure and reconnect explicitly
   mute or release media and reject events from old connection epochs.
7. **State is orthogonal.** The browser exposes connection (`idle`, `connecting`, `connected`,
   `error`), input (`listening`, `paused`, `submitting`) and output (`idle`, `waiting-for-tool`,
   `speaking`, `interrupted`) independently. Presentation status is derived from these values, so
   partial transcripts and assistant playback never falsely imply that capture is off.
8. **The preview fails closed.** Malformed, duplicate, overlapping or stale provider events cannot
   create another Brunch submission or unrestricted conversational output. Provider errors and
   diagnostics never include audio, SDP, prompts, transcripts, canonical speech, credentials or
   provider response bodies. Text chat remains available, and production remains disabled.
9. **Voice mode stays inside the existing conversation.** Text and Voice mode share one transcript
   and composer. The empty trailing action is a waveform when Voice mode is available, becomes
   **Send** for typed text and remains **Stop** while the assistant is busy. The app-rendered Voice
   mode remains mounted inline as a compact state divider. Provisional speech appears immediately
   before it and is replaced by the finalized message or correlated tool output, whose waveform
   provenance is persisted without duplicating the answer. Typed text ends Voice mode before one
   shared-path submission and retains its draft if handoff fails. Closing the panel pauses media
   before hiding it and reopening shows the mounted session paused. First use requires consent;
   pause and end stay in overflow controls; actionable recovery keeps sanitized technical details
   collapsed.

## Consequences

- The transcription-only `gpt-live-transcribe` session, dedicated Speech API route, MP3 synthesis,
  browser playback queue and manual **Interrupt and speak** flow are removed. There is one permanent
  voice architecture.
- Realtime can affect timing and audio delivery but cannot author durable interview content. If it
  violates the canonical-output contract, the voice session fails closed while Brunch text remains
  visible.
- Voice mode is an inline part of the single conversation, not a separate conversation or
  out-of-panel surface.
- Exactly-once handling is scoped to a connection epoch plus provider call ID. Reconnect creates a
  new epoch and invalidates in-flight events and results from the previous connection.
- The existing production-disabled policy and Petrinaut text-composer behavior do not change.

## Verification evidence

- Policy tests pin `gpt-realtime-2`, low-effort reasoning, semantic VAD and the single required
  function. Session tests cover remote media attachment, automatic interruption, strict GA event
  parsing, tool-free canonical output, malformed events and cleanup.
- Bridge and controller tests cover streamed argument validation, pending-ask correlation,
  exactly-once submission, stale and duplicate rejection, asynchronous canonical response waiting,
  continuous capture, pause, end, reconnect and independent state transitions.
- Petrinaut panel and website view tests cover unified composer priority, inline ordering,
  provisional-to-final replacement, persisted provenance, stable mounting, typed handoff,
  pause-before-close, consent, recovery, overflow focus, throttled announcements and generated
  reduced-motion styles. The package build validates Panda extraction.
- A local integration test crosses the mocked unified Realtime handler, WebRTC data channel,
  `continue_interview`, Petrinaut composer boundary and canonical remote-audio request without a
  separate speech endpoint.

## Revisit condition

Revisit if `gpt-realtime-2` cannot enforce this server-owned session policy, if generated speech
cannot be constrained to canonical Brunch segments closely enough for the preview, or if production
authentication, replay, telemetry or projection requires a different application boundary. Do not
resolve those failures by making OpenAI history authoritative or by restoring a second voice path.
