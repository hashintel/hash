# Queued follow-up verification after instrumentation repair

**Result: 12 checks pass, one latency warning, no failures; runner exit 0.** Both turns report correlated canonical text before settlement. This verifies the selected live sequence after the local instrumentation repair, not fidelity, naturalness, deployed behavior, or human acceptance.

## Execution and artifacts

- One owner-approved `follow-up-while-working` run, no retries. The owner confirmed at least $1 remained within the original $5 aggregate budget. Actual provider spend is not captured or verified, and the harness cannot enforce a dollar cap.
- Started 2026-09-10 at 21:31:37.860 UTC, on `ka/fe-1656-voice-e2e-harness` with the uncommitted instrumentation repair and regression tests. The original failed sweep is unchanged.
- Root `.env.local` supplied only `ANTHROPIC_API_KEY` to Brunch and `OPENAI_VOICE_API_KEY` to the website. No credentials are retained in these artifacts; the trace passed an environment-value scan.
- Isolated local website `127.0.0.1:4341` and Brunch `127.0.0.1:4342`, fresh disposable SQLite database, `claude-haiku-4-5`, unchanged Realtime policy, and the existing `/agents/chat` proxy. Both health checks passed before the browser run. Services stopped afterward; neither port remained listening.
- Node 22.21.1, Chrome 145.0.7632.6, existing macOS `say` fixtures. No product or harness behavior changed for this run.

Retained evidence: [trace and checks](follow-up-while-working/trace.json), [microphone input](follow-up-while-working/utterance.wav), [remote output](follow-up-while-working/output.webm), and [final screen](follow-up-while-working/screenshot.png). Replaying `checkTrace(scenario, trace)` exactly reproduced the retained verdict. Audio and screenshot were separately inspected.

```sh
VOICE_E2E_APPROVED=true \
VOICE_E2E_ONLY=follow-up-while-working \
VOICE_E2E_INPUT_DIR=/tmp/hash-voice-e2e-fixtures \
VOICE_E2E_WEBSITE_URL=http://127.0.0.1:4341 \
BRUNCH_CHAT_ORIGIN=http://127.0.0.1:4342 \
yarn workspace @apps/petrinaut-website voice:e2e
```

## Sequence and timing

Two distinct provider commits produced two capture-ordered admissions and two canonical answers. The follow-up was queued while the first turn was admitted but unsettled. Both answers include `first-canonical-text` before their own settlement and TTS. No failed Voice operation was reported; the final phase is Listening and fixture revision is 0.

| Timing proxy | First turn | Follow-up |
| --- | --- | --- |
| Speech end → acknowledgement audio | 1,534.7 ms | 1,186.9 ms |
| Settlement → TTS request | 0.3 ms | 27,779.0 ms |
| TTS request → audio | 1,041.0 ms | 844.4 ms |
| Settlement → audio | 1,041.3 ms | **28,623.4 ms (warning)** |

These are provider-buffer proxies, not synchronized first-audible measurements. The follow-up warning is predominantly before the second TTS request, not provider startup after that request. The first paraphrase's 39,877.4 ms diagnostic duration ends approximately when the second request starts; audio inspection hears the first answer continuing during that wait. This is consistent with the existing serialized speech queue, not evidence of 28.6 seconds of silence or a slow second Brunch response. No queue policy or latency threshold was changed.

## Media observations and remaining limits

- The approximately 123-second remote recording contains “Okay, I hear you,” an interrupted “I'm picking up…” progress notice, and the complete queued notice “Okay, I'll come back to that next.” The trace reports the progress request as aborted; this is distinct from either final answer failing.
- The first substantive answer is audible at approximately 00:46–01:26 and ends with the crew's operational intent needing confirmation. It discusses the absent reservation arc, unconfirmed intent and missing downstream dispatch. Detailed timing, concurrency and failure/rework discussion from the canonical answer is omitted or abbreviated.
- The second answer is audible at approximately 01:27–02:01, defines reservation and contrasts it with keeping the crew available. It ends with a complete statement contrasting a single crew token/idle crew with independent inspection. It does **not** speak the canonical closing question: “Does your actual operation need the crew locked in during inspection, or is inspection independent of crew availability?” The retained trace does not establish whether this sentence had a valid question marker, so this observation alone does not identify which layer omitted it.
- The inspected screenshot shows Listening, fixture revision 0, and the canonical crew explanation including that closing question. No error or duplicate Voice answer is visible. The panel is scrolled into the final answer; the two-answer count comes from the trace, not the final viewport.

