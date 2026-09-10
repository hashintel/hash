# Full Voice suite after the producer instruction repair

**Result: two scenarios pass, four fail before user-turn admission.** Both successful recordings contain their closing questions verbatim, but only one of the two new answers has a question marker. The Voice-only prompt repair does not reliably enforce marker production. This run is not a release-readiness or overall fidelity verdict.

## Execution and scope

- The owner requested all scenarios in one run, explicitly removed the previous dollar ceiling, and requested an experiment outline afterward. That authorization covered this full suite; the experiments below were not executed.
- All six scenarios ran once, serially through the existing runner, with no per-scenario approval pauses and no harness retries. Serial execution preserves comparability and avoids browser resource contention; it is not a concurrent-load test.
- Started 2026-09-10 at 21:50:19.973 UTC; the final scenario trace was written at 21:54:53.274 UTC. A tool connection interruption delayed inspection and lost the tracked terminal process; the actual final exit status was not recovered. All six completed artifact sets and the retained failing checks establish the suite's failed verdict.
- Current local instrumentation repair and Voice-only producer instruction repair were present. No product or harness behavior was changed during this suite. Node 22.21.1, Chrome 145.0.7632.6, existing macOS synthetic WAV inputs, `claude-haiku-4-5`, and unchanged Realtime policy.
- Root `.env.local` supplied only the two required provider keys to their respective services. Website `127.0.0.1:4341`, Brunch `127.0.0.1:4342`, fresh disposable SQLite database, and the existing `/agents/chat` proxy. Health/config checks passed before the run. Both service processes were absent and both ports clear afterward.
- All six retained verdicts were reproduced by `checkTrace(scenario, trace)`. All screenshots and both substantive recordings were inspected. Traces and the derived producer record extract passed an environment-value scan. The original failed recordings and traces were not altered.
- Brunch's saved completed-message usage reports **$0.0632236**, including fixture preparation. This excludes OpenAI Realtime/transcription and any unreported failed attempts; it is not total billing. Flue/provider recovery attempted work during fixture failures even though the harness did not retry scenarios.

```sh
VOICE_E2E_APPROVED=true \
VOICE_E2E_INPUT_DIR=/tmp/hash-voice-e2e-fixtures \
VOICE_E2E_WEBSITE_URL=http://127.0.0.1:4341 \
BRUNCH_CHAT_ORIGIN=http://127.0.0.1:4342 \
yarn workspace @apps/petrinaut-website voice:e2e
```

## Scenario results

Every scenario directory retains `trace.json`, `utterance.wav`, `output.webm`, and `screenshot.png`. The two fixture-failure output files are intentionally empty.

| Scenario | Verdict | Evidence and limits |
| --- | --- | --- |
| [Short clarification](short-clarification/trace.json) | Pass | One admitted answer; Listening; acknowledgement 1,119.2 ms, settlement → audio 861.9 ms. Final question audible verbatim, but no marker on the new answer. [Audio](short-clarification/output.webm) · [Screen](short-clarification/screenshot.png). |
| [Long analysis](long-analysis/trace.json) | Fail: connection | Server returned HTTP 200 in 2,201.9 ms; browser connection timed out at 15,007.5 ms. No committed input or user-turn admission. Fixture revision 0; silent output. [Screen](long-analysis/screenshot.png). |
| [Barge-in](barge-in/trace.json) | Fail: fixture preparation | Screenshot remains “Preparing…”; Voice never opened. Database records fixture submission failure after provider timeouts. No user input or interruption was exercised. [Screen](barge-in/screenshot.png). |
| [Follow-up while working](follow-up-while-working/trace.json) | Fail: fixture preparation | Screenshot remains “Preparing…”; no Voice input, queueing or speech. Database shows recovery and eventual fixture completion after the capture, which does not retroactively pass the scenario. [Screen](follow-up-while-working/screenshot.png). |
| [Hesitant speech](hesitant-speech/trace.json) | Pass, two warnings | One complete input despite pauses; new question marked and spoken verbatim; Listening. Acknowledgement 3,372.8 ms and settlement → audio 3,455.0 ms exceed warn-only budgets. [Audio](hesitant-speech/output.webm) · [Screen](hesitant-speech/screenshot.png). |
| [One-word answer](one-word-answer/trace.json) | Fail: connection | Server returned HTTP 200 in 8,825.3 ms; browser timed out at 15,004.7 ms. No “Yes” commit, admission or not-heard notice. Silent output. [Screen](one-word-answer/screenshot.png). |

Timing values are provider-buffer proxies, not measured first-audible latency. The four failed scenarios do not establish a regression in canonical-answer generation, interruption, queueing or one-word recognition: those paths were not reached. The server's HTTP success also does not establish WebRTC/ICE/data-channel success. The precise connection-failure cause remains unknown.

## Question metadata and audio

The [producer record extract](producer-records.json) contains six conversation identities, tool/data records, submission outcomes and reported Brunch costs, derived read-only from 2,058 records. It omits private reasoning and raw database contents.

