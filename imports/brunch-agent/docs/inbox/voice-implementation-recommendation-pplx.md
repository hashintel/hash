## Recommendation

Use **ElevenLabs Speech Engine** first if your elicitation agent already has bespoke orchestration, state, tools, and an LLM loop. It is explicitly designed to put voice around an existing chat agent: ElevenLabs handles browser audio, transcription, TTS, connection lifecycle, turn-taking, and interruption detection, while your server receives transcripts plus history and streams text back. In TypeScript, an interruption aborts the in-flight LLM operation through an `AbortSignal`. [elevenlabs](https://elevenlabs.io/docs/overview/capabilities/speech-engine)

That fits your concern particularly well: your demo remains a text-/event-driven elicitation agent internally, and voice becomes an adapter at the edge. The trade-off is a cascaded pipeline—ASR → your model/agent → TTS—so it will generally have less native conversational prosody and potentially more latency than a true speech-to-speech model.

## Assessment of the options

| Option                       | Fit for your demo                                                                                      | What you still own                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ElevenLabs Speech Engine** | **Best initial choice** if you need your own elicitation logic, model choice, tools, and state machine | Your agent endpoint and streaming textual response; not audio turn-taking/interruption plumbing.  [elevenlabs](https://elevenlabs.io/docs/overview/capabilities/speech-engine)                                                                                                                                |
| **Gemini Live API**          | Strong native-audio alternative if conversational quality itself is central to the demo                | A stateful WebSocket integration and your tool/orchestration boundary. It supports barge-in, transcripts, proactive-audio controls, and function calling, but remains preview.  [ai.google](https://ai.google.dev/gemini-api/docs/live-api)                                                                   |
| **OpenAI Realtime**          | Strong option if you are happy to place the conversational model directly in OpenAI’s Realtime session | Some integration semantics remain—especially if you choose WebSockets rather than WebRTC. OpenAI recommends WebRTC for browser audio; with WebSockets, you own playback and explicit response truncation on interruptions.  [platform.openai](https://platform.openai.com/docs/guides/realtime-conversations) |
| **xAI Grok Voice**           | Worth a spike, especially if you want native speech-to-speech plus tool/MCP support                    | A realtime integration and evaluation of quality/reliability for your particular elicitation style. It has server VAD, adjustable silence/prefix padding, browser ephemeral tokens, and tool support.  [docs.x](https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech)                       |

## Corrections to the note

- I would not base a plan on **“GPT-Live-1”** as an available public API target. The current public OpenAI API documentation describes `gpt-realtime` / `gpt-realtime-mini` through the Realtime API, with WebRTC or WebSocket connections, VAD, interruptions, and function calling. [platform.openai](https://platform.openai.com/docs/guides/realtime-conversations)
- **Gemini Live** is publicly usable in preview, not merely nominally available. It is a native streaming voice/vision API over a stateful WebSocket and exposes interruption (“barge-in”), transcription, tool use, and response-timing controls. Preview still matters: treat it as a demo dependency, pin model versions, and retain a fallback. [ai.google](https://ai.google.dev/gemini-api/docs/live-api)
- **ElevenLabs Conversational AI is not limited to support/sales.** Their fully hosted product may be positioned that way, but Speech Engine is specifically for developers attaching voice to a custom agent and retaining control over model, routing, context, and tools. [elevenlabs](https://elevenlabs.io/docs/overview/capabilities/speech-engine)
- xAI’s protocol is **OpenAI-Realtime-shaped**, but not something I would call drop-in compatible. Its docs use familiar events such as `session.update`, `conversation.item.create`, and `response.create`, but add xAI-specific behavior—including remote MCP tools and `force_message`. Keep a thin provider adapter rather than assuming protocol portability. [docs.x](https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech)

## Suggested demo shape

```text
Browser
  ↕ managed voice transport / turn-taking
ElevenLabs Speech Engine
  ↕ transcript + history / streamed response
Your elicitation service
  ├─ elicitation state machine
  ├─ agent / LLM calls
  ├─ tool calls and persistence
  └─ structured event log + transcript
```

Keep the **authoritative elicitation state in your backend**, not in the voice provider’s conversation history. Treat each voice turn as an input event carrying: transcript, timestamps, confidence if available, interruption/cancellation status, and a monotonically increasing turn ID. On barge-in, abort the current agent generation and invalidate any subsequent TTS chunks from that turn.

## Practical approach

1. Build the demo with **ElevenLabs Speech Engine + your existing text agent**.
2. Use WebRTC in the browser when the provider supports it; it avoids much of the brittle client audio work and generally gives better media handling. OpenAI explicitly recommends WebRTC for browser output, and ElevenLabs’ voice SDK uses WebRTC by default. [platform.openai](https://platform.openai.com/docs/guides/realtime-conversations)
3. Run one short A/B spike against **Gemini Live native audio** only if the demo’s value depends on the agent sounding unusually socially fluent—acknowledgements, hesitation, overlap, and nuanced interruption behavior.
4. Keep a visible transcript and a push-to-talk fallback. It protects the demo from VAD ambiguity and lets you present the elicitation mechanics even if open-mic voice behavior is imperfect. OpenAI’s own documentation notes that push-to-talk can avoid VAD failures and feel responsive. [platform.openai](https://platform.openai.com/docs/guides/realtime-conversations)
