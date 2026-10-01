---
layer: website
role: Demo site and embed host for the Petrinaut editor
---

# Petrinaut Website

A website for demoing Petrinaut (libs/@hashintel/petrinaut).

A SPA with API functions for AI assistance, voice initialization, and JSON
oEmbed discovery.

## Quickstart

Run these commands from the repository root after installing the toolchains and dependencies in the [root setup guide](../../README.md#setup). On Windows, use Git Bash as described there.

```sh
cp apps/petrinaut-website/.env.example apps/petrinaut-website/.env.local
# Add OPENAI_API_KEY to apps/petrinaut-website/.env.local to use chat.

turbo run dev --filter=@apps/petrinaut-website
```

The dev server runs at [http://localhost:5173](http://localhost:5173). A plugin in `vite.config.ts` loads the API functions.

In production, the functions in the `api` folder are automatically deployed as
Vercel Functions.

## Petricon

`/petricon` is the interactive icon collection. Browse the symbols, adjust their
weight and timing, compare states, and copy React examples. Modeling studies offer
three alternatives each for equations, parameters, variables, token types, and
subnets, with action and progressive drawing playback. The inspector supports
drawing order and manual progress. Math, code, and AI studies offer paired
alternatives. The page uses the same Petricon
renderer as the editor.

## Starting a new net

`/new` creates an empty net in local storage and redirects to the editable demo,
which opens the most recently modified net. The redirect replaces, so a reload
cannot make a second net and Back skips the route. Empty nets earlier visits
left behind are dropped, matching the editor's own rule when a visitor switches
away from an untouched net.

The editor chooses the initial document after saved nets load. Open tabs refresh
their saved nets and stock-assistant messages when local storage changes, and
updates start from the latest persisted value so another tab's documents survive.

## Choosing the assistant

Petrinaut's stock assistant is the AI panel fallback. Under **User settings → Labs**, **Use Brunch** selects the Brunch assistant and automatically enables **Voice**. You can turn **Enable Voice** off manually; that choice survives reload until you select Brunch again. Voice defaults on for an already selected Brunch assistant unless explicitly disabled. The assistant choice is stored under `petrinaut-website:assistant`; the separate Voice choice is stored under `petrinaut-website:voice-enabled`. These preferences belong to the website host, not Petrinaut.

When Voice is enabled for Brunch, Labs also shows **Realtime mode**, off by default. Leave it off to use Live; turn it on to use Realtime. This choice is saved under `petrinaut-website:realtime-enabled` and applies to the next Voice session. Changing it does not interrupt active audio: end Voice and start it again to switch providers.

A Brunch-focused deployment or test launch may set `VITE_PETRINAUT_DEFAULT_ASSISTANT=brunch`; explicit browser-local assistant choices remain authoritative, so changing the launch fallback does not migrate existing users. With `VITE_BRUNCH_CHAT_ENDPOINT` configured, the command palette (⌘K) continues to offer **Use Brunch** and, once switched, **Use the stock Petrinaut assistant**. With the stock assistant selected, the panel talks to `/api/chat` with the stock tool surface, keeps its messages in the local store, and creates no Flue client, mounts no Brunch tools and shows no Workpiece pane or Voice; Brunch's conversation lives in Flue history and is untouched. Switching back restores it. Without a configured endpoint, the Labs control remains visible but disabled, the stock assistant is the only one, and no command is offered.

Voice is available only when Brunch is selected, the browser-local Voice preference is enabled, and the existing server capability check reports Voice available. Enabling the preference does not start microphone capture or a provider session.

## Example embeds and oEmbed

Canonical example pages live below `/examples`. The JSON oEmbed endpoint at
`/api/oembed` accepts their production URLs and returns an
`/embed/examples/...` iframe. Canonical pages send both CSP `frame-ancestors
'none'` and `X-Frame-Options: DENY`; only the dedicated embed routes permit
third-party framing. Every page also sends `upgrade-insecure-requests`: the deployed Brunch agent runs behind a proxy,
sees plain HTTP and returns `http://` stream URLs, which an HTTPS page would otherwise block as mixed
content. The returned iframe is sandboxed with
`allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox`
and does not send a referrer. The popup permissions are what let the preview's
**Full view** link open the model in a new tab: a sandbox without them drops
the navigation, and without `allow-popups-to-escape-sandbox` the full page
would inherit the embed's sandbox.

Because this is a client-rendered SPA, a static `index.html` discovery link
cannot include the current example URL. `FullExamplePage` adds the standard
`application/json+oembed` link to the document head after the route mounts.
Consumers that do not execute JavaScript must call `/api/oembed` directly or
use provider-pattern discovery instead.

### Optimization demo

The demo at [http://localhost:5173](http://localhost:5173) runs the optimizer
in the browser: the Optuna study runs in a Pyodide web worker and each
optimization step runs on Petrinaut's own experiments backend, so no Python
service is involved. A sweep's Parameters card in the Experiments tab offers
**Optimize**. The first optimization in a browser downloads the Python runtime
from jsDelivr and Optuna from PyPI; later runs use the browser cache.

## Environment variables

| Name                                | Required         | Used by          | Notes                                                                                                            |
| ----------------------------------- | ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                    | for chat to work | `api/chat.ts`    | OpenAI key the function uses to call `streamText`.                                                               |
| `OPENAI_VOICE_API_KEY`              | for voice        | voice API        | Dedicated OpenAI key used to create Voice WebRTC sessions.                                                       |
| `PETRINAUT_OPENAI_VOICE_ENABLED`    | no               | voice API        | Set to `true` to enable voice, including in production.                                                          |
| `PETRINAUT_VOICE_PROVIDER`          | no               | voice API        | `realtime` or `live`; see [provider defaults](#voice-provider-defaults). Invalid values disable Voice discovery. |
| `TYPESAFE_API_KEY`                  | for judgment     | voice API        | Server-only TypeSafe key for Live utterance experiments.                                                         |
| `PETRINAUT_LIVE_UTTERANCE_JUDGMENT` | no               | voice API        | `log` observes; `enforce` gates and drops withheld speech. Local development only; others are off.               |
| `PETRINAUT_AI_MODEL`                | no               | `api/chat.ts`    | Overrides the model id; the default is `petrinautAiModel` in `@hashintel/petrinaut-core`.                        |
| `PETRINAUT_AI_REASONING_EFFORT`     | no               | `api/chat.ts`    | Overrides the reasoning effort; the default is `petrinautAiModel.reasoningEffort`.                               |
| `VITE_BRUNCH_CHAT_ENDPOINT`         | for Brunch       | website          | Base URL of the mounted Brunch Flue route.                                                                       |
| `VITE_PETRINAUT_DEFAULT_ASSISTANT`  | no               | website          | Build/start fallback: `stock` (default) or `brunch`; explicit stored choices still win.                          |
| `SENTRY_DSN`                        | no               | `vite.config.ts` | Wired into the bundle via `__SENTRY_DSN__` at build time.                                                        |

Local values live in `.env.local`; Vite's `loadEnv` (see [`vite.config.ts`](vite.config.ts)) copies them into `process.env` for both the dev server and the API functions. In production, set these in the Vercel project settings.

### Voice provider defaults

The website defaults to Live in every environment. **Realtime mode** in Labs
selects Realtime for this browser. `PETRINAUT_VOICE_PROVIDER` remains the
discovery default for clients without a provider picker; it does not override
the website's Labs choice or restrict either provider's session endpoint.
An invalid value still disables Voice discovery. Both providers require
`PETRINAUT_OPENAI_VOICE_ENABLED=true` and a dedicated `OPENAI_VOICE_API_KEY`;
sessions are billed to that key.

### Experimental Brunch-backed Live interview (FE-1664)

With **Realtime mode** off, Live uses GPT-Live-1 for conversational audio while a
separate `gpt-4o-transcribe` session supplies finalized user text to Brunch.
Brunch remains the canonical conversation, domain and tool authority. Settled
Brunch prose is offered to Live as delegation-correlated commentary; Live has no
tools and must not answer domain questions independently. These instructions are
best effort, not an enforced speech boundary.

Each admitted Live turn includes the complete finalized transcript and optional
verbatim brief excerpts. Missing-field placeholders are not submitted as facts
or unresolved questions. Brunch interprets short replies and instructions in the
existing conversation; the extractor does not resolve their meaning. Finalized
words are saved in Brunch history, while spoken captions remain browser-local.

From the repository root, with `OPENAI_VOICE_API_KEY` already exported (or in
this worktree's `apps/petrinaut-website/.env.local`):

```sh
# Initial local preparation, without inference:
turbo run build --filter '@apps/brunch-agent^...' --filter '@apps/petrinaut-website^...'
yarn workspace @apps/petrinaut-website codegen
yarn workspace @apps/petrinaut-website examples:generate

# Live input and answers use the existing Brunch route.
PETRINAUT_OPENAI_VOICE_ENABLED=true PETRINAUT_VOICE_PROVIDER=live yarn dev:brunch
```

Open [http://localhost:4915/new](http://localhost:4915/new), dismiss the tour if shown, open the AI panel,
and select the waveform **Start voice mode** action in the empty composer.
Read the audio-processing and text-retention disclosure, acknowledge how voice
data is handled, then choose **Start voice**. **Cancel** returns to text without starting a session.
Only that last action requests microphone access and a billable Live session.
Use headphones for the first trial. HTTPS or localhost and an OpenAI project
with GPT-Live-1 access are required.

Once connected, the Voice dock replaces the composer. It shows **Thinking** while
a Brunch request is submitted or streaming, **Speaking** during active playback,
and **Listening** when both are idle. Connection and error states take precedence.
Thinking is a local work indicator, not a spoken progress update.
The consent panel uses a plain voice-permission heading. Local WebRTC audio levels
drive the microphone ribbon and Speaking indicator; Listening means the session
is open for input, including while output is active. These are activity indicators,
not authoritative turn boundaries or proof of heard playback. Browsers without
audio-level telemetry omit the animated input level; Brunch work still shows Thinking.
There is no separate experiment panel, replay menu, or microphone toggle.
Connection errors return to setup; starting again requires fresh consent.
Brief WebRTC interruptions show **Connecting** while the existing session has up
to the connection timeout (15 seconds by default) to recover. Media stays open;
no new session is created and no input is replayed. End still stops both directions
immediately. A failed connection or an expired recovery deadline ends the session.

**End voice mode**, **Cancel** during setup, closing the panel, switching to text,
changing conversation, and leaving the page stop both Voice transports and local
capture. Starting again creates fresh Live and transcription sessions; there is
no resume, replay, automatic retry, or input resubmission.

To return to the **unchanged integrated Realtime path**, Exit, stop the panel
dev command with Ctrl-C, configure the existing local Brunch environment, and run:

```sh
PETRINAUT_OPENAI_VOICE_ENABLED=true PETRINAUT_VOICE_PROVIDER=realtime yarn dev:brunch
```

Reload the page before starting a new session. Unsetting
`PETRINAUT_VOICE_PROVIDER` also selects Realtime locally (Vercel previews
default to Live; see [provider defaults](#voice-provider-defaults)). Provider/config selection is
pinned for the mounted conversation; there is no provider switching or input
resubmission mid-session. The launcher sets the existing `/agents/chat` route;
the ordinary website launcher still needs `VITE_BRUNCH_CHAT_ENDPOINT` configured
to expose Voice. Export variables to the launcher directly or use `.env.local`;
the website's generic Turbo `dev` task does not forward arbitrary shell variables.

#### Manual test — 10–15 minutes

1. Explain a familiar process and answer one Brunch follow-up.
2. Hesitate, elaborate, and correct a consequential detail. Confirm each retained
   finalized utterance appears once in canonical history and later questions use
   the correction.
3. Request one available model operation. Compare the spoken result with settled
   Brunch text and inspect the actual workpiece/model effect.
4. Speak while Live responds and interrupt it acoustically. Record lost input,
   overlap, unsupported acknowledgements, independent questions, or unsupported
   completion claims separately from canonical Brunch behavior.
5. End Voice mode and confirm microphone capture and speaker playback stop.

Use headphones while the known phantom-input risk is investigated. Server VAD can
split hesitation into multiple finalized items, and the existing one-waiting-input
policy may not retain all of them. See [MISSION.md](MISSION.md) for the current
acceptance limits and manual proof obligations.
The existing unauthenticated Voice endpoint risk below also applies to Live;
do not expose this local experiment publicly without addressing that boundary.

Two kinds of finalized transcript never reach Brunch. A transcript with no
letters or digits, such as ".", is handled like empty input. A transcript of
up to three words whose speech started while Live was audible, or within half a
second after, is dropped: these are almost always Live's own audio leaking back
and misheard as speech. Live isn't audible while the speaker is muted or at
zero volume. A GPT-Live delegation doesn't exempt the transcript, because
GPT-Live can delegate its own echo. A real interruption of three words or fewer
still stops Live, but its words don't reach Brunch. Neither case shows a
notice.

Each GPT-Live delegation goes to the latest finalized transcript still without
one, or waits for speech that the transcription session already reports as
started. Live and transcription use independent sessions, so a delegation that
arrives while neither condition is visible has unknown ordering: it is deferred,
never attached to later speech, and closed only by Stop, a Brunch error or the
end of Voice mode. A delegation observed while transcription speech is pending
is closed if that speech is later filtered, instead of shifting to the next
answer. `delegation.deferred` and `delegation.closed` record these outcomes
with only the delegation ID and a fixed reason.

#### Speaker echo check — 10 minutes

The transcription session requests English, far-field noise reduction and
per-token log probabilities. None of these removes Live's own voice from the
microphone; only the browser's echo cancellation can. To see whether that voice
gets through, open DevTools, enable the **Verbose** console level and filter by
`[Petrinaut Live trace]`:

- `capture.settings` shows the echo cancellation, noise suppression and
  automatic gain control the browser applied, at start and after a microphone
  switch.
- `echo.output` follows each stretch of audible Live output plus a one-second
  tail. It reports the peak microphone level, the browser's mean echo return
  loss and mean echo return loss enhancement in dB, each when reported
  (`echoReturnLossSamples` and `echoReturnLossEnhancementSamples` count them),
  transcription speech starts, and GPT-Live input transcript fragments that
  began after its output did. `liveOutputFragments` shows whether output
  transcripts arrived; without them `liveInputFragments` stays at zero.
- `input.finalized` marks speech that started during output with
  `startedDuringOutput`. `sinceOutputMs`, present when Live was audible in the
  second before, is the time from its last audible moment until the speech
  start was reported. Below about 100 means Live was still audible; from 500,
  the speech doesn't count as started during output. The window is measured
  from when `speech_started` arrives, because its `audio_start_ms` is on the
  audio stream's clock rather than the page clock the output stretches use. The same line records the
  transcription's confidence from its per-token log probabilities:
  `logprobTokens`, and when any were returned, `meanLogprob` and `minLogprob`.
  `peakMicrophoneLevel` is the loudest microphone sample from a second before
  the speech start was reported until the speech stopped. Nothing is dropped on
  confidence or loudness yet. `overlappedOutput` is true when the speech, from
  its reported start until it stopped, met audible output or the second after
  it.
- `input.ignored` with `reason: "short-during-output"` marks a short transcript
  that started during output and was not sent to Brunch.
- `filter.shadow` with `stage: "echo"` marks a transcript the echo check would
  skip. The check runs in shadow, so the transcript is still handled as before
  and can also appear as `input.ignored`. It compares speech that overlapped
  output, in memory only, with Live's output transcript from three seconds
  before the speech started until it stopped. Six or more words count as a
  repeat when they mostly match Live's words in order; fewer count only when
  they appear together, in order, in Live's words.
- `filter.shadow` with `stage: "doubtful-short-during-output"` tries a narrower
  three-word rule: short speech during output counts only when its least
  likely token has a log probability below -1.9 (`minLogprob`) or it repeats
  Live's words as the echo check defines them. The three-word rule still
  decides. An `input.ignored` line with `reason: "short-during-output"` and no
  `filter.shadow` line from this stage is speech the narrower rule would have
  sent to Brunch.

On laptop speakers, on a speaker chosen in the audio settings, and on
headphones, answer three Brunch questions and stay silent while Live speaks
each reply. Any speech start, input fragment or `startedDuringOutput: true`
during a reply means echo reached the microphone path; also note whether Live
stops itself mid-sentence. Then interrupt a reply once with a sentence of your
own and once with a short answer such as "Yes". Each `filter.shadow` line
should match a phantom in the conversation, and the interruptions should
usually get none. After any `delegation.deferred` line, note whether Live
speaks without a Brunch reply: what GPT-Live does with a delegation left open
is not yet known. The traces are local development diagnostics and contain no
audio or text.

#### Noise check — 5 minutes

The transcriber can turn a non-speech sound into a word, such as "Okay." or
"Certainly.", while Live is silent. To see whether confidence or loudness tells
those apart from real speech, wait until Live is silent, then make a few
non-speech sounds (a cough, typing, a chair creak, a desk tap) and give a few
short answers such as "Yes" and "Seven". Match each `input.finalized` line to
the conversation by order, then compare `meanLogprob`, `minLogprob` and
`peakMicrophoneLevel` between the invented words and the real answers.

#### Log-only utterance judgment (FE-1771)

With `TYPESAFE_API_KEY` set, start the local experiment:

```sh
PETRINAUT_OPENAI_VOICE_ENABLED=true PETRINAUT_VOICE_PROVIDER=live PETRINAUT_LIVE_UTTERANCE_JUDGMENT=log yarn dev:brunch
```

After the existing duplicate, empty, oversize and admission checks, each eligible
finalized transcript gets one System One request through the same-origin
`/api/voice/utterance-judgment` endpoint. Judgment runs alongside Brunch submission:
it neither delays admission, rewrites text nor drops another utterance while
waiting. The last successfully offered Brunch prose is context, not proof of
audio playback. Both text fields are sent to TypeSafe; neither is logged.

Local `[Petrinaut Live trace]` records include one `judgment.result` per request
with `contribution`, `confidence`, `latencyMs`, a provisional `decision` at the
0.8 threshold, and `applied: "submit"`. Failures have null contribution/confidence.
The log-only browser measurement window is 10 seconds, with a 12-second server
safety bound. This longer window measures results missed by the initial
one-second cutoff; it is not an enforcement deadline and never delays submission.
Report the successful-judgment p50 and counts completing within 500 ms, 1 second,
and 2 seconds separately from failures/timeouts, which are not successful latency
samples. Log mode runs only in local development (`NODE_ENV=development`,
no `VERCEL_ENV`), where its diagnostics are recorded.
This endpoint inherits the unauthenticated Voice boundary; origin checks are
not authentication. Do not enable it on a public deployment.

Acceptance requires a real log-only support-desk run: opening modelling request,
"okay", a staffing range, Brunch's question repeated back, and "hang on". Retain
the five metadata-only triples and latency p50, verify one unchanged submission
per eligible utterance, and check `JSON.stringify(trace)` contains none of the
spoken or offered text. Synthetic fixtures and a working endpoint do not prove
classification quality or real latency. Log mode never enforces its decisions.

#### Local utterance gating (FE-1779)

The owner-approved local trial uses `PETRINAUT_LIVE_UTTERANCE_JUDGMENT=enforce`
with the same server-side keys and Live enablement as above. Start with
`NODE_ENV=development`; `VERCEL_ENV` must be unset. Preview/production enforcement
is disabled. This is not authentication: keep the dev server private.

Each eligible finalized transcript is judged once with the latest finalized
Brunch turn and last successfully offered Brunch prose as context. All three
text fields go to TypeSafe, never to diagnostic traces. A short confirmation
can be interview content; mixed content and requests to send information to
Brunch take priority over incidental speech.

Submit the original transcript for interview content, confidence below 0.8,
failure, or a one-second deadline expiry. Other contributions at confidence
0.8 or higher are withheld. Live voice remains independent. The deadline bounds
classification wait, not composer/admission wait; eligible submissions queue
in transcript order while the composer is busy.

Stopping a response cancels pending gated work; a fresh voice turn can still
submit. Brunch entering an error state does the same: inputs still awaiting
judgment, and inputs already cleared but waiting for the composer, are
discarded without retry. Each discarded input gets an `input.dropped` trace
with `reason` (`stopped`, `error`, or `ended` when voice ends) and the gate
`decision` it had reached (`pending` or `submit`), metadata only.

Withholding is silent: there is no **Not sent to Brunch** list or **Send to
Brunch** button. **A wrongly held answer cannot be recovered through the UI.**
Ending voice clears session-local state and cancels pending work. No automatic
retry or replay occurs after reconnect. Check canonical history if admission is
unconfirmed.

Transcripts skipped by the empty or short-during-output checks are never
judged. GPT-Live delegation neither chooses nor releases a transcript, but it
pairs with gated transcripts as described above, including while judgment is
pending, so Brunch prose for a submitted transcript is offered on its
delegation. A withheld control or relay request leaves its delegation for Live
to answer itself; other withheld speech declines it. A delegation that arrives
after the judgment gets the same policy until a newer input reaches the gate.
`judgment.result` records the applied decision and `input.withheld` (or, for a
late delegation, `delegation.matched`) the delegation outcome, using metadata
only.

To check local enforcement, filter DevTools Console by `[Petrinaut Live trace]`:

1. Start the local enforcement configuration above. Speak the support-desk
   script; confirm withheld inputs have a `judgment.result` trace with
   `"applied":"withhold"`, no `brunch.admitted` trace, and none of their text.
2. Check meaningful short answers and corrections still reach Brunch.
3. End voice and start again. Confirm old held inputs are not replayed.

The threshold and deadline (`utteranceWithholdConfidence`, which log-mode
recommendations also use, and `utteranceJudgmentDeadlineMs`, both in
`src/shared/live-utterance-judgment.ts`) are trial settings, not validated
production policy.
Before shared enablement, run the support-desk script plus contextual short
answers; measure false withholding, Brunch-start delay, and avoided
submissions. Synthetic tests do not establish classification quality, real Live
responsiveness, or latency reliability. Shared enforcement needs separate sign-off.

### Brunch Voice mode

The following describes Realtime, the default provider in production and local development. Voice mode is disabled by default. To enable it, configure a real
`VITE_BRUNCH_CHAT_ENDPOINT`, set `PETRINAUT_OPENAI_VOICE_ENABLED=true`, and
provide a dedicated `OPENAI_VOICE_API_KEY`.

Production Voice is temporarily unauthenticated. The same-origin check rejects
ordinary cross-site browser requests, but a non-browser caller can spoof its
`Origin` header and create billable Realtime sessions. Use a dedicated OpenAI
project with low usage thresholds and alerts, monitor it while Voice is
enabled, and set `PETRINAUT_OPENAI_VOICE_ENABLED=false` immediately if usage is
unexpected. Revoke or rotate the dedicated `OPENAI_VOICE_API_KEY` in OpenAI,
then update the deployment secret before re-enabling Voice. FE-1622 tracks
adding caller authentication.

Text and Voice mode use one assistant transcript and composer. When Voice mode
is available, the empty first-run prompt and empty composer show a waveform
action; non-whitespace text replaces it with **Send**, and a busy assistant
shows **Stop**. Starting Voice mode opens an inline, versioned consent
disclosure before requesting microphone access. The disclosure also provides a
microphone check and is remembered in browser storage only after Voice mode
starts.

When Brunch is selected, typed turns and completed Voice transcripts both enter
the same mounted Flue conversation route. Each logical turn carries a stable
delivery key so a replayed request converges on the existing admission instead
of creating another turn. If admission cannot be confirmed, the UI reports the
ambiguity and does not retry automatically. **Stop** requests a durable Brunch
abort before the panel cancels its local response stream. Local playback
cancellation remains separate and does not alter canonical history. Canonical
Flue history is the source used when the same net is reopened. Automated
coverage guards a locally submitted turn from an older hydration snapshot and
does not resubmit turns or replay settled audio. The real hard-reload witness is
still pending, so reload parity is not yet claimed for this preview.
Stopping an admitted response supplies Live with quiet, bounded context identifying
the request and its correlated visible partial answer. Failed responses and
unconfirmed admissions receive separate status instructions. **Continue** enters
Brunch as a new request in the existing conversation, not a replay of the stopped
submission or its tools. Partial-answer context never enters the completed-answer
speech path. Delivery and provider interpretation remain best effort.
Voice-origin client-tool results retain their markers in Flue history. Direct
spoken user turns remain canonical text, but Flue 2.0.3 does not yet expose the
caller delivery metadata needed to restore their Voice chip after reopening.

Browser execution and its continuation keep the shared composer busy; a local tool failure reaches Voice as an error rather than an apparently completed response. Durably aborted history entries retain their stopped label. If the Flue step has already completed, Stop can withhold not-yet-started browser work locally but cannot durably record that withholding: a reopen can recover those calls as pending. This cancellation/reopen limitation remains unresolved; the local guard is not a durable cancellation claim.

An active session stays at the end of the transcript. Its compact divider shows
a waveform and **Connecting**, **Listening**, **Speaking**, **Paused**, or a
recovery state. Listening levels follow microphone input; provisional words
appear immediately above the divider in an ephemeral user-style bubble. The
bubble is replaced by the finalized message or pending-question tool output,
which retains a waveform indicator without duplicating the answer. Provisional
transcription and Realtime audio are not persisted as chat history.

The text composer remains available. Sending typed text ends Voice mode first,
then submits the draft exactly once through the same conversation; a failed
handoff restores the draft. Closing the assistant pauses capture and speech
before hiding it. Reopening preserves the mounted session in **Paused** state.
With **Interruption by speaking** disabled, the dock exposes **Your turn** while
canonical audio owns the turn. That action
clears pending input and output, waits for the provider's matching
acknowledgements and response terminal event, and only then opens the
microphone for fresh capture. Its playback menu offers **Repeat question** and
**Read full response**. Full-response replay becomes available once the matching
response and audio output have both finished, enqueues all exact retained
canonical segments in order, and is disabled during capture, submission,
cancellation, pause, and errors. **Repeat question** has the same safety gates
and replays the whole finalized assistant text of the folded turn; while the
turn is still continuing through tool work, or produced no finalized text, the
action stays disabled rather than guessing from a partial segment.

The browser sends its SDP offer to this app; the server initializes a trusted
`gpt-realtime-2` audio-input/audio-output session through OpenAI's unified
Realtime call endpoint. The provider key, model, instructions, language, and
session configuration stay server-side; the transcription vocabulary is shared
with the browser's local admission filter. Realtime exposes no tools, uses
`tool_choice: "none"`, and configures semantic VAD to detect an input boundary
without creating a model response.

Realtime is the disposable media plane: it carries microphone and remote audio,
detects complete turns, and transcribes input. Brunch remains the control plane
and sole authority for questions, captures, state, completion, and durable
history. The bridge accepts only
`conversation.item.input_audio_transcription.completed` as an answer, ignores
model function arguments, and submits the normalized transcript through
Petrinaut's shared composer path. Connection epoch, item id, and content index
form its stable identity. Duplicate, empty, failed, unavailable, and over-limit
transcripts never submit; recoverable failures leave a not-heard or too-long
notice in the dock. Provisional transcription remains display-only.
Only interruption-originated completions receive local prompt-regurgitation
and self-echo checks before admission or pending-answer retention. Comparison
uses NFKC, lowercase, punctuation removal, and whitespace collapse. Exact
normalized active-playback echoes are rejected at any length; fuzzy comparison
requires at least 80% ordered bigram overlap and minimum lengths of eight tokens
for the vocabulary prompt or six for active canonical playback. The playback
reference is captured when interruption starts, excludes queued speech and
history, and is released on completion or lifecycle cleanup. Rejections produce
only content-free diagnostics; they create no answer, error, or pending-answer
notice. Short novel answers remain valid and the admitted payload keeps its
original casing and punctuation.

The bridge waits for the correlated Brunch turn before returning canonical
speech segments to Realtime. It instructs Realtime to speak only those
segments. Generated audio is not a verbatim recording: canonical Brunch text
remains visible and authoritative. **Interruption by speaking** is enabled by
default: speech detection immediately cancels generation and clears output audio,
never the input buffer. If new speech cancels brief preparation before admission,
the finalized words remain in the composer as an unsent message. Stop and session
teardown still withdraw them. The completed answer waits if Brunch is still busy.
False speech detection may still stop playback even if the transcript is later
discarded. Disable this browser-saved preference for half-duplex capture: the
microphone closes during assistant output, and audio captured before a completed
**Your turn** handoff cannot become a later answer.

The local Brunch preview reaches the mounted route through its same-origin, protocol-preserving proxy; this does not establish remote authentication or public ingress. Denying microphone permission leaves the text composer available and submits nothing to Brunch. When Voice mode cannot continue, the inline recovery state distinguishes microphone, connection, and other Voice failures, explains the next action, and offers **Reconnect** where appropriate. Sanitized error codes and diagnostic references remain collapsed under **Technical details**.

Realtime connection, transcription, and canonical speech timings use random
request IDs, and the existing Brunch transport provides its own request
correlation. Browser and server diagnostics report only operation, stage,
outcome, duration, request ID, and—where applicable—status, rejection reason, or a sanitized error
code. Voice responses also expose privacy-safe `Server-Timing` metrics. These
diagnostics never record audio, SDP, transcript or prompt contents, canonical
speech text, credentials, or provider response bodies. Production Voice remains
behind the explicit server configuration, which is an operational switch rather
than caller authentication.

## Testing the API against the built output

A plain `yarn build && yarn vite preview` only serves the static `dist/` assets - `/api/chat` will 404 because the dev plugin is not loaded by `vite preview`. Use one of the options below to exercise the production code path locally.

### Option A: `vercel dev` (recommended)

Closest to the real Vercel runtime. It builds the site, bundles the function, and serves both from a single port using the actual Node runtime + routing layer.

Requires linking to a Vercel project. If you don't have access, go for Option B (or just use `turbo run dev` instead).

```sh
cd apps/petrinaut-website

npx vercel link # first-time setup

npx vercel dev             # builds + serves on http://localhost:3000
```

Notes:

- `vercel dev` does not read your existing `dist/`; it rebuilds. If you specifically need to inspect the artifact you already produced, use option B (or amend the devCommand in vercel.json to remove the build step).

### Option B: `vite preview` + a sibling Node API server

Useful when you want to serve the literal `dist/` artifact you just built and avoid the Vercel CLI. It is two processes, glued together by `preview.proxy`.

1. Add a proxy entry to `vite.config.ts` (only needed while you are testing this flow):

   ```ts
   preview: {
     proxy: { "/api": "http://localhost:3001" },
   },
   ```

2. Create a throwaway `scripts/preview-api.mjs` that mounts the same handler with `createServerAdapter`:

   ```js
   import { createServer } from "node:http";
   import { createServerAdapter } from "@whatwg-node/server";
   import handler from "../api/chat.ts";

   createServer(createServerAdapter(handler)).listen(3001, () => {
     console.log("preview API listening on http://localhost:3001");
   });
   ```

3. Run them side by side (Node 22.6+ can execute the TypeScript entry directly with `--experimental-strip-types`):

   ```sh
   yarn build
   yarn vite preview                                          # :4173
   node --experimental-strip-types scripts/preview-api.mjs    # :3001
   ```

`/api/chat` requests against `:4173` will be proxied to the local API server, which loads the same handler the deployed function uses.

## Known caveats

- **In-memory rate limiting.** [`api/chat.ts`](api/chat.ts) keys rate-limit buckets by the client IP that Vercel's edge writes into `x-forwarded-for` (which Vercel actively prevents the caller from spoofing - see the [request headers docs](https://vercel.com/docs/edge-network/headers/request-headers)). The bucket map lives in module scope, so it resets on cold start and is not shared between concurrent function instances.
- **`vercel-build.sh` deletes the repo-root `.env`.** This is intentional (mise picks it up otherwise), but worth knowing if you run `vercel dev` locally and keep secrets there.
