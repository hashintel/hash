# First local Voice E2E sweep

**Result: five scenarios pass; queued follow-up fails one required sequence check and has one latency warning.** The runner exits 1. This is not a release-readiness, semantic-correctness, fidelity, naturalness, or human-acceptance verdict.

## Execution

- Date: 2026-09-10, starting at 19:44:24.646 UTC (21:44 Europe/Tirane).
- Branch: `ka/fe-1656-voice-e2e-harness`; local harness changes reject unadmitted speech even with a not-heard notice. Product source was not changed.
- Node 22.21.1; Playwright 1.58.2; Chrome 145.0.7632.6.
- User approved one six-scenario live sweep with the existing $5 aggregate ceiling, using root `.env.local`. Only its `ANTHROPIC_API_KEY` and `OPENAI_VOICE_API_KEY` were passed to the local services; credentials are not retained here.
- Website: `http://127.0.0.1:4341`; Brunch: `http://127.0.0.1:4342`. Both readiness checks passed before the browser opened: Voice config HTTP 200 with `available: true`, and Brunch health HTTP 200.
- Brunch used a fresh disposable SQLite database, `claude-haiku-4-5`, and the existing local proxy config with `/agents/chat`. Voice used the unchanged `gpt-realtime-2` policy and `gpt-4o-transcribe` input transcription.
- Existing local servers were not reused or stopped. The isolated services were shut down after the sweep; neither isolated port remained listening.
- All seven source utterances were generated with macOS `say`. `ffprobe` independently confirmed 48 kHz, mono, 16-bit PCM. The harness composed leading, inter-turn, and trailing silence.
- Two startup attempts failed before any browser/provider connection: a concurrent Yarn installation temporarily removed dependency links; then the website `dev` wrapper could not resolve `yarn vite`. The successful launch used `yarn workspace @apps/petrinaut-website exec vite --config ../brunch-agent/petrinaut-local.vite.config.ts` with the isolated environment. No paid scenario was retried.
- Exact provider spend is not available in the retained harness artifacts. The authorized ceiling and a single bounded sweep are not billing evidence; no claim that actual dollars were verified follows from audio duration or these results.

The paid runner command was:

```sh
VOICE_E2E_APPROVED=true \
VOICE_E2E_INPUT_DIR=/tmp/hash-voice-e2e-fixtures \
VOICE_E2E_WEBSITE_URL=http://127.0.0.1:4341 \
BRUNCH_CHAT_ORIGIN=http://127.0.0.1:4342 \
yarn workspace @apps/petrinaut-website voice:e2e
```

## Automated results

Every scenario directory contains the original `utterance.wav`, `trace.json`, `output.webm`, and `screenshot.png`. The trace is the oracle for correlated events and verdicts; screenshots and audio are separate inspected evidence.

| Scenario | Result | Ack proxy, ms | Settlement → TTS proxy, ms | Observed outcome | Inspected media |
| --- | --- | --- | --- | --- | --- |
| [Short clarification](short-clarification/trace.json) | Pass | 1,069.7 | 796.1 | One commit, one canonical answer, Listening. | [Audio](short-clarification/output.webm) · [Screen](short-clarification/screenshot.png) |
| [Long analysis](long-analysis/trace.json) | Pass | 1,992.8 | 1,262.6 | Complete input; canonical analysis; fixture revision remains 0. | [Audio](long-analysis/output.webm) · [Screen](long-analysis/screenshot.png) |
| [Barge-in](barge-in/trace.json) | Pass | 1,022.8 | 969.3 | Your turn action, aborted paraphrase, unchanged canonical text, Listening. | [Audio](barge-in/output.webm) · [Screen](barge-in/screenshot.png) |
| [Follow-up while working](follow-up-while-working/trace.json) | **Fail + warning** | 1,477.8 / 1,249.5 | 1,251.4 / **26,053.2** | Two capture-ordered admissions and two answers; first turn lacks `first-canonical-text`. | [Audio](follow-up-while-working/output.webm) · [Screen](follow-up-while-working/screenshot.png) |
| [Hesitant speech](hesitant-speech/trace.json) | Pass | 1,492.8 | 1,105.0 | One provider commit and one complete question despite interior pauses. | [Audio](hesitant-speech/output.webm) · [Screen](hesitant-speech/screenshot.png) |
| [One-word answer](one-word-answer/trace.json) | Pass | 1,299.0 | 1,071.7 | “Yes.” admitted once and answered; not-heard branch was not exercised. | [Audio](one-word-answer/output.webm) · [Screen](one-word-answer/screenshot.png) |

Latency numbers are provider-buffer proxies, not first-audible measurements. All final screenshots show Listening and fixture revision 0. Only long analysis requires unchanged revision as a hard check.

## Audio and screenshot inspection

All six `output.webm` files were decoded to temporary WAVs for media inspection; retained originals are WebM/Opus. All six screenshots were inspected.

