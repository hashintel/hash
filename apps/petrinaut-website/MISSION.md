# Experiment Live Full-Duplex Migration

## Status

Live experiment scope; local implementation prepared for Kostandin's manual
witness, not conversational-quality acceptance.
[FE-1663](https://linear.app/hash/issue/FE-1663/experiment-live-full-duplex-migration)
is related to FE-1661, which remains the migration-effort assessment.
This website experiment uses Petrinaut's existing Voice dock, with optional
session controls and local audio-activity indicators, not inferred turn boundaries.
It does not recut Brunch's existing Mission 7a or promote its future-planning drafts.

## Imperative

Learn whether GPT-Live-1 natively makes process interviewing feel fluid:
concise relevant follow-ups, room for hesitation and elaboration, and natural
interruption/correction without losing meaning. Smooth audio alone is not success.

## Throughline

Existing website Voice entry → explicit experimental consent/Start → trusted
website `/api/voice/live-session` → client-delegated GPT-Live-1 WebRTC → microphone
and speaker → existing Voice dock → local End/Exit. Local disconnection is
not a remote-closure claim.
`main → FE-1663 → Experiment Live Full Brunch Integration` is the intended stack;
only FE-1663 is authorized now. No relay, rephrasing, or harness code is a donor.

## Proof

- `openai-live-session.test.ts` checks provider/default selection, enablement,
  trusted session payload, origin/content validation, credential privacy, and
  no retry. Existing Realtime policy and transport tests remain regression oracles.
- `live-conversation.test.ts` checks waiting for `session.started`, no duplicate
  start, no transcript/delegation execution, remote audio attachment, connection
  failures, late microphone permission, and capture/playback/transport cleanup.
- `live-conversation-control.test.tsx` checks explicit consent/Start, provider
  pinning, canonical isolation, host state reporting, panel closure and stale callbacks.
- Petrinaut's assistant-panel and contents tests check optional action visibility
  and retain regression coverage for Realtime's playback and lifecycle controls.
- Rendered real-editor consent, simulated error, and mocked active controls
  must be inspected without a real microphone or provider session.
- Kostandin's [10–15 minute manual procedure](README.md#manual-test--1015-minutes)
  is the oracle for conversational quality and actual media behavior. Provider-free
  tests and screenshots do not establish these or end-to-end Brunch compatibility.

## Constraints

Unset `PETRINAUT_VOICE_PROVIDER` means `realtime`; only `realtime` and `live` are
valid. Keep existing enablement/credential plumbing. Pin configuration per
mounted conversation; never switch providers or resubmit input automatically.
Keep Realtime's prompts, admission, queue, settlement and playback unchanged.

Live has no access to canonical submission, Brunch/Petrinaut tools or chat
history. Its guidance does not grant domain authority. Transcript deltas are
not finalized utterances; delegation events are metadata; commentary (unused
here) is paraphrasable context limited to 500 tokens, and append acknowledgements
are not speech/playback completion. Do not invent response terminals or infer
authoritative completion from silence. Stop ends local media, not canonical work.

No paid sessions, synthetic recordings, audio evaluation harness, deployment,
Notion writes, second issue, or integration implementation are authorized.
The follow-up permits cleanup, a clean commit without Amp thread IDs, and a draft PR.
Preserve other worktrees and uncommitted work.

## Fog-line

Native finalization and enforceable output gating remain unresolved for PR 2.
Observe whether interruption preserves corrections, whether the user feels
heard, whether questions advance process elicitation, whether pauses/one-word
answers survive, and whether output is concise. Observe transport failures and
remote closure separately. A pleasant standalone conversation cannot answer
whether canonical admission/settlement delays retain this quality.

## Stop or reorient

Stop at an authority change: autonomous domain speech, local substantive
follow-ups in the integrated workflow, hybrid authoritative transcription, or
buffered/gated output requires an explicit recut for Lu's approval. Neither
this prompt nor success here reopens FE-1624. Provider-free verification cannot
be replaced with paid calls or a synthetic audio campaign.

## Deferred

PR 2 must preserve: finalized input → existing composer → Flue → Brunch →
authorized Petrinaut execution → complete-turn settlement → frozen canonical
reply → Live delivery. Brunch alone authors substantive domain answers and
questions; Flue is canonical conversation; Petrinaut is execution authority.
Proposal approval, full-turn settlement and playback eligibility remain distinct.
Unknown execution outcomes must not be reapplied or spoken as success. Workpiece,
basis and tool payloads are not assistant prose. See the existing Brunch
[future spine](../../libs/@hashintel/brunch-agent/MISSION.next.md#voice-after-the-live-transport-cut)
for retained context, not implementation authority.
