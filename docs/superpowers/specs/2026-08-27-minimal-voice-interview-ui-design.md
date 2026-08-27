# Minimal Voice Interview UI

## Goal

Make Interview mode feel like a focused voice application: one clear question, one circular microphone-and-waveform focal element, compact transcript feedback, and only the controls needed for the current state.

This is a visual and interaction refinement of the existing voice interview. It does not change transcription policy, answer submission, disclosure persistence, microphone gating, conversation identity, or Chat / Interview mode ownership.

## Visual Hierarchy

The AI panel header continues to show the `Chat` / `Interview` mode switch. The interview stage removes its duplicate “Voice interview” title.

The full stage is ordered as:

1. short state indicator;
2. current question;
3. circular microphone state with waveform;
4. transcript strip, only when text exists;
5. state-specific icon controls;
6. optional collapsed secondary details.

The current question remains clear, but the circular microphone element is the strongest visual element.

## Circular Microphone and Waveform

The focal element is a soft blue circular surface with a subtle outer ring.

While listening:

- a microphone icon sits in the centre;
- live waveform bars respond to the existing microphone-level value;
- a small green indicator and the short label `Listening` show that capture is active.

The visible `Microphone input level: Quiet/Low/Medium/High` label is removed. The equivalent microphone-level description remains available to assistive technology.

Other phases reuse the same circle:

- connecting or finishing: `FaCircleNotch`;
- paused: muted-microphone icon and `Paused`;
- interviewer speaking: speaker icon and `Interviewer speaking`;
- answer recorded: success/check icon and `Answer recorded`;
- recoverable error: warning icon and a neutral error state.

Reduced-motion behavior keeps the state understandable without waveform animation.

## Icon Set and Tooltips

Use the application’s existing `react-icons/fa6` dependency. Do not add custom SVGs, emoji icons, or another icon package.

Use these existing Font Awesome components:

- listening and interrupt: `FaMicrophone`;
- microphone off or paused: `FaMicrophoneSlash`;
- Done speaking: `FaCheck`;
- Pause: `FaPause`;
- switch to Chat: `FaKeyboard`;
- Resume listening: `FaPlay`;
- interviewer playback: `FaVolumeHigh`;
- connecting and finishing: `FaCircleNotch`;
- Reconnect: `FaRotate`;
- recorded or sent: `FaCircleCheck`;
- recoverable error: `FaTriangleExclamation`;
- Minimize: `FaMinus`;
- End interview: `FaXmark`;
- Redo answer: `FaArrowRotateLeft`;
- Edit text: `FaPen`.

Icon-only controls use circular Petrinaut buttons, concise `aria-label` values, and DS tooltips. Tooltips provide the full action title on hover and keyboard focus.

## Controls

Only actions valid for the current phase are shown.

Listening shows:

- keyboard icon — switch to Chat and focus the composer;
- primary check icon — Done speaking;
- pause icon — Pause.

Paused shows:

- keyboard icon — switch to Chat;
- primary microphone or play icon — Resume listening.

Interviewer playback shows:

- keyboard icon — switch to Chat;
- primary microphone icon — Interrupt and speak.

After an answer is recorded, Redo and Edit remain available as compact icon actions associated with the transcript rather than as full-width buttons. They stay disabled while the answer cannot be revised.

Minimize and End remain icon-only controls in the top-right of the stage. The duplicate stage title is removed.

The compact bar uses the same icon language. While it is actively listening, it exposes Done speaking as well as Pause, keyboard, and End so the user does not have to expand merely to finish an answer.

## Transcript Feedback

The transcript becomes one compact strip and appears only when partial or committed text exists.

For partial text:

- label: `Live transcript`;
- trailing status: recording dot and `Recording`;
- transcript text below or beside the label.

For committed text:

- label: `Your answer`;
- trailing status: success icon and `Sent`;
- transcript text;
- compact Redo/Edit actions when applicable.

The visible phrase `What we’re hearing · Not sent yet` is removed. The live region continues to announce that partial text has not been sent, preserving the distinction for assistive technology.

## Initial Entry and Disclosure

The empty-canvas Interview entry remains:

1. select `Interview`;
2. select `Start interview`.

If the current disclosure version has already been acknowledged, the panel opens in Interview mode and capture starts automatically without an intermediate trigger or start card.

On first use, the one-time disclosure still appears before microphone capture. It keeps the required transcription and retention explanation, consent checkbox, Start interview action, optional microphone check, and a keyboard icon for returning to Chat. Disclosure persistence remains versioned in local storage.

## Recovery

Recovery uses the same circular focal layout without a waveform:

- warning or muted-microphone icon in the circle;
- concise heading;
- one actionable sentence;
- primary `Reconnect` action with the existing rotate/reconnect icon and visible label;
- keyboard icon to switch to Chat;
- collapsed `Technical details` for error code and diagnostic reference.

Permission, device, network, timeout, and invalid-response guidance remains accurate. Reconnecting never implies that capture is active until the microphone has actually reopened.

## Secondary Information

Interview coverage remains available but does not compete with the voice controls. When present, it stays collapsed in a low-emphasis progress/details row below the primary interaction.

Correction input remains visible only while the user is actively editing a committed answer.

## Compact and Detached Presentations

The compact bar keeps:

- microphone or state icon;
- short current state;
- one-line current question;
- state-valid icon actions with tooltips.

Closing the panel keeps the same session in the detached compact bar. Neither compacting nor detaching reconnects, pauses, or ends the session.

## Accessibility

- The waveform is decorative and hidden from assistive technology.
- A screen-reader-only description retains the microphone input level.
- State changes and partial transcript text continue through the existing polite live region.
- Every icon-only action has an exact accessible name and tooltip.
- Color is never the only state signal; every recording, sent, paused, and error state also has text or an icon.
- Disabled correction actions remain programmatically disabled.

## Architecture

Keep the existing separation:

- `VoiceInterviewControl` owns lifecycle-to-presentation mapping and handlers.
- `VoiceInterviewControlView` owns the visual state rendering.
- `VoiceTurnController` and `OpenAIRealtimeSession` remain unchanged unless a test proves the visual refactor requires a behavioral correction.
- Petrinaut continues to own Chat / Interview mode and composer focus.

Extract small view helpers only when they make the state-specific rendering clearer, such as a microphone focal component, transcript strip, and icon action row. Do not introduce a new state store or icon abstraction layer.

## Testing and Documentation

Update focused tests to verify:

- no visible microphone-level text while an accessible level description remains;
- circular microphone and waveform in listening state;
- exact icons, accessible names, and tooltips for each phase;
- icon-only keyboard action selects Chat;
- Done speaking appears in full and compact listening presentations;
- partial transcript shows `Recording` and committed text shows `Sent`;
- first-use disclosure remains gated and returning users start directly;
- paused, playback, answer-recorded, compact, detached, and recovery states expose only valid actions;
- reconnect guidance and technical details remain available;
- existing microphone/session lifecycle tests remain green.

Update the Petrinaut AI assistant user guide and changeset to describe the simplified visual states and icon controls. No user-guide screenshots currently cover this surface.
