# Stabilize GPT-Live full-duplex voice feedback

## Status

Live constraints-only mission for
[FE-1712](https://linear.app/hash/issue/FE-1712/stabilize-gpt-live-full-duplex-voice-feedback).
Publication base: restacked FE-1664 at
[9499b9287b](https://github.com/hashintel/hash/commit/9499b9287bd69b751ebcdd61b0c6bf2586bc191e),
not `origin/main`. The original comparison revision is
[3cf4ca6b1f](https://github.com/hashintel/hash/commit/3cf4ca6b1f75f78cb2e086463517c02affd6ce54).
Only this child's commits were rebased; FE-1664 and its PR are not modified by
this mission. The sole conflict was this mission; the parent's newer consent and
Thinking dock contracts are preserved below, without expanding the capture-only cut.
The separate authority commit is
[41671b9935](https://github.com/hashintel/hash/commit/41671b9935676744b024e4045f3e89237e74bef6).
The capture-only implementation is prepared: its assertion failed before the
change, and 317 targeted tests, website typechecking, lint and build now pass.
Next: Kostandin's matched speaker/headphone witness below. Acoustic benefit and
mission acceptance remain unproved. No provider session is agent-authorized.

## Imperative

Reduce the risk that assistant playback becomes fresh user input while preserving
genuine interruptions and existing Realtime support. First determine whether
requesting the browser processing already used by Realtime improves Live's capture.
This is a mitigation hypothesis, not deterministic feedback-loop prevention.

## Throughline

Consented Start → one microphone capture → Live and `gpt-4o-transcribe` WebRTC
sessions → committed/completed input ordering → existing composer/Flue admission
→ Brunch settlement → frozen commentary → native Live playback. Playback can still
re-enter capture; filtering canonical input alone would not prevent Live reacting.

Protected source: FE-1664 at the pinned base above. Its complete integration,
canonical ownership, admission, delivery and recovery contracts remain inherited
behavior, not accepted proof. Only Live's `getUserMedia` preferences may change.
The prior mission and future obligations remain discoverable through
[the future spine](MISSION.next.md#voice-feedback-follow-up).

Preserve the parent's newer consent and dock contracts: concise OpenAI voice and
transcription disclosure, permission checkbox, Start voice and Cancel; stationary
dock/viewport controls with consent above them; Voice setup before Start. Separate
transcription still incurs additional provider usage. During submitted/streaming
Brunch work, show Thinking only while Live is connected, not stopped and not playing
output. Connection/error states take precedence, and playback remains Speaking.
These are inherited local UI semantics, not progress speech, `session.thinking.append`,
new invocation or completion proof. Parent controller tests own the transitions;
parent desktop/mobile witnesses own the visual layout. This cut changes neither.

Cold-start paths in `apps/petrinaut-website/src/main/app/voice-interview/`:

- `live-conversation.ts`: change `{ audio: true }` to explicit
  `autoGainControl: true`, `echoCancellation: true`, `noiseSuppression: true`.
  Retain one capture and all connection/cleanup behavior. These are preferences,
  not required capabilities; add no unsupported-device refusal or fallback retry.
- `live-conversation.test.ts`: extend the existing “starts Live and transcription
  WebRTC from one consented capture and connects only when both are usable” test
  with the exact requested preferences. Its existing assertions own shared track
  identity and dual readiness. Watch the new assertion fail before implementation.
- `openai-realtime-session.ts`: reference for the preferences; leave it unchanged.
  No shared helper is warranted for this small literal.

### Owner decisions

- **2026-09-14:** Kostandin approves the separate constraints-only implementation
  mission following the FE-1712 planning handoff. This permits its local branch,
  separate authority commit, minimal implementation and provider-free checks.
  Delegation-driven invocation and filtering remain deferred.
- **2026-09-14:** Kostandin authorizes pushing this branch and opening its draft PR
  against FE-1664. This supersedes only the local-only publication restriction;
  existing issues/PRs, parent branches, agent microphone/provider sessions, merge
  and deployment remain outside scope.
- **2026-09-14:** Kostandin authorizes fixing this child's parent conflict by
  rebasing, reconciling the mission, rerunning checks and pushing with an explicit
  lease. Refresh this draft PR's proof record; leave other issues/PRs unchanged.

## Proof

### Provider-free configuration and regressions

Baseline: `live-conversation.test.ts` passes 40 tests on the original comparison base under
OS network denial. The new capture assertion failed specifically because the old
call supplied `{ audio: true }`, then passed with the selected preferences.

Run from the repository root with the pinned Node/Yarn toolchain:

```sh
sandbox-exec -p '(version 1)(allow default)(deny network*)' yarn workspace @apps/petrinaut-website test:unit src/main/app/voice-interview/live-conversation.test.ts
```

Verified 2026-09-14 after conflict resolution: these seven files pass 317 tests:
`live-conversation.test.ts`, `live-brunch-bridge.test.ts`,
`live-conversation-control.test.tsx`, `openai-realtime-session.test.ts`,
`realtime-brunch-bridge.test.ts`, `voice-turn-controller.test.ts`, and
`voice-interview-control.test.tsx`, all under the cold-start directory above.
Existing late-permission, partial-failure and Stop tests retain media release and
stale-callback invalidation. These suites guard input admission, settlement,
interruption, consent, handoff and teardown; they do not establish acoustic correctness.
The full website suite was not rerun for this localized change.

`yarn workspace @apps/petrinaut-website lint:tsc`, `lint:eslint` and `build` pass.
Lint reports zero warnings/errors. Build reports unchanged React Compiler
`try`/`finally` optimization and chunk-size warnings. Changed-file `oxfmt --check`
and `git diff --check` pass; Brunch Markdown is excluded by repository formatter
configuration and reviewed directly. No UI appearance or interaction controls change.

Current restack verification: `turbo run build lint:tsc lint:eslint --filter
@apps/petrinaut-website --output-logs=errors-only` passes all 16 tasks (9 cached).
The seven-suite run includes the parent's new consent and Thinking controller tests.
The production diff against this parent remains only the capture preferences;
consent and dock implementation are unchanged from that parent.

### Manual speaker and headphone witness — pending, owner-held

Allow about five minutes per output mode. Kostandin compares the pinned base and
this branch using the same browser, microphone, volume, prompt and disposable
document. Inspect effective capture settings using the browser's WebRTC diagnostics;
record unavailable settings as unknown, not confirmation. Do not start a second
capture just to inspect settings. Requested preferences may already be defaults.

1. Connect both sessions and remain silent while a short no-tool Brunch answer
   plays. Compare speakers and headphones; inspect completed input, canonical
   admissions, delegation and commentary separately. Target zero unwanted admissions.
2. During playback give short novel replies and quantity/negation corrections;
   hesitate, elaborate and deliberately quote the assistant. Check exact retained
   words and admission order. Lost corrections invalidate apparent improvement.
3. Exit Voice and check silence/cleanup. If feedback persists, use headphones or
   typed input. For the existing manual fallback, end Live, explicitly start
   Realtime, disable “Interruption by speaking” and use “Your turn.” Never switch
   or replay automatically. Unknown admission requires inspecting history first.

This witness can support a limited mitigation claim, not an all-device guarantee,
native speech fidelity, tool-turn acceptance or migration readiness. No new paid
allocation, recording or agent-run audio session is granted.

## Constraints

- Preserve Realtime, default provider selection, consent, provider pinning, one
  capture feeding both sessions, and teardown on failure/Stop. No extra capture,
  session, dependency, telemetry store, retry or automatic fallback.
- Keep `gpt-4o-transcribe`, default server VAD, provider item ordering, no-delegation
  admission, one waiting composer slot, frozen settled commentary and once-only
  offering unchanged. No transcript suppression, fuzzy matching or new timers.
- Brunch remains canonical answer/tool authority. Live speech remains native and
  best-effort; settlement gates supplied context, not every audible word. Append
  acknowledgment is not consumption, speech, playback or execution completion.
- Preserve visible full text and no truncation/chunking/replay on commentary
  rejection. Local Exit and canonical Stop remain distinct from acoustic interruption
  and from canceling already-executed effects.
- No changes to parent branches, existing issues/PRs, Brunch prompts, models, VAD,
  services or infrastructure. Push and draft creation are authorized for this child
  only; no merge, deployment or agent microphone/provider sessions. Prior FE-1664
  publication permissions do not transfer to this mission.

## Fog-line

The reported silent “No tengo.” admission demonstrates unwanted input, not whether
echo, background audio, routing or hallucination caused it. Browser defaults may
already apply these preferences; effective settings and the manual contrast decide
whether this change has acoustic value. A passing configuration test does not.

Live-native transcripts and client delegation remain an alternative, not a selected
replacement. Transcript deltas lack authoritative finalization/item identity;
delegation has an opaque ID, target and offset, not task text. Separate transcription
finalizes audio items, not complete thoughts. Shared capture does not synchronize
the sessions' clocks. The cross-session range-selection oracle remains unresolved:
which immutable input range belongs to a delegation, and when is it complete?
Latest-item pairing, arrival order, silence timeouts or fuzzy matching cannot prove
it. This cut neither changes that policy nor claims to solve it.

Mandatory half-duplex could enforce app playback/capture exclusion at the cost of
simultaneous listening. Live lacks Realtime's response-terminal/handoff lifecycle;
do not invent it from activity telemetry or append acknowledgments.

## Stop or reorient

Stop after provider-free preparation for Kostandin's witness. Do not add filtering
automatically. Return to the owner if preferences change neither settings nor
failure, headphones still produce silent admissions, or genuine corrections are
lost. Reclassify the observed failure before adding a mechanism.

If deterministic prevention is required, select half-duplex/typed policy explicitly.
If delegation-driven invocation is required, resolve finalization/range selection
first. Any new queue, gate, prompt, model or handoff policy requires a new accepted
cut. Premature substantive speech, reordered/lost corrections, replay of uncertain
work or revived speech after Stop remain failures, not accepted side effects.

## Deferred

[Voice feedback follow-up](MISSION.next.md#voice-feedback-follow-up) retains the
conditional filtering, native-delegation and half-duplex alternatives. The existing
[Voice recovery obligation](MISSION.next.md#voice-after-the-live-transport-cut),
parent integration witness and Mission 7c/7d obligations remain open under their
owners; this cut does not consume their waivers or acceptance.
