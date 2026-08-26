# ADR-0009: OpenAI voice uses the app-owned UI turn shell

Date: 2026-08-26
Status: accepted for the bounded H-6763 preview stack
Extends: [ADR-0004](0004-in-petrinaut-staging-and-the-monorepo-import.md), which keeps Brunch and
Petrinaut composition in applications and reusable libraries mutually unaware
Preserves: [ADR-0003](0003-three-register-ir.md), which makes Brunch's capture fold authoritative,
and the [Petrinaut integration attach contract](../specs/petrinaut-integration.md#attach-contract)
Decided on: `kostandin/h-6763-petrinaut-composer-api`, from the approved H-6763 OpenAI voice plan

## Context

H-6763 adds spoken input and output to a Brunch elicitation shown in Petrinaut. The existing
production boundary already has the semantics the feature needs: one AI SDK UI-message stream,
the correlated `brunch_ask` tool, and a principal-owned conversation. A voice implementation can
either preserve that boundary or create a second conversation authority in the audio provider.
Only the first choice preserves Brunch's durable history, captures, pending asks, completion, and
projection contracts.

The first rollout is a disabled preview. The production contracts for authenticated ownership,
distributed quotas, telemetry, replay, and final Petrinaut projection do not all exist yet. The
preview therefore needs a boundary that permits input and output experiments without claiming
production recovery or public availability.

## Decision

1. **The host application owns voice.** `apps/petrinaut-website` owns OpenAI policy, WebRTC,
   transcript event parsing, half-duplex state, playback, feature UI, and server routes.
   `@hashintel/petrinaut` exposes only a generic composer control and finalized-text submission
   seam. Brunch packages contain no provider code.
2. **OpenAI is the only runtime voice provider.** Do not add a provider abstraction, selector,
   compatibility layer, or ElevenLabs dependency, configuration, route, script, test, or
   diagnostic.
3. **Realtime is transcription-only.** The server atomically combines browser SDP with trusted
   transcription policy and calls OpenAI's unified WebRTC initialization endpoint. The fixed
   model is `gpt-live-transcribe`. Semantic VAD begins at low eagerness as a tunable evaluation
   setting. Provider keys, prompts, vocabulary, language policy, and model selection remain
   server-side. Realtime never generates assistant responses.
4. **Completed provider items are the only admitted audio input.** Partials are display-only.
   Completed items are keyed by connection epoch, provider item ID, and content index, then enter
   the existing Petrinaut composer and AI SDK transport once. A pending `brunch_ask` uses its
   existing correlated tool-output path; otherwise the final becomes a stable-ID user message.
   A user-initiated correction is a new explicit message and opts out of pending-tool mapping
   rather than being silently inferred from its wording.
5. **The interaction is half-duplex.** The microphone is closed while Brunch is handling a turn
   and while speech is synthesized or playing. Barge-in and simultaneous listening and playback
   are out of scope.
6. **Speech receives canonical Brunch text exactly.** A dedicated OpenAI Speech request receives
   only finalized assistant text or the validated `brunch_ask.input.question` selected from the
   AI SDK message structure. The application does not scrape rendered DOM, ask Realtime to "say
   exactly," or ask a model to rewrite the text. Failure leaves the same text visible.
7. **The preview fails closed and is disabled by default.** Voice is unavailable when server
   policy, credentials, or the Brunch transport are unavailable. Text chat remains available.
   Public production remains disabled until FE-1439, FE-1420, platform authentication,
   distributed quotas, FE-1505 telemetry, and FE-1438/FE-1440 completion and projection contracts
   are available and consumed.

## Consequences

- Petrinaut's public API gains a generic host control with stable `submitText`, `stop`, messages,
  status, and optional conversation identity. Interactive tools may opt into a schema-validated
  text-to-output mapper. Keyboard and alternate finalized text therefore cannot bypass ask
  correlation by default; the host may explicitly target a separate message for a correction.
- OpenAI implementation names and policy stay in `apps/petrinaut-website`. The existing
  `transport-aisdk` package remains the sole browser-to-Brunch conversation transport.
- Preview PRs may demonstrate transcription and exact canonical speech before production
  recovery exists, but they may not claim durable redelivery, authenticated access, distributed
  rate enforcement, production telemetry, or final projection.
- A later provider choice, full duplex, sentence-level streaming speech, mobile support, or
  acoustic-pronunciation guarantee requires a new decision. Exact lexical input to Speech is the
  enforceable fidelity contract in this record.

## Revisit condition

Revisit if the unified OpenAI WebRTC initialization API cannot enforce server-owned transcription
policy; if the generic composer seam cannot preserve the existing AI SDK and `brunch_ask` paths;
or if production authentication, replay, telemetry, or projection contracts require a boundary
change rather than an application adapter. Do not address any of these by making browser or
provider history authoritative.