The missing instrumentation mark is no longer reproduced in this run. The latency warning and spoken-content omissions remain. Further paid trials, product changes, publication and mission acceptance require their own authorization; this run does not close those gates.

## Offline investigation of the omitted question

The owner then approved investigating the missing closing question without another paid run. **The first observed gap is Brunch not emitting question metadata, rather than transport losing the question text.** This investigation changed no product behavior.

Read-only inspection of the stopped runtime's SQLite database covered all 81 unchunked stream batches and 1,698 records. The final response, `entry_01M26KSFSQ0491XA6WCBJRPV25`, reconstructs from 184 consecutive text deltas matching its completion count and contains the exact closing question. Both resource snapshots register `brunch_mark_question`. The entire conversation contains only one tool call, `getLatestNetDefinition`: no question-marker call and no data record. The database fingerprint and content-only extraction are retained in [the derived investigation evidence](question-marker-investigation.json); private reasoning and raw database contents are not copied there.

The source contract in core `src/prompts/SYSTEM.md` asks Brunch to call `brunch_mark_question` immediately before including a direct question verbatim. The tool writes `brunch-question` data. The live and history transports preserve that data separately from the hidden tool call. Website `selectCanonicalSpeech` accepts a question marker only when its text occurs in finalized assistant text from the same message; it does not guess questions from punctuation. `speakParaphrase` sends all canonical text as `source_text`, and includes `question_text` only when that selection exists. Its exact-append instruction is conditional on `question_text` being present.

A provider-free replay loaded the real selector and `OpenAIRealtimeSession` through Vite SSR, with fake media, SDP and data-channel dependencies and real network fetch forbidden. Assertions established:

1. The reconstructed saved answer yields one unchanged source segment, no `questionSegment`, and no `question_text` in the generated speech request. The closing question remains present in `source_text`.
2. Adding a valid synthetic marker to a separate copy yields the exact closing question in `question_text`, with identical source text and speech instructions. Neither the original trace nor saved response was amended.

The reconstructed payload is **not** a captured live Realtime request. It establishes the current deterministic downstream behavior for this saved input; it does not prove why the model omitted the unmarked question or that adding a marker would guarantee audible fidelity. The live recording establishes the omission. The saved tool/data records locate the missing marker upstream of transport, but do not reveal why Brunch skipped it. The closing sentence quotes what “the fixture asks”; whether that framing contributed to marker omission is unproven.

Existing selector, session and bridge tests also passed: **82 tests across three files**, using `yarn workspace @apps/petrinaut-website exec vitest run src/main/app/voice-interview/canonical-speech.test.ts src/main/app/voice-interview/openai-realtime-session.test.ts src/main/app/voice-interview/realtime-brunch-bridge.test.ts`. These tests and the positive control verify plumbing, not model compliance. A producer-side question-metadata repair is the next candidate; no prompt rewrite, punctuation-based fallback, new response architecture, or automatic paid retry was introduced.

## Owner-authorized producer instruction repair

The owner subsequently authorized addressing missing question metadata at the producer. The bounded repair changes only the fixed Voice-delivery instructions in `apps/brunch-agent/src/agents/chat-agent/agent.ts`: explicitly call `brunch_mark_question` before presenting a direct question, reproduce it verbatim, and treat source attribution or repetition as no exemption when asking the person to answer. Quoted discussion, rhetorical questions and headings remain unmarked. The instructions explain that missing metadata can cause spoken omission. Typed delivery, core/SDCPN prompts, marker schemas, browser selection, speech policy and queue behavior are unchanged.

The real Flue/faux-provider test in `apps/brunch-agent/test/voice-context.test.ts` first failed because the new instruction was absent, then passed after the repair. It captures the actual producer prompt for initial Voice input, a tool continuation and a follow-up; all three receive the same fixed guidance. Typed inputs before and after Voice and an unknown response mode retain the same baseline prompt, and untrusted context text is not interpolated. This is a prompt-delivery regression test, not a simulated claim that the model obeys the instruction.

Verification: `yarn exec turbo run build test:unit lint:tsc lint:eslint --filter @apps/brunch-agent --force --output-logs errors-only` passed all 36 tasks, including **205 Brunch tests across 27 files**. Lint has zero errors and 14 warnings in unchanged files. Changed-source formatting and `git diff --check` pass. An initial lint failure in the new test's conditional assertions was corrected before this successful full run.

No paid run followed this repair. The earlier live omission and derived offline replay remain unchanged historical evidence. The fix is a prompt-level candidate: live marker production and exact spoken question delivery still require a separately approved provider check. No deterministic enforcement, inferred marker, or new response architecture was added.
