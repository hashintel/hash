# Improve Brunch Voice controls

## Status

Live execution authority for
[FE-1722](https://linear.app/hash/issue/FE-1722/improve-brunch-voice-controls).
This branch is stacked on
[`origin/kostandin/fe-1712-stabilize-gpt-live-full-duplex-voice-feedback` at
`377be52823`](https://github.com/hashintel/hash/commit/377be52823a65fcb3100d7b09e2ca471c374001e),
not `origin/main`. FE-1712's implementation and evidence are inherited from
that pinned parent; its unfinished speech, acoustic and recovery obligations
are not accepted or replaced here.

FE-1722 implementation exists on this branch through the shared-control,
provider-control, documentation and lifecycle commits from `fb22f14950` through
`6c9893e9a3`, together with the final-review corrections recorded beside this
refresh. The deterministic product proof below is established. Real
microphone, speaker and headphone behavior remains unproven and owner-held;
Kostandin owns that browser witness, and no microphone or provider session is
authorized for an agent.

The approved implementation plan and current owner direction authorize the
subsequent branch push and opening of a stacked draft PR after this committed
final gate. This correction task stops before either write. Merge, deployment
and tracker writes remain unauthorized.

## Imperative

Make an active Brunch Voice session compact and predictable without changing
who owns capture, canonical work or playback. Keep microphone mute immediately
available, move secondary audio controls into one popover, expose the canonical
Stop action only while Brunch is working, and use the existing conversation
panel for visible output.

## Throughline

After the existing consented Start path connects either Live or Realtime,
Petrinaut renders one compact Voice dock while the existing conversation panel
continues to show the transcript and canonical Brunch output:

1. The dock keeps microphone mute directly available. In Live, mute toggles the
   one shared capture track that already feeds Live and the separate
   transcription session; it does not mute playback or create another capture.
   In Realtime, it preserves the existing microphone-gating behavior.
2. One audio popover contains session-local speaker mute and normalized volume
   for both providers. The existing read-full-response, repeat-question and
   interruption-by-speaking controls remain Realtime-only in that popover.
3. While canonical status is exactly `submitted` or `streaming`, both providers
   show Stop and invoke the existing `onStop` path. Live consequently retains
   the established `recordStopRequested()` →
   `LiveBrunchBridge.stopResponse()` behavior: stop the current Brunch response
   while leaving Live and transcription media connected.
4. End remains the separate Voice-session teardown. It does not stop canonical
   work. The existing session-collapse control is relabelled Show conversation
   or Hide conversation and changes only conversation visibility.
5. Status keeps the precedence connection/error → Speaking → Thinking →
   microphone-muted → Listening. Speaker mute and volume zero do not make
   Speaking false.
6. Speaker mute and volume start from their ordinary unmuted/full-volume
   defaults for every new Voice session and are never persisted.

The protected source is FE-1712 at the pinned parent above. Its browser capture
preferences, semantic VAD, patient-listening instruction and 500 ms
output-activity hold are unchanged. The production destinations and permitted
deltas are:

- `libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/`:
  keep the dock and existing conversation panel as the visible surface; thread
  the canonical busy state and `onStop` to the dock; relabel the visibility
  action; and compose the common audio popover from existing design-system
  primitives.
- `libs/@hashintel/petrinaut/src/react/voice-session/` and
  `libs/@hashintel/petrinaut/src/ui/types/ai-assistant-composer-control.ts`:
  extend the host/session contract only enough to report and change
  session-local speaker mute and normalized volume.
- `apps/petrinaut-website/src/main/app/voice-interview/`: adapt the existing
  Live and Realtime sessions to that contract, preserving shared capture,
  Realtime gating, output ownership, admission, canonical Stop and teardown.

Stop on an unlisted semantic delta. A local helper is warranted only when both
providers actually share the same contract; do not add a second control
surface, media owner or settings store.

### Owner decisions

- **2026-09-15:** Kostandin accepts reduced Option B: compact dock, secondary
  audio controls in one popover and the existing conversation panel for output.
  The authority commit must remain separate from product code.

## Proof

### Authority cut

Verified 2026-09-15: forced repository Markdown lint checked exactly this
mission, its future pointer and the website pointer with zero errors;
`git diff --check` also passed. These checks establish legible repository
authority only; they do not establish any product behavior. The pre-cut focused
baselines were reported as 51 Petrinaut tests and 218 website tests passing;
they contain no FE-1722 implementation.

### Deterministic product proof — established

- `libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/ai-assistant-contents.test.tsx`
  owns the compact dock, Show/Hide conversation as visibility only, canonical
  Stop only for `submitted`/`streaming`, separate End, common audio controls and
  provider-capability presentation.
- `libs/@hashintel/petrinaut/src/ui/types/ai-assistant-composer-control.test.ts`
  and
  `libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel.test.tsx`
  own the host contract and provider-optional action forwarding without making
  controls mandatory for unrelated hosts.
- `apps/petrinaut-website/src/main/app/voice-interview/live-conversation.test.ts`
  and `live-conversation-control.test.tsx` own shared-track microphone mute,
  independent playback mute/volume, per-session reset and the unchanged
  canonical Stop-to-`stopResponse()` path without media teardown.
- `apps/petrinaut-website/src/main/app/voice-interview/openai-realtime-session.test.ts`,
  `voice-turn-controller.test.ts` and `voice-interview-control.test.tsx` own
  unchanged Realtime microphone gating, common speaker settings, per-session
  reset and Realtime-only controls.
- `apps/petrinaut-website/src/main/app/voice-interview/voice-session-state.test.ts`
  and `live-conversation-control.test.tsx` own status precedence and prove that
  speaker mute or volume zero does not rewrite Speaking.

Verified 2026-09-15:

- Network-denied
  `yarn workspace @hashintel/petrinaut test:unit --run`
  over the three focused Voice files passed 152 tests.
- Network-denied `yarn workspace @apps/petrinaut-website test:unit` over the
  eight focused unit files passed 347 tests; the ninth
  `voice-preview.integration.test.ts` file passed 5 tests under the same
  network denial.
- `build`, `lint:tsc` and `lint:eslint` passed independently for
  `@hashintel/petrinaut` and `@apps/petrinaut-website`.
- `yarn workspace @local/petrinaut-arch-docs lint:arch-docs` reported 79
  layers, 408 edges, 866 files, 80 generated pages and 40 authored pages.
- Root `yarn lint:format`, exact Markdown lint over the changed mission,
  pointer, user guide and changeset, plus working and committed
  `git diff --check` checks passed.

These checks establish deterministic controls and regressions, not physical
audio, conversational quality or visual usability.

### Product witness — pending, owner-held

Kostandin starts a fresh Live session and a fresh Realtime session through the
real product door. In each, show and hide the conversation while speech and
canonical work continue; mute and unmute the microphone; mute the speaker and
move volume through zero during output; verify Speaking still reflects provider
output; and Stop one submitted or streaming Brunch response without ending
Voice. End Voice separately and confirm it does not stop canonical work. Start
a second session and confirm speaker mute and volume reset. In Realtime only,
also exercise read-full-response, repeat-question and
interruption-by-speaking.

This witness may accept the interaction and audible effect on the tested
browser/device. It does not establish all-device media behavior, natural turn
boundaries, echo mitigation or FE-1712's remaining owner-held obligations.

## Constraints

- Preserve explicit consent, one-capture ownership, teardown, transcript
  admission, delegation policy, canonical Brunch authority, provider pinning
  and Realtime response ownership. Do not start microphone or provider sessions
  on an agent's behalf; real media evidence remains owner-held.
- Preserve FE-1712 browser capture preferences, semantic VAD,
  patient-listening instruction and 500 ms output-activity hold.
- Live microphone mute disables the one shared capture track feeding Live and
  transcription without muting playback, ending either session or changing
  canonical work. Realtime keeps its existing gating semantics.
- Canonical Stop appears only for `submitted` or `streaming` and uses the
  existing `onStop` path. Live Stop keeps media connected. End tears down Voice
  and does not cancel canonical work.
- Connection/error, Speaking, Thinking, microphone-muted and Listening retain
  that precedence. Audio settings describe local audibility, not provider
  output activity.
- Show/Hide conversation changes visibility only. It must not change capture,
  playback, work, session state, panel history or admission.
- Speaker mute and normalized volume are session-local for both providers and
  reset for every new session. Do not persist them.
- A provider-finalized partial transcript admitted after mid-utterance mute is
  allowed. Add no transcript suppression, fuzzy matching or timers.
- Existing read-full-response, repeat-question and interruption-by-speaking
  behavior stays Realtime-only.

## Fog-line

The exact compact spacing, icons, volume affordance and responsive fit remain
implementation details to validate against the existing Petrinaut design
system and accessibility semantics. They may not move microphone mute into the
popover, create another output surface or alter the control policy above.

Muting a capture track cannot retract audio the provider already received; a
finalized partial transcript after mute is therefore neither automatically a
bug nor evidence of suppression. Speaker mute and zero volume change local
audibility, not whether output is active. Deterministic browser tests cannot
establish subjective volume feel, physical routing or whether the compact dock
is usable on Kostandin's device.

FE-1712's acoustic benefit, natural turn-boundary quality, direct spoken-user
attribution, withheld-work recovery and comparative latency remain unresolved
at their existing parent or future-spine owners. This mission neither reruns
nor accepts them.

## Stop or reorient

Stop and return to the owner if microphone mute silences output, creates a new
capture, changes admission, or fails to gate both Live consumers of the shared
track; if speaker controls alter microphone state or Speaking status; if Stop
tears down Voice or End stops canonical work; if Show/Hide changes anything
other than visibility; if settings survive a new session; or if Live gains
Realtime-only controls.

Also stop on an inaccessible or unusable compact layout, a provider-specific
contract that cannot be represented without weakening the common invariants,
an unlisted persistence or timer, a new provider/media session, or a required
change to FE-1712's protected behavior. Do not select a broader redesign from
mechanism failure without a new owner decision.

## Deferred

[Voice control follow-up](MISSION.next.md#voice-control-follow-up) retains
device switching, voice and speed selection, helmet animation and settings
persistence. [Voice feedback follow-up](MISSION.next.md#voice-feedback-follow-up)
and [Voice after the live transport cut](MISSION.next.md#voice-after-the-live-transport-cut)
retain FE-1712's unfinished alternatives and owner-held obligations. None is
authorized by this cut.
