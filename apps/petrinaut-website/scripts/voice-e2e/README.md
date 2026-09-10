# Voice end-to-end harness

`yarn workspace @apps/petrinaut-website voice:e2e` sends synthetic microphone audio through the real Petrinaut → OpenAI Realtime → Flue → Brunch → Realtime paraphrase path. It records operational diagnostics, canonical message wrappers, provider commit identities, remote audio, and the final screen. It does not change product code.

This is **on-demand paid tooling, never CI**. Only `synthesize-utterance.test.ts` and `trace-checks.test.ts` belong in the normal Vitest suite. There is no browser test scheduled by CI.

## Prerequisites

- Node 22.21.1, the repository's Yarn version, installed workspace dependencies, and built website/Brunch dependencies.
- Playwright 1.58.2: `yarn workspace @apps/petrinaut-website exec playwright install chromium`.
- macOS `say`, or WAV fixtures produced on a Mac as described below. The runner does not silently substitute another synthesizer.
- A disposable local Brunch server on `127.0.0.1:4322`, with its provider credentials configured. Do not point the harness at shared or production data.
- Website on `127.0.0.1:4321`, with `PETRINAUT_OPENAI_VOICE_ENABLED=true`, `OPENAI_VOICE_API_KEY`, `BRUNCH_CHAT_ORIGIN=http://127.0.0.1:4322`, and `VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat`.

After building dependencies, start Brunch with `yarn workspace @apps/brunch-agent dev --port 4322`. The bare website config does not proxy `/agents/chat`; use the existing Brunch local config with the website's dev command:

```sh
PETRINAUT_WEBSITE_ROOT="$PWD/apps/petrinaut-website" \
PETRINAUT_OPENAI_VOICE_ENABLED=true \
BRUNCH_CHAT_ORIGIN=http://127.0.0.1:4322 \
VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat \
yarn workspace @apps/petrinaut-website dev \
  --config ../brunch-agent/petrinaut-local.vite.config.ts --port 4321
```

Supply secrets through the environment, never command arguments or committed files. In an orb, use supervised `amp orb service` services rather than background shell jobs.

Before any browser run, verify `/api/voice/config` returns HTTP 200 **and** `available: true`, and Brunch `/health` returns 200. The runner checks both. Keep the `/agents/chat` proxy; a stale `/api/chat` endpoint can look connected while never admitting a Brunch turn.

## Run

Get owner approval before setting the flag. The current experiment has a **$5 aggregate ceiling**, including probes and retries. A six-scenario sweep is estimated at $0.30–0.50, not a price guarantee. The runner does not receive billing data and cannot enforce a dollar cap: track actual provider spend externally and stop before the remaining budget is exhausted. Never infer dollars from recording duration.

```sh
# All six scenarios; no automatic retries.
VOICE_E2E_APPROVED=true yarn workspace @apps/petrinaut-website voice:e2e

# One scenario after checking the remaining budget.
VOICE_E2E_APPROVED=true VOICE_E2E_ONLY=barge-in \
  yarn workspace @apps/petrinaut-website voice:e2e
```

`VOICE_E2E_WEBSITE_URL` changes the local website URL; `BRUNCH_CHAT_ORIGIN` changes the local health-check origin. `VOICE_E2E_OUT` overrides the evidence root. Non-loopback origins and any set `CI` variable are refused. Exit 1 means a failed check or an operational/preflight failure; latency warnings alone do not fail the run.

Each scenario uses a fresh browser context and prepared `crew-reservation-v1` fixture. The driver dismisses the tour, opens the assistant and Voice consent, clicks the visible checkbox label, verifies its checked state, and starts Voice. It waits up to 150 seconds for settlement, terminal paraphrase diagnostics and Listening. A separate watchdog closes the browser even if collection stalls. Closing the browser does not prove that already-admitted Brunch work was cancelled.

### Prepare macOS WAVs for another machine

This mode uses only local `say`; it neither opens a browser nor contacts a provider:

