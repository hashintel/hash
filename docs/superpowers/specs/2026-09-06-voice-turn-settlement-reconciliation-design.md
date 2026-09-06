# Voice turn settlement reconciliation

## Goal

Fix the two active Bugbot findings on PR #9531 without broadening the Voice
controller refactor:

- restore the saved microphone preference when a submission returns to
  listening after speech has already settled or no speech will occur;
- keep the actual speech lifecycle visible when canonical response settlement
  races with playback.

## Design

Session output events remain authoritative for `VoiceOutputState`.
`canonical-response-ready` changes the input axis from submitting to listening,
but does not overwrite the current unpaused output state. The existing
`submission-started` transition already supplies `waiting-for-tool` before
speech starts. Consequently:

- pending speech remains `waiting-for-tool`;
- active speech remains `speaking`;
- speech that finished before canonical settlement remains `idle`.

The controller uses one guarded capture-restoration helper after transitions
that can leave it listening. The helper applies the snapshot's microphone
preference to the realtime session only when the controller is connected,
listening, and neither active speech nor a take-turn cancellation can still
own capture. The settled-speech cleanup path uses the same helper.

Paused behavior remains unchanged: settlement records listening as the resume
state, cancels output where required, and keeps physical capture disabled.

## Verification

Controller regression tests will prove:

1. a stopped submission with no speech reopens an enabled microphone;
2. playback that fully finishes before canonical settlement leaves output
   idle, enables replay actions, and reopens capture;
3. canonical settlement during playback preserves `speaking` and keeps capture
   closed until both terminal and output-ended events arrive.

Run the focused controller test file, then the Petrinaut website unit, type, and
lint checks affected by the change. After the review findings are resolved,
inspect the failed Playwright job log and address only failures caused by this
PR.
