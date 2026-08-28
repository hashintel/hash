---
"@hashintel/petrinaut": patch
---

Add generic host-rendered AI composer controls and a persistent interview stage with docked and
detached placements, protected active conversations, keyboard fallback, and one-answer buffering
while the normal chat stream settles. Include stable finalized-text submission, conversation
identity, stop handling, schema-validated interactive-tool text mapping, explicit separate-message
targeting for corrections, and a queue-aware voice submission path. Add the Chat / Interview mode
switch and export `PetrinautAiInteractionMode`, with the selected interaction mode and mode-change
callback available to host-rendered interview stages. `renderComposerControl` remains a supported
public seam for hosts that only need their own control beside the message box, independently of the
interview stage.

Simplify Interview mode with a circular microphone waveform, compact transcript states that
distinguish recording, sending, sent, and undelivered answers, phase-specific icon controls, and
recovery that names the kind of failure before offering reconnect.
