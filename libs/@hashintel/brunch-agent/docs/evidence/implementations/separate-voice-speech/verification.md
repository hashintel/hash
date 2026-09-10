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

## Local live fallback diagnosis

On 2026-09-09, the owner reported fallback playback and no speech card despite a browser
Voice delivery. The initial context/response tests passed after `yarn install --immutable`,
but live fallback persisted. The backend on port 4321 started at 17:56:11 Europe/Tirane,
after the installed patched runtime files were updated at 17:54:41. Read-only inspection
of its open SQLite store confirmed that the 17:57:10 submission retained Voice context and
registered the speech tool, but wrote no speech data.

The owner then manually initiated one coordinated Voice request in the existing conversation.
A temporary development-only `observe()` subscriber inspected `turn_request`, logging only
presence flags, timestamps, and correlation IDs; no credentials, prompts, arguments, or
tool-result content were logged. The owner supplied the live output in the
[local diagnosis thread](https://ampcode.com/threads/T-01a086e5-f3c7-717e-b27f-f2574eca4053).
For submission `sub_ik_4cc5adbc94e5b1b4ffc62800f4cde6d0`:

- Both model requests, `turn_01M23ERQ1DMXVJTRY8W31BW89F` and
  `turn_01M23ERVN4DSSVDCQAA16KQ6YH`, contained the Voice instruction marker and
  `brunch_set_voice_response` tool (`voiceInstructions: true`, `speechTool: true`).
- Read-only canonical stream inspection found exactly one tool call:
  `brunch_mark_question`, which succeeded. The only data write was `brunch-question`.
  There was no speech-tool call and no `brunch-voice-response` data write.
- The second model turn stopped normally; the submission completed at
  `2026-09-09T16:07:18.753Z`. Duplicate observer lines had identical turn IDs; canonical
  records contain two model turns, not four.

This locates the observed failure at speech authoring: the model did not call the available
speech tool despite receiving the Voice overlay. There was no authored speech for transport
or UI selection to recover. It does not establish why the model omitted the tool, general
adherence rates, audible quality, or that all UI selection paths are correct. The fixed
reading-notice branch remains the intended response to missing speech, not successful
substantive delivery. Concurrent OpenTelemetry export errors targeted the unavailable local
collector at `::1:4317`; the recorded model work nevertheless completed.

The temporary probe was removed after diagnosis. Context and response tests passed locally
(two files, two tests); probe typechecking, changed-file lint, formatting, and diff checks
passed. No automated provider request, storage reset, prompt change, completion-gate change,
Realtime change, or architecture change was made. Further paid execution and any material
reorientation remain owner-held; this diagnostic is not experiment acceptance.

### Instruction-adherence follow-up

Read-only inspection identified the live provider/model as
`anthropic/claude-haiku-4-5`. The observed conversation contains fixture initialization and
two Voice submissions, with no skill activations or browser-tool continuations. In the
instrumented submission, 22 words of visible prose preceded the question-marker call;
the next model turn emitted only the exact marked question (16 words), then stopped.
This is a question-delivery sequence with speech omitted, not a failed speech-tool execution.

Inspection of the core, SDCPN, prepared-fixture, and Voice instructions found no explicit
prohibition on the speech call. Core's question marker says to call it immediately before
presenting the question; the Voice overlay separately requires speech authoring before final
visible delivery. These obligations can coexist, but their combined order is not spelled out.
At diagnosis, the response test scripted question marker → speech authoring → prose, so its
success proved routing for that sequence, not that the live model would choose it.

Flue 2.0.3 [prompt composition](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/runtime/src/hooks/render.ts#L215-L225)
joins the returned core prompt and `useInstruction` contributions in call order. Its
[provider boundary](https://github.com/withastro/flue/blob/ac610378741d879a9d12d3f927ff9634e0b4f7ae/packages/runtime/src/session.ts#L823-L836)
passes the observed context directly to `pi-ai`; this excludes post-observation filtering
inside Flue, not uninspected provider-adapter normalization. No active skill in this
conversation supplies a competing instruction.

The next bounded hypothesis is that explicitly composing the delivery order in the app-owned
Voice overlay—finish domain/tool work, author speech, mark any direct question, deliver visible
prose—improves adherence, including clarification-only replies. This was proposed as a wording
experiment, not an established cause or fix. No further provider request or prompt edit was
made during the read-only follow-up.

### Approved wording experiment, fallback persists after restart

The owner approved the narrow experiment in the local diagnosis thread. The app-owned Voice
overlay now explicitly orders evidence gathering → speech authoring → optional question marking
→ complete visible delivery, and states that clarification-only replies also require speech.
No core/SDCPN prompt, tool implementation, typed instruction, Realtime policy, conversation
storage, or completion gate changed.

The effective-prompt test first failed on the missing instruction, then passed after the edit.
It checks the ordered instruction and retains typed/Voice/continuation isolation checks;
boolean assertions avoid logging the effective prompt on failure. The runtime/transport test
now scripts speech authoring before question marking and verifies exact speech, question, and
full report persistence across restart. Existing UI tests confirm that a later question marker
does not invalidate authored speech and that playback still requires correlated completion.

Verification: app build passed; all 28 app test files / 206 tests passed; canonical-speech and
realtime-brunch-bridge tests passed (two files / 52 tests); app typecheck, changed-TypeScript
lint, and Oxfmt checks passed. The first full app test run had three failures from a stale
emitted server bundle (old store, CORS, and fixture schema); rebuilding the app resolved them
without source changes. The agent sent no provider request. These checks establish prompt
placement and routing, not improved model adherence or audible delivery.

A final read-only store check found another Voice submission,
`sub_ik_c7d46e277bf1cebd80139d99f3ff4648`, admitted at 18:15:01 Europe/Tirane during
verification. It completed with one Haiku turn and no tool calls or data writes. Its origin
has not been confirmed with the owner, and no live request probe captured the revised overlay
for it; do not count it as a verified trial of the wording experiment yet.

The owner subsequently followed the restart/retest instructions and reported no card and the
same reading notice. The backend listening on port 4321 started at 18:21:37 Europe/Tirane,
after the overlay edit at 18:14:38. The latest Voice submission,
`sub_ik_2f131d148d5a75fc433972e63d67b0e5`, was admitted at 18:22:33.982 and retained
Voice context. Its resource snapshot registered the speech tool. Haiku completed one turn
normally at 18:22:41.269 with zero tool calls and zero data writes. The observer was no longer
installed, so this retry does not provide a direct capture of the revised model request.

The reported fallback persists after the wording experiment and restart; there is still no
speech for transport or UI selection to recover. Do not infer general model adherence rates
or add another speculative prompt edit. A bounded app-level missing-speech check with a
Brunch-authored repair is a candidate for investigation, not an approved mechanism: provider
cost, continuation/cancellation behavior, and Flue support must be settled before implementation.
No repair call or additional provider request was initiated by the agent.

Flue 2.0.3 exposes a supported `useAgentFinish` hook with successful/failed tool-call history
and `append()` for a correction signal within the same response/submission. Its built-in limit
is 32 finish continuations, which is not an acceptable implicit retry budget here. Any proposal
must establish an application-level one-repair bound and preserve cancellation and continuation
correlation before implementation; no runtime patch or forced provider tool choice is selected.

## Outstanding acceptance gates

Initial deterministic/seeded verification involved no paid provider activity, campaign,
deployment, external write, push, or PR creation. The owner subsequently authorized committing
and publishing a draft stacked PR; that authorization does not authorize a paid trial or
accept the experiment. Beyond the manually initiated diagnostics above, the full audible
comparison demonstration awaits bounded paid-run authorization; human review remains
outstanding. Repeat the two historical inputs on `crew-reservation-v1` once that run is authorized:

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
