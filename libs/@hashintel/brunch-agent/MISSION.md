# Voice interruption by speaking

## Status

**Live as of 2026-09-09** for
[FE-1604](https://linear.app/hash/issue/FE-1604/allow-voice-interruption-by-speaking)
on `kostandin/fe-1604-recut-voice-interruption`, cut from post-deployment `main` at
`ef0f4449876d63d82657147fb4e29cdf024e9f79`.

This is an independent semantic recut of the interruption-only delta from the
stale, conflicting [PR #9550](https://github.com/hashintel/hash/pull/9550) head
`f69ac17034dfe4290691d34b64930e5a07245480`. It must not merge the old branch or
carry its unrelated Brunch stack. The open settlement port in
[PR #9588](https://github.com/hashintel/hash/pull/9588) is a separate sibling and
is not part of this branch.

## Imperative

Let a person interrupt Voice assistant playback by speaking without losing the
interrupting utterance. Keep the existing **Your turn** handoff as a
browser-saved half-duplex fallback, and reject likely prompt regurgitation or
assistant self-echo before a completed interruption transcript becomes an
answer.

The interruption must stop playback immediately while preserving completed
transcription as the sole answer authority and the existing Brunch admission
path as the sole submission authority.

## Throughline

```text
OpenAI Realtime microphone input remains enabled during canonical playback
→ input_audio_buffer.speech_started
→ response.cancel + output_audio_buffer.clear, without input_audio_buffer.clear
→ completed transcription for the same input item
→ interruption-only prompt-regurgitation and active-playback self-echo checks
→ retain while the previous Brunch turn settles, if necessary
→ existing Voice bridge and panel admission path exactly once
→ canonical Brunch turn and ordinary Voice lifecycle
```

The playback menu owns a default-on **Interruption by speaking** preference.
Disabling it restores the existing half-duplex microphone closure and
acknowledged **Your turn** handoff.

## Proof

1. **Immediate, input-preserving cancellation.** Session tests observe
   `speech_started → response.cancel → output_audio_buffer.clear`, no input
   buffer clear, and completion of the same input item.
2. **Exactly-once admission.** Bridge and controller tests cover duplicate
   completions, delayed Brunch admission, an unsettled previous turn, follow-on
   canonical speech, queued playback, and lifecycle cleanup.
3. **Local false-transcript rejection.** Tests cover configured transcription
   prompt regurgitation and exact active canonical self-echo, while preserving
   short novel answers and leaving ordinary non-interruption capture unchanged.
4. **Retained-answer visibility.** Controller tests prove that later empty,
   failed, prompt-regurgitated, or self-echo transcripts cannot erase an
   earlier retained answer or submit a replacement.
5. **User control.** Shared Petrinaut tests prove the preference is default-on,
   browser-saved, exposed in the existing playback menu, and controls whether
   **Your turn** is visible.
6. **Durable origin and Stop continuity.**
   `local-storage-demo/voice-history-continuity.integration.test.tsx` runs one
   typed submission plus a direct Voice submission whose client-tool result
   carries Flue's supported durable Voice provenance, then exercises durable
   composer **Stop**, closes the conversation, and reopens it as a second
   mounted client. The reopened panel must preserve the typed history and every
   supported Voice tool-call origin, render the aborted assistant entry as
   stopped rather than ordinary truncated content, and prove local **Exit voice
   mode** does not issue durable **Stop**. This oracle does not claim
   direct-user Voice source reconstruction after reopen.
7. **Package integrity.** Focused Voice unit tests, Petrinaut unit tests,
   TypeScript checks, ESLint, the website and library builds, architecture-doc
   lint, repository formatting, and `git diff --check` distinguish a working
   recut from code presence alone.

Mocked protocol tests establish event ordering and state behavior; they do not
establish real microphone latency, speaker echo cancellation, or acoustic
classifier accuracy.

### Expected touched paths

```text
~ apps/petrinaut-website/src/main/app/voice-interview/  session, bridge, controller, preference, tests
~ apps/petrinaut-website/src/main/app/local-storage-demo/ durable history reopen integration proof
~ apps/petrinaut-website/src/server/voice/              Realtime VAD and transcription policy
~ apps/petrinaut-website/src/shared/                    shared transcription vocabulary
~ apps/petrinaut-website/README.md                      website behavior
~ libs/@hashintel/petrinaut/                            shared state, playback control, user guide
~ libs/@hashintel/brunch-agent/docs/adr/                Voice turn-shell decision
+ .changeset/                                           Petrinaut patch release note
```

## Constraints

- A completed provider transcription is the only Voice-answer authority.
  Provisional text remains display-only.
- Interruption cancellation is immediate and is never gated on transcript
  classification. It clears output, never the interrupting input buffer.
- Only input that began while canonical playback was active is classified as an
  interruption. Ordinary capture behavior remains unchanged.
- Self-echo compares only with the exact canonical text active when speech
  started, not queued speech or conversation history.
- Comparison may normalize Unicode, case, punctuation, and whitespace, but
  admitted wording, casing, and punctuation remain unchanged.
- Rejection diagnostics contain operational metadata and a reason, never the
  transcript, transcription prompt, or assistant text.
- Short novel answers such as “stop”, “no”, and “wait” remain admissible.
- Mute, pause, Stop, end, reconnect, exact question replay, and exact full
  response replay retain their current behavior in both preference modes.
- Keep FE-1604 independent from PR #9588. If that sibling lands, update from
  `main` and resolve overlap semantically instead of importing its branch.
- Update the Petrinaut user guide and retain exactly one Petrinaut patch
  changeset.

## Fog-line

- Browser echo cancellation may still allow speaker feedback to trigger VAD or
  transcription. A deterministic completed-transcript classifier reduces false
  admission but cannot prevent playback from stopping after a false VAD event.
- Real interruption latency and acoustic behavior remain unmeasured until a
  human browser/microphone witness is retained.
- The classifier is intentionally conservative. Evidence of rejected novel
  speech or admitted repeated playback requires threshold or feature
  re-evaluation before release.

## Stop or reorient

Stop if the recut requires unrelated stale-branch files, a second Voice
submission path, delayed cancellation, input-buffer clearing, transcript
logging, or assistant-generated classification.

Stop if current-main APIs cannot preserve the same input item through
cancellation and completion, if an interruption can submit twice, if a rejected
completion can replace or erase a retained answer, or if disabling the
preference no longer restores the acknowledged half-duplex handoff.

## Deferred

- PR #9588 owns the omitted Voice settlement port and remains a separate
  mainline update.
- A human browser/microphone witness owns claims about speaker feedback,
  acoustic false interruption, and audible interruption latency.
- Preventing a false VAD event from stopping playback is outside FE-1604.
- On 2026-09-09 the owner explicitly deferred direct-user Voice source
  reconstruction after reopen: Flue 2.0.3 projects neither caller metadata nor
  idempotency keys on canonical user messages, and browser-side correlation or
  visible text encoding remain prohibited. The supported client-tool origin in
  Proof 6 discharges FE-1604's combined continuity witness without claiming
  that blocked marker; re-entry remains governed by
  `docs/evidence/implementations/mission-5-voice-safety-parity/provenance-blocker.md`.
