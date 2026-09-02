# Chat and Interview Mode Switch

## Goal

Make text chat and voice interview feel like two uniform ways to work with the same Petrinaut AI assistant. Move voice discovery out of the composer, expose it beside Chat at the top of the relevant surfaces, and preserve clear microphone/session awareness when switching modes.

## Scope

- Replace the composer microphone trigger with a labeled `Chat` / `Interview` mode switch.
- Show the same switch in:
  - the empty-canvas “Describe the process you want to create” card; and
  - the AI assistant panel header.
- Change the empty-conversation composer placeholder from “Get creating...” to “Describe the process you want to create”.
- Reuse the existing disclosure, voice session, compact bar, recovery, and local-storage behavior.
- Keep Chat and Interview in one conversation. This is an input-mode change, not a separate assistant or thread.

## Interaction Design

### Shared mode tabs

A reusable Petrinaut component renders two labeled tabs:

- `Chat`, with the existing AI assistant icon.
- `Interview`, with a microphone icon.

The tabs use Petrinaut’s current neutral/blue styling, visible selected state, keyboard-accessible buttons, and accessible selected-state semantics. They remain labeled rather than becoming icon-only so their meaning does not depend on tooltips.

When no host interview stage is configured, Petrinaut renders the current chat-only UI and no mode switch.

### Empty canvas

Chat is selected by default and retains the current title, example input, and submit action.

Selecting Interview changes the card body to a microphone-led introduction:

- “Talk through your process with AI”
- a short explanation that guided questions will help create the model
- `Start interview`

Selecting `Start interview` opens the AI panel in Interview mode. On first use, the existing disclosure is shown there; after acknowledgement, the existing behavior starts the session directly. The main card does not duplicate consent or own a voice connection.

### AI assistant panel

The panel header replaces the static `AI` label with the same `Chat` / `Interview` tabs. Clear and close controls remain on the right.

Chat mode shows the existing conversation, prompt chips, and composer. For an empty conversation, the composer placeholder is “Describe the process you want to create”.

Interview mode shows the same conversation plus the full existing interview stage, and hides the generic composer and prompt chips to keep one primary input surface. Existing interview actions such as `Use text instead` switch to Chat and focus the composer.

### Active-session switching

Switching from Interview to Chat does not pause or end an active session. The full stage becomes the existing compact status bar above the composer, preserving visible microphone/session state and a route back to Interview.

The following actions also align with the mode switch:

- Expand/open interview: select Interview.
- Minimize or `Use text instead`: select Chat.
- End interview: end the voice session and return to Chat.
- Close the AI panel: retain the existing detached compact bar behavior.

## Architecture

Petrinaut owns the provider-neutral mode selection because both entry points and the surrounding layout belong to Petrinaut. The host-owned voice implementation continues to own disclosure, microphone, realtime connection, transcripts, and interview lifecycle.

Add a provider-neutral interaction mode type (`"chat" | "interview"`) and expose the selected mode plus a mode-change callback in `PetrinautAiInterviewStageContext`.

`EditorView` carries the empty-card mode request into `AiAssistantPanel` when opening it. `AiAssistantPanel` owns the live mode for that mounted conversation and passes it to both the panel contents and the host interview stage. The stage remains mounted while modes change so an active voice session is not accidentally destroyed.

`VoiceInterviewControl` derives its visible presentation from both its existing lifecycle and Petrinaut’s selected mode:

- inactive + Chat: no voice trigger;
- inactive + Interview: existing start/disclosure presentation;
- active + Interview: full stage;
- active + Chat: compact bar;
- closed sidebar + active session: detached compact bar.

## Error Handling

Existing microphone, connection, and service recovery states remain in the interview stage. Switching to Chat during an error keeps any active session represented by the compact bar. `Use text instead` remains the reliable escape path and selects Chat.

If interview configuration is unavailable, the mode tabs are omitted rather than exposing an Interview mode that cannot start.

## Accessibility

- The shared switch exposes a tablist with two named tabs and the selected tab.
- Both tabs have visible text and decorative icons hidden from assistive technology.
- Selecting Chat focuses the composer when initiated from an interview fallback action.
- An active interview remains visible and announced in compact form after switching to Chat.
- Existing live transcript announcements and icon-button labels remain unchanged.

## Testing

Add or update tests for:

- shared tabs, labels, selected state, and disabled-feature fallback;
- empty-card Chat and Interview content and actions;
- carrying an Interview selection from the empty card into the panel;
- the new empty-conversation composer placeholder;
- hiding the generic composer in Interview mode;
- preserving the mounted interview stage when modes change;
- full-to-compact and compact-to-full transitions;
- `Use text instead`, minimize, expand, end, and panel-close mode behavior;
- existing disclosure persistence and voice-session tests.

Update the Petrinaut AI assistant user guide to describe Chat / Interview mode selection and the compact active-session behavior.
