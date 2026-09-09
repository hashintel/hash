# Separate Brunch-authored speech: local implementation evidence

2026-09-09. Implementation evidence, not mission acceptance or a content-quality verdict.
The execution authority is [MISSION.md](../../../../MISSION.md). The parent experiment
[#9585](https://github.com/hashintel/hash/pull/9585) remains open at
[0902dddb](https://github.com/hashintel/hash/commit/0902dddbbfd53ac98499c44a7302339bca135563).
The meeting transcript was available in the prior planning conversation. The Notion proposal
and Slack discussion remain unreviewed.

## Implemented boundary

The Voice-only ChatAgent contribution registers `brunch_set_voice_response`. It accepts
nonblank Brunch-authored speech, writes schema-validated `brunch-voice-response` data with
the tool-call identity, and returns that exact speech in the existing visible tool-result
card. This uses the existing Flue store and AI SDK data/history projection; it adds no store
or transport protocol. Ordinary assistant prose remains the full visible response.

The website selects speech only with a matching successful authoring tool and subsequent
finalized visible prose. A later substantive tool invalidates an earlier draft; Brunch must
author another one after the tool result. The question marker does not invalidate speech.
The bridge releases the final message's correlated speech only when the panel's derived
whole-reply status is ready, including all automatic browser-tool continuations. An individual
message completion is not permission to play. Failed, aborted, or locally withheld replies
do not release pending speech. Playback interruption remains distinct from durable Stop.

Missing, unusable, or uncorrelated speech falls back only to the existing fixed reading
notice when a complete visible reply exists. The notice is not substantive delivery. Neither
the application nor Realtime summarizes a report. Read full response selects visible prose;
Repeat question selects the exact visible, marked question. Reload restores explicit reading
without admitting a user turn or automatically playing saved speech.

Prompt changes are confined to the app-owned Voice overlay and Voice-only authoring tool.
Core SYSTEM.md, core Flue question instructions, SDCPN append prompt, modelling skill,
prepared-fixture instructions, and Realtime policy are unchanged. Realtime still receives
only application-selected text, with no domain tools or autonomous response permission.

## Deterministic oracles

- `apps/brunch-agent/test/voice-context.test.ts`: real runtime effective instructions and tool
  availability across typed → Voice → Voice continuation → typed → unknown preference.
  Typed prompts and tools are unchanged across that sequence.
- `apps/brunch-agent/test/voice-response.test.ts`: production ChatAgent, faux provider, HTTP
  router, FlueClient, AI SDK transport, temporary SQLite database, runtime shutdown/restart.
  Exact speech data, full report/workpiece prose, and exact question marker survive together.
  This is model-independent routing/durability evidence, not model adherence evidence.
- `canonical-speech.test.ts`: separate exact speech/report selection, stable identities,
  identical speech on different replies, blank/missing/unmatched/obsolete speech, provisional
  prose, later tools, replacement drafts, stopped messages, and unchanged question replay.
- `realtime-brunch-bridge.test.ts`: no early playback at message completion; one final
  correlated takeaway after continuations; no fabricated summary or automatic long-report
  fallback; no replay for typed/history updates; failed/aborted continuation and cancellation.
- `voice-browser-tools.integration.test.tsx`: actual Petrinaut panel, tracker, transport, and
  browser `readPetrinautDoc` execution with scripted Flue events. The panel stays busy across
  continuation admission and produces one final authored speech request, never the obsolete
  pre-tool draft or the report. Invalid browser input and Stop withhold speech.
- `voice-preview.integration.test.ts`: actual session request construction with fake WebRTC
  and transport; the distinct authored takeaway reaches `response_text` unchanged, with no
  tools. Existing capture/echo, cancellation and replay checks remain active.
- `voice-turn-controller.test.ts`: full-prose and exact-question replay after reload, no
  autoplay or resubmission, plus existing half-duplex/interruption/Stop state checks.

## Executed checks

Commands run from the repository root after building the required local dependencies:

```sh
yarn workspace @apps/brunch-agent test:unit
# 28 files, 206 tests passed
NODE_OPTIONS=--no-experimental-webstorage yarn workspace @apps/petrinaut-website test:unit
# 41 files, 384 tests passed
yarn workspace @hashintel/brunch-agent test:unit
# 11 files, 96 tests passed
yarn workspace @hashintel/brunch-agent-transport-aisdk test:unit
# 4 files, 49 tests passed
```

The targeted website Voice suite also passed 193 tests without that Node option. The full
website run initially failed seven unrelated local-storage tests under Node 26.5.1 because
its experimental global storage displaced jsdom storage. Disabling Node's experimental
storage restores jsdom and passes all 384 tests without changing tests or application code.

Build, `lint:tsc`, and `lint:eslint` passed for the Brunch application, Brunch core, and website.
Brunch application lint retains 14 warnings in unchanged code; website retains its existing
set-state-in-effect warning; neither has errors. The Petrinaut library build and targeted
user-guide-content test passed. Changed TypeScript/JSON formatting and `git diff --check`
passed. No whole-monorepo build claim is made.

Environment preparation initially exposed missing generated design-system tokens, library
builds, website example JSON, and optimizer-client types. Their existing codegen/build commands
were run without tracked infrastructure changes. The unrelated full `hash-backend-utils`
build still reports missing graph-workspace dependencies; it emitted the OpenTelemetry
subpath needed by Brunch, whose own build and full test suite subsequently passed.

## Rendered inspection

Chromium rendered the actual website/Petrinaut panel at 1280 × 900, device scale 2. A seeded
local UI fixture displayed a distinct speech card and complete report. The inspected capture
is attached in the [implementation thread](https://ampcode.com/threads/T-01a085b2-4d2a-73ca-bf56-95ec31430d52)
as `.amp/in/artifacts/separate-voice-speech.png`. The card includes its entire qualification,
“The release rule still needs validation,” without clipping, and explicitly disclaims playback
confirmation. Its detail is visible without expansion. After reload and reopening the panel,
DOM checks found both speech and report and exactly one user message. This seeded browser
check is not the prepared real-provider demonstration or remote Flue deployment evidence.

## Outstanding acceptance gates

Local verification involved no paid provider activity, campaign, deployment, external write,
push, or PR creation. The owner subsequently authorized committing and publishing a draft
stacked PR; that authorization does not authorize a paid trial or accept the experiment.
The audible real-provider/browser demonstration awaits bounded paid-run authorization;
human review remains outstanding. Repeat the two historical inputs on `crew-reservation-v1`
once that run is authorized:

1. “What does reserving a dispatch crew mean here?”
2. “Give me a detailed analysis of this model, including assumptions, possible bottlenecks,
   missing constraints, and what still needs validation. Do not change the model.”

Also witness a consequential modelling gap, evidence-backed browser continuation (including
rejection/no-op truthfulness), mixed typed/Voice use, interruption, Stop, and reload. Record
model/configuration differences from #9585. A scripted correct answer cannot judge whether
the model naturally authors useful or faithful content.

Judge three axes separately:

- **Usefulness:** a brief useful answer without gratuitous follow-up; a relevant marked
  question when the modelling gap matters; a substantive takeaway for a long report.
- **Fidelity:** speech agrees with full prose and tool evidence, preserves consequential
  qualifications and exact spoken questions, while the visible workpiece remains complete.
- **Delay:** independently record user speech end, final transcription, whole-reply completion,
  speech request, and first substantive audible answer. Audio-buffer events, acknowledgements,
  and reading notices are not first-audible answers. No audible delay was measured here.

No word-count or latency acceptance threshold has been invented. Content success with
unacceptable delay leaves earlier delivery as an unresolved follow-up. Failure updates only
this relay variant's assessment; it does not exhaust relay alternatives, implicate core
SYSTEM.md without evidence, or select delegation or Brunch-as-client-tool.
