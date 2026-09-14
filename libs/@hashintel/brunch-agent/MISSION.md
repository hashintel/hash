# Stabilize GPT-Live full-duplex voice feedback

## Status

Live capture and transcription turn-boundary mission for
[FE-1712](https://linear.app/hash/issue/FE-1712/stabilize-gpt-live-full-duplex-voice-feedback).
Publication base: restacked FE-1664 at
[1d34240db9](https://github.com/hashintel/hash/commit/1d34240db9c2605187abe9c6442d51326d16e5da),
not `origin/main`. The original comparison revision is
[3cf4ca6b1f](https://github.com/hashintel/hash/commit/3cf4ca6b1f75f78cb2e086463517c02affd6ce54);
the previous publication base was
[006cbced7f](https://github.com/hashintel/hash/commit/006cbced7f10263f8b5f3cc305ee1ca6b722b9ce).
Only this child's commits were rebased; FE-1664 and its PR are not modified by
this mission. In both restacks the sole conflicts were this mission and its website
pointer; the parent's newer consent and Thinking dock contracts are preserved below,
without expanding the capture-only cut. The parent's removal of the dock notice
prop and of the inherited `PR_DESCRIPTION.md` draft is inherited unchanged.
The separate authority commit is
[466034cfe1](https://github.com/hashintel/hash/commit/466034cfe138e4f1f7befdcde3d16cd9f6037905).
The capture-only implementation is prepared: its assertion failed before the
change, and 317 targeted tests, website typechecking, lint and build now pass.
The semantic-VAD recut is implemented locally and provider-free checks pass.
The corrected medium probe completed all three synthetic transcripts, with the
correction retained in one item and continuous silence verified. Earlier correction
verdicts remain invalid because those harnesses stopped sending after the last clip.
The accepted 500 ms Speaking-indicator hold and patient Live listening prompt are
implemented and provider-free checks pass. Next: Kostandin tries a fresh Live session
to judge hesitation, self-corrections and the indicator's feel. Human conversational
latency and the physical speaker/headphone witness remain owner-held; no additional
automatic tuning or provider run. Commit and push of this preparation are authorized.
Acoustic benefit, natural turn boundaries and mission acceptance remain unproved.
All three provider allocations are consumed; no further provider run. Publication
of the prepared work is authorized below. The child is restacked on the parent's
current head; the inherited root `PR_DESCRIPTION.md` that failed CI Markdown lint
and formatting is gone with the parent. Repository-wide format and Markdown lint
pass locally; the GitHub Lint workflow had not run since the parent conflict began.

## Imperative

Reduce the risk that assistant playback becomes fresh user input while preserving
genuine interruptions and existing Realtime support. First determine whether
requesting the browser processing already used by Realtime improves Live's capture.
This is a mitigation hypothesis, not deterministic feedback-loop prevention.
Also reduce premature single-word submissions reported by Kostandin: use semantic
turn detection on the separate transcription session rather than silence alone.
Reduce rapid Speaking/Thinking/Listening flicker and ask Live to allow hesitation
and self-correction without taking over the person's unfinished thought.

## Throughline

Consented Start → one microphone capture → Live and `gpt-4o-transcribe` WebRTC
sessions → committed/completed input ordering → existing composer/Flue admission
→ Brunch settlement → frozen commentary → native Live playback. Playback can still
re-enter capture; filtering canonical input alone would not prevent Live reacting.

Protected source: FE-1664 at the pinned base above. Its complete integration,
canonical ownership, admission, delivery and recovery contracts remain inherited
behavior, not accepted proof. Permitted deltas are Live's `getUserMedia` preferences
and the separate transcription session's turn-detection configuration below,
plus the accepted indicator hold and listening-prompt recut below.
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
parent desktop/mobile witnesses own the visual layout. Only the output-activity
hold changes; status precedence and layout remain unchanged.

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

Turn-boundary recut in `apps/petrinaut-website/src/server/voice/`:

- `openai-transcription-session.ts`: replace `server_vad` with
  `{ type: "semantic_vad", eagerness: "medium" }` for `gpt-4o-transcribe` only.
  No silence timer, transcript aggregation, admission change or fallback retry.
- `openai-transcription-session.test.ts`: update the existing exact outbound
  session-body assertion first; observe failure on server VAD, then pass on the
  selected semantic configuration. Preserve model, scoped credential and raw SDP.
- `openai-voice-policy.ts` and Realtime routes remain unchanged. PR #9619 already
  used semantic VAD with medium eagerness; this comparison now matches that setting.

Patient-listening recut, relative to the website's `src/`:

- `main/app/voice-interview/live-conversation.ts`: increase the existing local
  output-activity hold from 300 to 500 ms. Keep the 100 ms sampler, immediate
  activity onset and teardown/recovery behavior. This is display telemetry only,
  never a playback-completion signal or a submission delay.
- Extend its existing telemetry test first: 400 and 499 ms stay active; the next
  sample at 500 ms clears activity. A later audio burst restarts the hold; Stop
  during the hold mutes playback immediately and late samples cannot revive it.
- `server/voice/openai-live-session.ts`: keep sparse backchannels and add a short
  instruction to listen through thinking pauses and self-corrections rather than
  take over unfinished thoughts. Preserve Brunch authority and interruption policy.
- Run the Live transport, controller, session-creation, transcription, bridge and
  Realtime regression suites plus website build/typecheck/lint. Review prompt
  delivery in the existing request test; a phrase-inventory test is not a speech
  oracle. No new files, mechanism, queue, gate, dependency or provider allocation.

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
- **2026-09-14:** Kostandin accepts switching Live's separate transcription session
  to semantic VAD after reporting single-word submissions. Use the discussed low
  eagerness, keep Realtime unchanged, commit this authority separately and verify
  locally without microphone/provider sessions. No new push or tracker write.
- **2026-09-14:** Kostandin authorizes one real `gpt-4o-transcribe` session with
  at most three minutes of synthetic audio, no microphone access and no retries,
  to test hesitation, short replies and correction retention headlessly.
- **2026-09-14:** After the low run, Kostandin accepts testing medium eagerness:
  change only that transcription setting and its exact request assertion, then
  repeat one session under the same 180-second/audio limit, without retries,
  microphone access, other providers, Brunch inference or publication.
- **2026-09-14:** Kostandin authorizes one corrected medium session under the same
  three-minute cap, with continuous synthetic silence, no microphone and no retries.
- **2026-09-14:** Kostandin authorizes pushing the prepared semantic-VAD change and
  removing Amp thread-ID trailers from this child's commit messages. Preserve
  authorship and parent commits; no merge, deployment or new provider allocation.
- **2026-09-14:** Kostandin accepts the patient-listening recut above with a 500 ms
  indicator hold, not 800 ms, plus the prompt change. Test locally, commit without
  Amp thread IDs, push and refresh this draft's proof. No restack, changed submission
  timing, Realtime change, new provider run or other tracker write.
- **2026-09-14:** After CI Markdown lint and formatting failed on the inherited
  `PR_DESCRIPTION.md`, Kostandin authorizes the cleanup, removal of Amp thread IDs
  from this child's commits, and restacking onto the parent's current head with an
  explicit lease, reconciling this mission and refreshing the draft PR. No Linear,
  parent-branch, merge, deployment or microphone/provider change.

## Proof

### Patient-listening recut — provider-free proof passed, human witness pending

The existing `live-conversation.test.ts` telemetry case owns the 500 ms boundary,
renewed activity and immediate Stop/late-sample behavior. Existing
`live-conversation-control.test.tsx` cases own Speaking/Thinking/Listening and
connection/error precedence. These tests do not establish conversational patience.
Verified 2026-09-14: the new 400 ms assertion failed on the old 300 ms hold, then
passed with 500 ms. The test also checks 499/500 ms, renewed activity, immediate
Stop at 499 ms during a pending stats read, and no late-state revival. All 386 tests
in 11 targeted Live/Realtime suites passed under OS network denial; after tightening
the Stop timing, all 40 transport tests passed again. A temporary jsdom render of
the real `VoiceDock` verified its accessible region and Speaking → Thinking →
Listening text transitions; the temporary probe was removed. No layout changed.
Website build, typecheck and lint passed all 16 Turbo tasks (10 cached); changed-file
formatting and whitespace checks passed. The full website suite was not rerun.
The Live session-creation test owns outgoing instruction carriage and unchanged
provider configuration; the prompt was inspected against OpenAI's
[pause-handling guidance](https://developers.openai.com/api/docs/guides/live-prompting).
Provider-free checks may establish timing and configuration only. Kostandin's next
fresh Live session remains the oracle for natural hesitation, short complete replies,
corrections, sparse acknowledgments and stopping speech when interrupted. Stop and
reorient if the indicator lingers misleadingly or the prompt worsens interruption
handling. The previous three synthetic transcription probes do not evaluate this
Live prompt, and their allocations remain consumed.

### Corrected medium probe — synthetic retention verified, human latency pending

One `gpt-4o-transcribe` session, semantic VAD / medium, at most 180 seconds of
synthetic audio and closed within 180 seconds after connection. No retries,
alternate model/setting, microphone, GPT-Live or Brunch inference. Use the same
actual endpoint, fixture bytes (compare hashes to the medium run), pause schedule
and 15-second final wait. Keep a zero-valued `ConstantSourceNode` connected and
active until teardown; inspect increasing RTP packet count and sample duration
through the final wait. No forced commits. Retain exact transcripts, timings,
session identity, usage and verified cleanup in the local-only native record at
`/tmp/fe1712-semantic-vad-medium-silence-T-01a09fe5/`. Remove temporary harness and
audio after inspection. Stop after this allocation for owner review. This can
adjudicate the three synthetic transcription cases, not human speech or echo.

Observed 2026-09-14: session `sess_EO2X7U9GGGko3GvAOeQFU` confirmed semantic VAD
with medium eagerness. Input WAV hashes matched the inspected medium fixtures.
Exactly three committed items and three completed transcripts arrived in the
same predecessor order, with no extra inputs or errors:

- “The inventory should contain twelve items, not twenty.” — 6.04 seconds after
  speech ended; the one-second mid-sentence pause did not split the input.
- “Yes” — 5.42 seconds after speech ended, before the next case.
- “Set it to twenty. Actually, twelve.” — one item, 1.29 seconds after the
  correction ended, retaining both values in order.

All eight final-silence samples showed increasing packet count and source duration:
1698 → 2428 packets and 35.13 → 49.48 seconds. The corrected sender did not stall.
An independent read of `events.jsonl` asserted exact transcripts, item order, one
allocation, no provider errors, and closed peer/context/track with zero microphone
calls. The session lasted about 48 seconds; 5.49 seconds were synthesized speech.
Reported completed-item usage was 102 audio-input and 26 output tokens (128 total);
invoice cost is not established. `events.jsonl` and `attempt.json` in the directory
above are the local-only evidence. No product change, retry, push or deployment
was made during this probe. Keep medium locally for owner review; the 5–6 second
wait on the first two cases remains a usability concern, not an accepted latency.

### Medium-eagerness comparison — completed, correction oracle invalid

Reuse the actual panel endpoint and the low run's five locally generated clips,
one-second internal pauses, 12-second inter-case gaps and 15-second final wait.
Inspect fixture contents before dispatch. Record outbound RTP and audio-source
stats through the final silence to distinguish unfinished provider output from
a stopped synthetic sender. Do not force a commit or manufacture a final event.
The only new paid allocation is one `gpt-4o-transcribe` session, closed within
180 seconds after connection, with at most 180 seconds of synthetic input.
No retry or alternate setting in that session. Store safe native records under
`/tmp/fe1712-semantic-vad-medium-T-01a09fe5/`; remove temporary harness/audio after
inspection. The same boundary, retention, latency and cleanup oracles below apply.
Provider-free proof: the exact request-body assertion must fail on low and pass
on medium; rerun the five targeted suites, website typecheck and lint.
This single synthetic comparison cannot establish human speech or echo behavior.

Observed 2026-09-14: session `sess_EO2SYiIYt07MDK84kntaf` confirmed semantic VAD
with medium eagerness. The inventory sentence stayed together and completed
5.52 seconds after its scheduled end (low: 9.50); “Yes.” completed in 4.44 seconds
(low: 6.48). The correction sequence started one item but never finalized.
RTP evidence explains why that last case cannot adjudicate VAD: after the final
clip, outbound packets remained at 1645 and source duration at 32.49 seconds
throughout the 15-second wait. The audio context still ran, but sent no silence.
The earlier cases had increasing packet counts during their pauses, so their
latencies remain observations, not controlled proof of improvement across runs.

A local-only RTC pair reproduced the instrument defect and checked its repair:
after a completed clip, the old sender emitted zero additional packets over
three seconds; an active `ConstantSourceNode` with offset zero emitted 150 packets
and 3.01 additional audio seconds. No provider was called for this contrast.
Any future paid probe must retain that zero-valued source through the final wait
and inspect increasing outbound sample duration before judging finalization.
This repairs only the synthetic instrument, not product microphone behavior.

Native `events.jsonl`, `attempt.json` and `local-silence-check.jsonl` in the medium
directory above retain the inspected evidence. One session, roughly 48 seconds,
5.49 seconds of synthetic speech; zero microphone calls and verified teardown.
Completed items reported 62 audio-input plus 16 output tokens (78 total);
unfinalized-item usage and invoice remain unknown. No retry or publication.
The medium request assertion failed on low then passed; all 127 targeted tests,
changed-file formatting and 15 website typecheck/lint tasks pass (10 cached).
Product code remains medium, unaccepted for full conversational quality.

### Bounded headless transcription probe — completed, acceptance not established

Use the actual `createOpenAITranscriptionSessionHandler` with the website's Vite
development environment loader (process values win). Drive its raw-SDP WebRTC
boundary from installed headless Chromium with a Web Audio synthetic track, not
`getUserMedia`. Generate only the three fixed witness phrases locally with macOS
speech synthesis; no TTS provider, Live session, Brunch inference or private data.
The only paid allocation is one `gpt-4o-transcribe` session, at most 180 seconds
of synthetic input, closed within 180 seconds after connection. No retries,
alternate models, second allocation or provider fallback on rejection/timeout.

Inspect effective session configuration, provider item boundaries, exact completed
transcripts and timing relative to the scheduled one-second intra-phrase pauses.
Hesitation should remain one item; “Yes” must finalize without waiting for another
utterance; correction must retain both twenty and twelve in order. Report latency
rather than claiming a universal acceptable threshold. This is a synthetic
transcription-boundary probe, not proof of Brunch admission or physical echo.
Keep request/session IDs, returned usage and safe events in one local-only native
record under `/tmp/fe1712-semantic-vad-T-01a09fe5/`; unknown billing is not zero.
Stop after the single run or first rejection and return its evidence. Remove
temporary harness/audio after inspection; retain the safe native result.

Observed 2026-09-14 via the already-running panel at `localhost:4915`, whose process
cwd is this checkout's website and whose API loader imports the current handler:
OpenAI session `sess_EO2KwbqCN3NRqcsrfVQ80` confirmed `gpt-4o-transcribe` and
`semantic_vad` / `low`. Safe native records are `events.jsonl` and `attempt.json`
in the local-only directory above. One attempt, roughly 48 seconds connected,
5.49 seconds of synthesized speech plus silence, zero microphone calls; the peer,
audio context and track all closed. No retry, GPT-Live or Brunch inference.

- Hesitation: the one-second pause after “The inventory” stayed in one exact
  completed sentence: “The inventory should contain twelve items, not twenty.”
  Completion arrived 9.50 seconds after the scheduled end of that sentence.
- Short reply: “Yes.” finalized before the next input, but 6.48 seconds after
  its scheduled end. Promptness is not established.
- Correction: “Set it to twenty.” finalized separately (1.34 seconds after its
  end); the provider began another item for “Actually, twelve” but never emitted
  its stop/commit/completion during the remaining 15 seconds. Both correction
  words were verified in the exact input fixture after its internal pause.
  **Correction oracle invalid:** the medium probe and local sender contrast above
  exposed a shared harness defect: after the last clip it stops sending silence.
  Retract the earlier retention/finalization-failure interpretation; this case
  cannot establish provider loss or behavior with a real microphone. Brunch was
  not invoked. No low-run RTP trace exists to adjudicate that session independently.

Latencies use the browser's common monotonic clock for scheduled audio and event
receipt; they include provider/network delay, not just the VAD classifier.
Completed items reported 79 audio-input and 23 output tokens (102 total).
Unfinalized-item usage and invoice cost remain unknown, not zero. This evidence
motivates the separately accepted medium comparison above, not an acceptance claim.

### Semantic turn-boundary recut — locally verified, owner witness pending

Verified 2026-09-14: the exact outbound-body assertion failed on `server_vad`
before the change. After switching to semantic VAD with low eagerness, 127 tests
pass under OS network denial: `openai-transcription-session.test.ts`,
`openai-realtime-call.test.ts` and `openai-voice-policy.test.ts` under
`src/server/voice/`, plus `live-conversation.test.ts` and `live-brunch-bridge.test.ts`
under `src/main/app/voice-interview/`. Use the network-denied unit command below
with those five paths. These prove request configuration, unchanged Realtime policy
and existing failure/no-retry behavior, not provider acceptance or speech quality.
`turbo run lint:tsc lint:eslint --filter @apps/petrinaut-website
--output-logs=errors-only` passes all 15 tasks (10 cached). Changed TypeScript
formatting and `git diff --check` pass. Full website tests/build were not rerun
for this configuration-only recut. No provider session or UI change was made.

Owner-held witness: in a fresh Live session, compare a hesitant phrase such as
“The inventory ... um ... purchase quantity is twelve, not twenty” against a
deliberately complete “Yes.” Check exact retained words, submission count/order,
and whether waiting feels excessive. Repeat with speakers and headphones. Do not
discard short legitimate answers to make the witness pass. Compatibility and
improved boundaries remain unproved until this actual product observation.

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

Prior capture-only restack verification: `turbo run build lint:tsc lint:eslint --filter
@apps/petrinaut-website --output-logs=errors-only` passes all 16 tasks (9 cached).
The seven-suite run includes the parent's new consent and Thinking controller tests.
That production diff against the parent contained only the capture preferences;
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
native speech fidelity, tool-turn acceptance or migration readiness. Only the
separate bounded headless probe above grants an agent-run provider allocation.

## Constraints

- Preserve Realtime, default provider selection, consent, provider pinning, one
  capture feeding both sessions, and teardown on failure/Stop. No extra capture,
  session, dependency, telemetry store, retry or automatic fallback.
- Keep `gpt-4o-transcribe`, provider item ordering, no-delegation
  admission, one waiting composer slot, frozen settled commentary and once-only
  offering unchanged. No transcript suppression, fuzzy matching or new timers.
- Brunch remains canonical answer/tool authority. Live speech remains native and
  best-effort; settlement gates supplied context, not every audible word. Append
  acknowledgment is not consumption, speech, playback or execution completion.
- Preserve visible full text and no truncation/chunking/replay on commentary
  rejection. Local Exit and canonical Stop remain distinct from acoustic interruption
  and from canceling already-executed effects.
- No changes to parent branches, other issues/PRs, Brunch prompts, models,
  services or infrastructure. Push and draft creation are authorized for this child
  only; no merge, deployment or agent microphone access. The only provider exception
  is the bounded transcription probe above. Prior FE-1664
  publication permissions do not transfer to this mission.
- Only the separate Live transcription session may switch VAD as specified above;
  do not change Realtime. The only native Live behavior change is the accepted
  patient-listening instruction; its effect is probabilistic, not enforced timing.

## Fog-line

The reported silent “No tengo.” admission demonstrates unwanted input, not whether
echo, background audio, routing or hallucination caused it. Browser defaults may
already apply these preferences; effective settings and the manual contrast decide
whether this change has acoustic value. A passing configuration test does not.

OpenAI's [VAD guide](https://developers.openai.com/api/docs/guides/realtime-vad)
documents semantic VAD for supported transcription sessions and low eagerness for
larger chunks. Actual acceptance with this model/session is the headless probe's
first discriminator; natural human speech remains owner-witnessed.
Semantic VAD is probabilistic and may add latency; it does not guarantee a complete
thought or prevent echo. The earlier VAD rejection on a different model does not
establish incompatibility for `gpt-4o-transcribe`.

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

Stop after the bounded headless probe for Kostandin's review. Do not add filtering
automatically. Return to the owner if preferences change neither settings nor
failure, headphones still produce silent admissions, or genuine corrections are
lost. Reclassify the observed failure before adding a mechanism.
For the turn-boundary recut, stop on provider rejection, continued fragmentation,
lost corrections or unacceptable delay. Preserve the existing visible connection
failure without silently reverting VAD; use typed input or explicitly ended Live
followed by Realtime. Return to the owner before selecting another setting.

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
