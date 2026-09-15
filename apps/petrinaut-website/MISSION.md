# Improve Brunch Voice controls

The child branch's sole execution authority is the
[Brunch mission](../../libs/@hashintel/brunch-agent/MISSION.md). This file is a
pointer, not a second mission.

FE-1722 selects the reduced Voice-control cut: one compact dock, direct
microphone mute, one secondary audio popover and the existing conversation
panel for output. Both Live and Realtime expose canonical Stop only while
Brunch is submitted or streaming; End remains separate Voice teardown.
Show/Hide conversation changes visibility only.

Live microphone mute gates the existing shared capture track without silencing
playback. Realtime preserves its current microphone gating. Both providers gain
session-local speaker mute and normalized volume, reset for every new session.
Read-full-response, repeat-question and interruption-by-speaking remain
Realtime-only. Speaker settings do not redefine Speaking, and a
provider-finalized partial transcript after mid-utterance mute is allowed.

The branch is stacked on FE-1712 at
[`377be52823`](https://github.com/hashintel/hash/commit/377be52823a65fcb3100d7b09e2ca471c374001e).
Its capture preferences, semantic VAD, patient listening, 500 ms output hold and
unfinished owner-held obligations remain inherited and unchanged. Device
switching, voice and speed selection, helmet animation and persistence remain
deferred in the
[future spine](../../libs/@hashintel/brunch-agent/MISSION.next.md#voice-control-follow-up).

FE-1722 implementation and deterministic verification are established on this
branch; the Brunch mission owns the exact proof and remaining limitations.
Real microphone, speaker and headphone behavior remains unproven and
owner-held. No agent microphone or provider session is authorized. Current
owner direction authorizes the subsequent branch push and stacked draft PR
after the committed final gate; this correction task performs neither. Merge,
deployment, Linear writes and other tracker changes remain unauthorized.
