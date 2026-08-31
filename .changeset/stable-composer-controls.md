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
independently of Voice mode.

Show partial speech as an ephemeral user-style bubble and render compact waveform provenance on
persisted spoken messages and the exact interactive-tool answer completed by Voice. Keep session
state in a subtle transcript divider with input-responsive listening bars, deterministic speaking
motion, throttled announcements, reduced-motion behavior, and compact recovery controls. Keep Pause
and End voice mode in an overflow menu, expose collapsed privacy-safe technical details, and request
one-time consent before the host starts the microphone.

End Voice mode before submitting typed text exactly once through the shared composer, preserving the
draft if handoff fails. Pause active media before the AI panel closes and reopen the mounted session
paused. Provisional transcription and Realtime audio remain ephemeral rather than becoming
persisted chat history.