- **Short clarification:** “Okay, I hear you,” followed by a crew-reservation explanation and operational alternatives. A focused final-12-second review heard the ending “tied up during inspection?”; it did not include the canonical final option “Something else?”. The initial whole-recording review suggested a cutoff, but the focused review and approximately 258 ms of trailing silence do not establish a transport truncation. Screenshot: one new canonical answer and Listening.
- **Long analysis:** Receipt and “I'm picking up from those results,” then a completed explanation emphasizing the missing reservation arc and need for confirmation. The spoken summary omitted the canonical sections on timing, guards, rework, and initial marking. These are concrete omissions, not an overall fidelity score. Screenshot: revision 0 and Listening; Markdown table pipes remain visible as inline text in the analysis.
- **Barge-in:** Receipt/progress notices, then “Reserving a crew member would mean you consume a token from dispa-” before the intended interruption. The trace records an aborted paraphrase and equality of pre/post-interruption canonical text. Screenshot retains the full answer and shows Listening.
- **Follow-up while working:** “Okay, I hear you” and “Okay, I'll come back to that next,” followed by model analysis, then the crew explanation. Both substantive recordings end with complete sentences. The final spoken explanation ends with the crew verifying/approving at the end; the on-screen canonical response also contains a subsequent operational question. The trace records an aborted progress request, which need not have become audible. Screenshot shows the final crew response and Listening; the trace, not the final viewport, establishes the two-answer count and FIFO order.
- **Hesitant speech:** Receipt, an explanation explicitly calling reservation an unconfirmed hypothesis, and a complete question about whether the crew must remain unavailable until sign-off. Screenshot shows one full Voice-origin user question, not split half-questions, and one canonical answer.
- **One-word answer:** Receipt/progress notices and a clarification that “Yes” could mean either scenario. The complete final spoken question asks whether the crew is claimed at inspection start and released only after sign-off. Screenshot shows “Yes.”, the clarification, Listening, and no not-heard/error notice.

No domain factual correctness, paraphrase fidelity, naturalness, microphone echo behavior, deployed behavior, or human acceptance is certified by these observations.

## Missing first-canonical-text: reproduced without a provider

The first queued-scenario delivery, `voice-realtime:1:item_EMf2zFyLRVxVXvFD7fqnv:0`, has admission, settlement, TTS request, and TTS audio, but no `first-canonical-text`. The second delivery has that mark. Both canonical answers are retained. The sequence failure was not relaxed or replaced with a synthetic mark.

A local Vite SSR probe loaded the real `RealtimeBrunchBridge` and `selectCanonicalSpeech`, substituting only the session and submission transport. In both cases it submitted a completed transcript, admitted it, registered the reply message, and supplied `onTurnComplete` with a nonempty completed answer. It then compared these public API sequences:

1. `updateChat` observes canonical segments **before** a later update containing settlement: events include `canonical-text-ready → submission-settled → canonical-response-ready`; one paraphrase is requested.
2. Canonical segments and completed settlement first arrive in the **same** `updateChat`: events include `submission-settled → canonical-response-ready`, with **no** `canonical-text-ready`; one paraphrase is still requested.

Assertions checked both event presence/absence and exactly one paraphrase in each case. No providers were called. This reproduces an instrumentation edge case matching the live missing mark; the retained live trace alone does not prove the exact callback interleaving.

Cause in the swept version: `apps/petrinaut-website/src/main/app/voice-interview/realtime-brunch-bridge.ts`. `updateChat` processes `update.settlements` before iterating deliveries for canonical text. `#complete` removed a completed delivery before emitting settlement and requesting speech, so that delivery could disappear before the canonical-text scan. `voice-turn-controller.ts` records `first-canonical-text` only in response to `canonical-text-ready`.

## Owner-authorized instrumentation repair after the sweep

The owner subsequently approved changing the product instrumentation and adding its regression test. `#complete` now emits `canonical-text-ready` for validated, nonempty completed text before removing the delivery and emitting settlement, unless the delivery has already reported text. Existing completion and speech gates remain unchanged.

`realtime-brunch-bridge.test.ts` covers a queued follow-up with text and settlement in the same update, settlement arriving before completion, and text observed earlier. The first two cases failed before the repair; all three check exactly one correctly correlated text event before settlement and exactly one paraphrase. The existing unrelated-text rejection test also verifies that no canonical-text event is fabricated.

Targeted verification: `yarn workspace @apps/petrinaut-website exec vitest run src/main/app/voice-interview/realtime-brunch-bridge.test.ts src/main/app/voice-interview/voice-turn-controller.test.ts`.

The original live traces, recordings, screenshots, and failed verdict remain unchanged. No paid run was repeated after this repair. The separate 26-second audio-delay warning remains unresolved; a new paid verification run requires approval.
