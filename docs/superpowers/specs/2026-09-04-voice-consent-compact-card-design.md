# Voice consent compact card

## Goal

Replace PR #9531's visually loose Voice consent block with a compact setup card
that matches Petrinaut's AI assistant panel. Preserve the existing disclosure,
explicit acknowledgement, microphone check, focus behavior, and start flow.

## Design

The pre-session Voice surface remains pinned between the transcript and composer.
It becomes a quiet white card inside the panel's subtle footer surface, using the
same border, radius, shadow, spacing, and typography language as the composer and
message cards.

The card contains:

1. A small brand-tinted Voice icon beside the title.
2. The title **Start a voice conversation** and subtitle **Talk through your
   process with AI**.
3. Concise disclosure copy: **OpenAI processes live audio and speaks the
   interviewer’s words. Petrinaut saves finalized answers—not audio.**
4. A design-system checkbox in a muted inset row with the label **I understand
   how voice data is handled.**
5. A compact brand **Start voice** button and subtle **Test microphone** button.

The card must remain legible at the assistant's 320 px minimum width. Actions may
wrap without changing their order.

## Interaction and states

- **Start voice** is disabled until the checkbox is selected.
- **Test microphone** does not store consent or start Voice.
- While testing, the secondary button shows a loading state and duplicate checks
  are prevented.
- Success and failure replace a reserved status line below the actions, avoiding
  layout jump. The status uses polite live-region semantics.
- Starting Voice stores the existing versioned acknowledgement, hides the card,
  and starts the existing controller exactly once.
- Keyboard focus continues to move to the consent section when it appears.

## Accessibility

- Use `@hashintel/ds-components` `Checkbox` and `Button` rather than native
  unstyled controls.
- Keep the section's existing accessible name.
- Associate status text with the microphone-check action through the live region.
- Preserve visible focus states supplied by the design system.
- Do not rely on color alone for status.

## Scope

The implementation is limited to
`apps/petrinaut-website/src/main/app/voice-interview/voice-interview-control.tsx`
and its focused tests. No Voice transport, consent persistence, session, panel
layout, or live Voice dock behavior changes.

The existing Petrinaut AI-assistant documentation remains behaviorally accurate;
no user-guide copy change is required.

## Verification

- Extend the focused test to cover the design-system checkbox, compact labels,
  disabled start state, microphone-check loading guard, success/failure status,
  and unchanged acknowledgement behavior.
- Run the focused Voice control test.
- Run Petrinaut website type checking and linting.
- Inspect the card in the real 500 px panel and at the 320 px minimum width.
