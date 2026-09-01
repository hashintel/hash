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
the composer with a low-profile Voice dock -- an ephemeral caption over a five-bar indicator that
follows microphone input while listening, switches to deterministic motion while the assistant
speaks, and names one phase at a time -- with throttled announcements and reduced-motion behavior.
Hold spoken turns out of the transcript until the session ends, then reveal them together under a
turn-count divider, while typed messages and interactive tools awaiting an answer stay visible
throughout. Place Pause, Resume, Reconnect, and End in a glass segment above the canvas toolbar, and
fall back to the same actions in the dock when that toolbar is absent. Surface voice recovery
failures as toasts with privacy-safe diagnostic references, and request one-time consent before the
host starts the microphone. Render compact waveform provenance on persisted spoken messages and the
exact interactive-tool answer completed by Voice.

End Voice mode before submitting typed text exactly once through the shared composer, preserving the
draft if handoff fails. Pause active media before the AI panel closes and reopen the mounted session
paused. Provisional transcription and Realtime audio remain ephemeral rather than becoming
persisted chat history.