```sh
yarn workspace @apps/petrinaut-website voice:e2e --prepare-fixtures /tmp/voice-fixtures
```

Transfer the resulting seven files to the execution machine, then run:

```sh
VOICE_E2E_INPUT_DIR=/path/to/voice-fixtures VOICE_E2E_APPROVED=true \
  yarn workspace @apps/petrinaut-website voice:e2e
```

Required names: `short-clarification.wav`, `long-analysis.wav`, `barge-in.wav`, `follow-up-while-working.wav`, `follow-up-while-working-follow-up.wav`, `hesitant-speech.wav`, and `one-word-answer.wav`. Their spoken content must match `scenarios.json`, including the two `[[slnc 800]]` pauses. Existing raw `say` files are also accepted: the driver normalizes trailing digital silence itself.

The capture file is 16-bit PCM, 48 kHz, mono, with eight seconds of leading silence, five seconds between the follow-up scenario's utterances, and three seconds after the last utterance. Interior hesitation pauses are preserved. All inputs are validated before the first paid connection. The driver refuses a connection that consumes the leading silence, rather than interpreting a truncated question as a product failure.

## Artifacts

Default location, relative to the repository:

```text
libs/@hashintel/brunch-agent/docs/evidence/evaluations/voice-e2e/
  <UTC-date>/<UTC-time>/<scenario>/
    utterance.wav
    trace.json
    output.webm
    screenshot.png
```

The timestamp separates reruns instead of overwriting evidence. `trace.json` contains the scenario, browser/Node versions, observed trace and pass/warn/fail results. The same table is printed to stdout. `output.webm` is **WebM/Opus, not WAV**; no transcoder is used. `ffprobe -v error -show_streams output.webm` is an optional inspection command. Listen in a WebM-capable player or browser, inspect the screenshot and compare against the canonical text; record only what was observed.

Failures retain partial evidence and produce failing checks. An empty `output.webm` means there was no usable recording, not successful silence. Browser launch/preflight failures cannot produce a screenshot. Commit code and actual sweep evidence separately. Transcripts and recordings are deliberately retained; raw provider messages, SDP, credentials and general console/network logs are not.

## Checks

| Check                        | Failure means                                                                                  | Layer          |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| `run`                        | Timeout, connection/setup or evidence-capture failure                                          | voice          |
| `commits`                    | Wrong number of distinct provider commit IDs, including a split hesitant question              | asr            |
| `sequence`                   | Missing or miscorrelated input/admission/text/settlement/TTS, or speech requested too early    | voice / brunch |
| `input-transcript`           | Expected phrases absent from their own ordered Voice-origin user messages                      | asr            |
| `admission-or-not-heard`     | “Yes.” neither admitted nor explicitly reported as not heard                                   | asr / voice    |
| `no-autonomous-output`       | A speech diagnostic lacks a recognized application speech kind                                 | voice          |
| `diagnostics`                | At least one Voice operation reports failure                                                   | voice          |
| `canonical-bubbles`          | Not exactly one new nonempty assistant message wrapper per admitted turn                       | brunch / voice |
| `paraphrase`                 | No successful final paraphrase, or no aborted final paraphrase for barge-in                    | voice          |
| `interrupted`                | No recorded Your turn action/aborted paraphrase, or canonical text changed after interruption  | voice          |
| `queued-order`               | Follow-up not queued while the first turn was working, or admissions differ from capture order | voice / brunch |
| `fixture-revision`           | Long-analysis fixture revision missing or changed                                              | brunch         |
| `final-phase`                | Final phase is not Listening                                                                   | voice          |
| `output-audio`               | Recording missing, empty or shorter than one second                                            | voice          |
| `latency-ack`, `latency-tts` | **Warn only:** provider-buffer proxy exceeds budget or is unavailable                          | voice          |

The explicit not-heard outcome for “Yes.” permits no canonical answer or speech and warns about unavailable transcript/audio. It never exempts a partially admitted turn from completion checks. A queued follow-up may supersede the first turn's speech; both answers must still settle, and any TTS must follow its own settlement. The final turn still requires speech.

