# H-6763 realtime-audio prototype plan

Date: 2026-08-24
Status: active
Linear: H-6763 — support for realtime audio interviewing of domain experts

## Decision to make

Choose the voice edge for the September Petrinaut elicitation experience without moving
authoritative conversation state or elicitation policy out of Brunch.

Two experiments answer different questions:

1. **OpenAI Realtime with dummy tools** establishes the interaction-quality ceiling without
   porting Brunch prompts, state, or tools.
2. **ElevenLabs around the real elicitor** tests whether a speech edge can preserve the accepted
   architecture while providing an acceptable experience.

ElevenLabs is the default architectural lean. OpenAI Realtime wins only if its interaction quality
is materially better and the team explicitly accepts the demonstrated porting cost.

## Accepted placement and boundaries

- `apps/petrinaut-website` owns the user-facing voice controls and provider adapters.
- `apps/brunch-agent` remains the Petrinaut-independent remote elicitor server.
- The existing AI SDK `/api/chat` transport remains the real-elicitor seam.
- Brunch owns authoritative session history, structured questions, captures, and provenance.
- Providers may own browser audio, ASR, TTS, endpointing, and interruption detection, but their
  conversation history is never authoritative.
- Partial transcripts are display-only. Only admitted final human utterances may become evidence.

## Prototype sequence

### 0. Establish the base

- Branch H-6763 from Lu's FE-1437 monorepo-import branch while it is under review.
- Verify the real Petrinaut panel can reach `apps/brunch-agent` through `/api/chat`.
- Keep the stock assistant unchanged when the prototype is disabled.

### 1. Shared website shell

- Add a query-enabled prototype panel to the local-storage Petrinaut application using only
  `?voiceExperiment=openai-realtime` and `?voiceExperiment=elevenlabs-brunch`.
- Select an experiment for the lifetime of the page. Never switch providers inside an active
  conversation; changing experiments must dispose the adapter and reload into a new conversation.
- Add shared hold-to-speak, start/end controls, scenario script, connection state, visible
  transcript, and event/timing log.
- Keep the shell behind a narrow adapter contract covering connect, turn start/finish, disposal,
  and normalized observable events. Provider conversation and tool models stay private.
- Keep provider credentials server-side.
- Instrument transcript, response, and tool events for side-by-side evaluation.

### 2. OpenAI Realtime experiment

- Connect over WebRTC.
- Use a small interview prompt and representative dummy tools only.
- Record perceived latency, transcript quality, tool-call reliability, and the Brunch behavior that
  would need to be copied or bridged.
- Stop before porting the real elicitor.

### 3. ElevenLabs experiment

- Use ElevenLabs for the browser audio edge and speech conversion.
- Submit each final transcript through the real Brunch human-input path.
- Stream the elicitor's text response back for speech playback.
- Prove a spoken answer resumes the same `brunch_ask` and yields the next real elicitor turn.

### 4. Team decision

Run the same scenario at least three times with each provider and compare interaction quality,
transcription, tool fidelity, elicitor fidelity, state integrity, integration complexity, and
remaining work to satisfy H-6763.

## Prototype exclusions

- Open microphone and interruption semantics
- Provider abstraction intended for production reuse
- Durable transcript persistence
- Live capture extraction from partial transcripts
- Net projection or client-tool mutation from the voice adapter
- Gemini Live unless both primary experiments fail or social fluency becomes decisive

## Prototype exit criteria

- One draft Petrinaut website PR contains the shared shell and both experiments behind an explicit
  query parameter.
- OpenAI Realtime completes the scripted interview with dummy tools.
- ElevenLabs completes at least one real `brunch_ask` suspend-and-resume cycle.
- Both experiments have short recordings and a completed comparison table.
- The team records a provider decision before production hardening begins.

## Post-decision work

The winning path then adds monotonic turn ids, transcript persistence, private browser sessions,
cancellation and stale-audio invalidation, live captures with provenance, open-mic/VAD, and the
end-session transition to the separate IR-to-net projection and Petrinaut draft.
