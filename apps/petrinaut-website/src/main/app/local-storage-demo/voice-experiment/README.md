# Voice interview experiment

The local-storage demo can compare voice providers independently from the elicitor and projector:

- **Provider** handles speech input, turn detection, and speech output.
- **Elicitor** conducts the interview and records evidence.
- **Projector** converts settled evidence into a Petrinaut net.

## Experiment modes

- `voiceProvider=openai&elicitor=mock` uses OpenAI Realtime with experiment-only capture tools.
- `voiceProvider=openai&elicitor=brunch` uses OpenAI for speech with Brunch as the authoritative
  elicitor.
- `voiceProvider=elevenlabs&elicitor=brunch` uses ElevenLabs Speech Engine with Brunch callbacks.
- Adding `projector=mock` enables incremental and final mock-net projection.

ElevenLabs with the mock elicitor is unsupported because a Speech Engine conversation is bound to
its server-side callback. The legacy `voiceExperiment=openai-realtime` and
`voiceExperiment=elevenlabs-brunch` links remain available.

## Conversation behavior

Both providers use the same opening question and enforce alternating interview turns. The
microphone closes after a finalized expert answer and reopens only after interviewer playback ends.

### OpenAI Realtime

The session endpoint returns a short-lived client secret and selects a fixed server-owned
configuration. Server VAD detects the end of expert speech but does not create responses
automatically. The browser admits the next response only after receiving a non-empty finalized
transcript.

With `elicitor=brunch`, finalized expert transcripts go through Brunch's `/api/chat` transport.
Brunch owns interview state and `brunch_ask`; OpenAI only transcribes and renders Brunch text as
speech. The Brunch source text remains the authoritative displayed transcript.

### ElevenLabs Speech Engine

ElevenLabs owns browser WebRTC, recognition, endpointing, synthesis, playback, and interruption
detection. Its server callback forwards finalized expert speech to Brunch. The panel polls
server-side diagnostics for Brunch-owned transcripts and tool events because Speech Engine does not
push the equivalent stream directly to the browser.

## Mock projection

Add `projector=mock` to test the handoff from interview evidence to a visible net. Structured
capture calls are accumulated through a provider-neutral contract and debounced for 300 ms. Once
they form a coherent state-step-flow graph, the app creates one draft net and updates it by
revision.

An applied `brunch_sweep` emits the same readiness signal and projects the best available mock
draft. Refused sweeps do not trigger projection. **Finish and create net** forces a final projection
and uses a clearly labelled placeholder when structured evidence is unavailable.

Stale responses are discarded. Manual edits freeze automatic net replacement, and navigating away
from the draft prevents later projections from changing the active net. The saved local-storage
record includes the transcript, conversation id, projection revision, source, and warnings.

Examples:

- `/?voiceProvider=openai&elicitor=mock&projector=mock`
- `/?voiceProvider=openai&elicitor=brunch&projector=mock`
- `/?voiceProvider=elevenlabs&elicitor=brunch&projector=mock`

## Local development

OpenAI modes require `OPENAI_API_KEY` in the website's `.env.local`. Brunch mode also requires the
Brunch server on `127.0.0.1:4321`; the Vite proxy maps
`/api/voice-experiment/brunch-chat` to its `/api/chat` endpoint.

For ElevenLabs:

1. Set the same `ELEVENLABS_API_KEY` and `ELEVENLABS_SPEECH_ENGINE_ID` in
   `apps/petrinaut-website/.env.local` and `apps/brunch-agent/.env.local`.
2. Start Brunch on `127.0.0.1:4321`.
3. Run `yarn workspace @apps/brunch-agent voice:dev`.
4. Expose port `3001` through a public HTTPS tunnel and configure the Speech Engine WebSocket as
   `wss://<public-host>/ws`.
5. Open the desired experiment URL through the real-panel launcher.

Provider API keys remain server-side. The browser receives only short-lived OpenAI or ElevenLabs
credentials.