Latency budgets remain warn-only until three baseline sweeps have been reviewed. A missing required mark still fails `sequence`. A diagnostic kind check cannot prove the absence of output that bypasses diagnostics, and recording duration cannot prove audible speech.

### Observed selectors and signals

- Roles/text: `Skip tour`, `Show AI assistant`, `Start voice mode`, the consent label, `Start voice`, and `Your turn`. Clicking the styled consent label avoids its native input being covered by that label.
- Assistant scope: complementary role named `AI assistant`; final phase: its first `[data-phase]`.
- Canonical wrappers: existing `[data-testid="ai-transcript"] > [data-role="assistant"]`; initial fixture messages are excluded by baseline count. The wrapper includes any visible reasoning/tool controls, not just final Markdown.
- Input: the same transcript's `[data-role="user"][data-voice-origin="true"]`, with the existing `voice-input-provenance` chip removed from a detached copy before reading text.
- Not-heard: existing `[data-voice-notice]` containing `We didn't catch that. Please try again.`.
- Revision: complementary role named `Prepared fixture status`, parsing `Settled bundle revision N;` before and after the turn.
- Diagnostics: only the `[Petrinaut voice]` JSON line and allowlisted scalar fields.
- Measures: original `voice-interview:*` durations and correlation IDs, plus synchronous observation order/time. `user-speech-ended` is input speech end; `speech-ended` is **output** playback end.
- Approved harness-only WebRTC observer: retains distinct `input_audio_buffer.committed` item IDs and receipt times, not the messages. The peer-constructor observer leaves application `ontrack` and event listeners intact and records a remote audio track even when `event.streams` is empty.

## Not proven

Naturalness, paraphrase fidelity, first-audible latency, microphone echo handling, human acceptance, deployed behavior, and actual dollar cost are not established by these checks. Synthetic audio bypasses real microphones. The audio recording contains remote output, not a synchronized microphone mix. A passing unchanged-revision check covers the selected fixture bundle, not every possible application side effect.

## Known setup traps

- Without trailing silence, semantic VAD may never commit. `%noloop` is required to avoid repeated inputs.
- Do not use `speech-ended` as user input end or compare relative durations across different turn IDs.
- The follow-up starts five seconds after the first utterance ends. If Brunch has already finished, the queue check correctly fails; do not fabricate a `queued` mark.
- If a short paraphrase ends before the three-second interruption point, barge-in fails rather than clicking during unrelated speech.
- Use Node 22 for Playwright installation. In this orb, Node 26 stalled after download; the Node 22 installation completed.
- Existing website typecheck/lint configs exclude `scripts/`. Check the harness separately with strict TypeScript and focused Oxlint as well as the requested workspace gates. No config scope was widened for the paid runner.

## First sweep status

**Pending macOS-generated WAV fixtures.** No paid sweep or listening observations have been recorded, and no scenario is claimed to pass live.

Provider-free verification covered the two pure test files, real-page navigation through consent, a blocked Realtime connection producing failing trace/audio/screenshot artifacts, and a WebRTC loopback recording with an unassociated audio track. The latter produced WebM/Opus and preserved the application's `ontrack` listener; it is not evidence of a successful provider turn. The website build, unit tests, typecheck and lint passed; lint retained one warning in unchanged product code.

Implementation choices beyond the sample plan: macOS fixture import/export; strict PCM/chunk validation and temporary-file cleanup; normalized leading/inter-turn/trailing silence; a long first prompt for the queued-turn scenario; synchronous measure observation for cross-turn ordering; the approved commit-ID observer; constructor-based recording instead of replacing `ontrack`; observed tour/label navigation; fixture-message baselines; correlation-specific checks and the explicit not-heard branch; timestamped evidence; partial failure artifacts; local-origin, CI and availability guards; and bounded runs without automatic retries.