- **Short clarification:** new answer `entry_01M26MTSHCWQYA3NPG4QH8F208` did not call the marker tool. Its only conversation marker belongs to the earlier fixture-preparation submission, not the answer. Nevertheless the inspected recording ends exactly “Which reflects how your process actually works?” It also speaks the canonical reserved/not-reserved distinction and the preceding operational question. The utterance completes without truncation. An unmarked question can be spoken; a successful recording does not prove marker compliance.
- **Hesitant speech:** the user-turn submission calls `brunch_mark_question` with tool-call ID `toolu_014JBCExbYmKMkN8Usaw7xfP` and emits `brunch-question` data. The canonical question and inspected audio match: “When a batch enters final inspection, must an available dispatch crew be claimed or assigned to that batch at that moment, making that crew unavailable for other work until sign-off returns them?” It is spoken once and completes. The preceding speech preserves the unconfirmed-hypothesis qualification and missing input arc. This is one positive witness, not a measured compliance rate.
- **Failed connections:** decoded PCM for long analysis (12.42 seconds) and one-word answer (5.82 seconds) has zero peak, zero RMS and zero nonzero samples. They contain no audible speech. A media-tool suggestion of a word in the one-word clip was contradicted by the all-zero PCM and is rejected. Nonempty Opus containers and a passing duration/byte check are not proof of speech.

## A question-spoken metric can falsely label an acknowledgement

The short-clarification trace associates `question-spoken-started` and `question-spoken` with fixture question `toolu_01QZAGQS2u3dFGUMaZbMzuCZ` at the acknowledgement's start/end, before the new canonical answer exists. The source in `voice-turn-controller.ts` records these marks whenever `#currentQuestionId` exists on `output-started`/`output-stopped`, without requiring a question-bearing request or matching delivery.

The recording at that point contains the receipt notice, not the fixture question. Therefore these marks must not be treated as exact-question or semantic-delivery evidence. The recorded media and producer metadata remain the separate oracles. No instrumentation fix or check weakening was made during this run.

## Proposed experiments, in order — not executed

### 1. Repair and falsify question-delivery measurements offline

**Hypothesis:** stale question state and notices explain false-positive question-spoken marks. Reproduce with an existing fixture question, a new delivery acknowledgement, progress speech, a correctly marked paraphrase, exact replay, and an interruption. The old question must not be credited by unrelated notices; markers must correlate to the correct question-bearing request/delivery. Include a silent recording control so byte count/duration is never presented as semantic success. Keep audio listening as the oracle even after event correlation is corrected. This is a prerequisite for trusting the later experiments, not a provider trial.

### 2. Isolate setup reliability from speech behavior

**Hypothesis:** fixture-provider recovery and WebRTC establishment independently censor scenarios. Run ten connection-only trials and ten fixture-preparation-only trials on the same host/network. Capture HTTP completion, ICE/peer state, data-channel open, deadline, fixture admission and terminal outcome using metadata only—no raw SDP or credentials. Record provider/runtime retry counts and preparation elapsed time. Compare the current fixture wait with a diagnostic longer wait to distinguish slow completion from permanent failure; do not silently redefine the suite's acceptance deadline. Do not feed timed synthetic speech into a connection that has consumed its leading silence. Rerun the four blocked scenarios only after these boundaries are understood; retain all failed attempts.

### 3. Compare producer marker compliance before and after the instruction change

**Hypothesis:** the Voice-only reminder improves but does not guarantee marking. Use twenty matched inputs per variant covering direct closing questions, source-attributed questions, repeated unresolved questions, quoted discussion, rhetorical questions and headings. Label which cases actually ask the person to answer before running either variant. Hold model, fixture and the rest of the prompt fixed; interleave variants to reduce time-dependent provider effects. Score missing markers, false markers, exact text agreement, duplicate markers and latency separately from whether speech happens to include the question. Exclude fixture-preparation markers from user-turn scores. This is a pilot, not statistical proof. Persistent omissions would justify an owner-reviewed explicit structured question contract rather than browser punctuation guessing or another unmeasured prompt patch.

### 4. Test spoken fidelity independently of Brunch generation

**Hypothesis:** providing complete source and an exact marked question does not prevent other omissions. Feed twelve fixed canonical responses through the real speech path, covering negation, numeric quantities, uncertainty, late corrections, rejected/no-op actions, long analysis and closing questions. Use independent expected facts/questions, not assertions copied from generated speech. Inspect audio against the full source; count omitted consequential qualifications, unsupported additions, changed quantities, question omissions/rewording and truncation. Separate source selection, request payload and spoken output evidence. Do not weaken source prompts or checks to match what the renderer happens to say.

### 5. Measure FIFO audio waiting separately from provider startup

**Hypothesis:** the prior 26–29-second follow-up warnings are dominated by an earlier answer still playing. Use a two-turn pair with short, medium and long first answers and a follow-up that settles during playback; repeat each three times. Keep FIFO and both canonical answers intact. Record settlement → request, request → audio, first-answer playback end, cancellation and final Listening, with synchronized input/output for audible-gap claims. Compare these measurements before proposing shorter paraphrases or a different interruption policy. Any policy change that drops or supersedes an answer needs a separate owner decision.

These experiments are an outline only. No further provider runs, product changes, publication or mission acceptance are implied by this report.
