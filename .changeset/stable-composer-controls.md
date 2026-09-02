---
"@hashintel/petrinaut": patch
---

Add generic host-rendered AI composer controls and a persistent inline Voice session, protected
active conversations, keyboard fallback, and one-answer buffering while the normal chat stream
settles. Add the provider-neutral `renderVoiceMode` contract and export `PetrinautAiInputMode`, with
the selected input mode and mode-change callback available to host-rendered Voice modes. Include
stable finalized-text submission, conversation identity, stop handling, schema-validated
interactive-tool text mapping, explicit separate-message targeting for corrections, and a
queue-aware voice submission path. Present text and voice through one transcript and composer whose
trailing action switches between waveform, Send, and Stop. `renderComposerControl` remains a
supported public seam for hosts that only need their own control beside the message box,
independently of Voice mode. Surface assistant request failures as error toasts instead of
transcript entries.

Render every live Voice surface from a session snapshot the host reports through
`reportVoiceSessionState`, so hosts describe their session while Petrinaut owns its chrome. Replace
the composer with a low-profile Voice dock -- a canvas ribbon of three travelling waves, one leading
and two trailing it more faintly, fading out at both ends, opening with the microphone while
listening and moving under its own power through the same drawing path while the assistant speaks,
near flat while neither holds the turn, and naming one phase at a time -- with an announced phase and
reduced-motion behavior. Curve the raw microphone level before it drives the waves, so an ordinary
speaking level is plainly visible rather than a flicker above the line and a raised voice still has
somewhere to go. Sample the level per animation frame rather than through React, so drawing costs no
re-renders, and ease it against the frame delta so it looks the same at any refresh rate. Hold spoken
turns out of the transcript until the session ends, then reveal them together under a turn-count
divider, while typed messages and interactive tools awaiting an answer stay visible throughout. Let a
per-session Show transcription in chat action write those turns into the conversation as they land
instead. Keep every session control -- transcription, the microphone toggle, Resume, Reconnect, and
End -- in the dock, leaving the canvas toolbar untouched. Add `setMicrophoneMuted` to the Voice mode
controls and a `muted` session phase, so muting stops capture without interrupting what the assistant
is saying, unlike pausing. Surface voice recovery failures as toasts with privacy-safe diagnostic
references, and request one-time consent before the host starts the microphone. Mark persisted spoken
messages and the exact interactive-tool answer completed by Voice with an inline Voice chip ahead of
the words themselves.

End Voice mode before submitting typed text exactly once through the shared composer, preserving the
draft if handoff fails. Pause active media before the AI panel closes and reopen the mounted session
paused. Provisional transcription and Realtime audio remain ephemeral rather than becoming
persisted chat history.

Prepare concise spoken context within a strict 50-word budget while preserving Brunch's exact
protected question, which application code appends unchanged for tool-disabled audio rendering.
Fall back to canonical context and question whenever preparation is unavailable, invalid, or times
out.

Add canonical replay controls for repeating the question or reading the full response without
speech preparation.
