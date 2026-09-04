# Mission 5 direct Voice over Flue evidence

## Readiness status

Automated contract evidence passed on 2026-09-03. A real human Voice witness was attempted on 2026-09-04. It passed typed and Voice admission, exact-once visible Voice input, spoken canonical output, barge-in, and explicit durable Stop, but failed faithful reopen. This record therefore does not claim Mission 5 product acceptance.

The implementation under test is:

- `bb4457c558` — browser Flue `ChatTransport`, stream projector, history projection, and ownership headers;
- `daf525e142` — typed Petrinaut panel wiring and same-origin Flue proxy;
- `969808e772` — removal of the Brunch `/api/chat` route;
- `0d5343b069` — Voice submission correlation, canonical response selection, observation-based reopen, and durable Stop;
- `2936a4b3f7` — review fixes for canonical history hydration, exact TTS text, content-free lifecycle latency telemetry, Clear behavior, API simplification, and documentation;
- `05b363649e` — React-compiler-safe tracker lifecycle and final live-authority corrections;
- `f1189523a8` — real Flue admission timing and production-path correlation evidence;
- `a4ec9f28ce` — client-tool-result ordering that keeps the Voice submission pending until its real Flue admission and cancels stale admission waits;
- `2a1bb35775` — durable Stop correlation and aligned live/history conversation projections; and
- `eecbe99e20` — reply correlation across every submission that wrote a resumed assistant message; and
- `2d4e81f3a4` — preservation of Petrinaut's Voice API handlers in the Brunch local preview.

## Automated verification

The focused repository command completed with 36 successful tasks out of 36:

```sh
yarn exec turbo run lint:tsc lint:eslint test:unit build \
  --filter @apps/brunch-agent \
  --filter @apps/petrinaut-website \
  --filter @hashintel/petrinaut \
  --filter @hashintel/brunch-agent \
  --filter @hashintel/brunch-agent-plugin-sdcpn \
  --filter @hashintel/brunch-agent-transport-aisdk
```

The unit results included:

| Workspace                                      | Test files | Tests |
| ---------------------------------------------- | ---------: | ----: |
| `@apps/brunch-agent`                           |         16 |    79 |
| `@apps/petrinaut-website`                      |         31 |   212 |
| `@hashintel/petrinaut`                         |         53 |   478 |
| `@hashintel/brunch-agent`                      |          9 |    77 |
| `@hashintel/brunch-agent-plugin-sdcpn`         |          2 |     8 |
| `@hashintel/brunch-agent-transport-aisdk`      |          3 |    14 |

`yarn install --immutable` passed with the repository's existing peer-dependency warnings. `yarn workspace @local/petrinaut-arch-docs lint:arch-docs` also passed with 62 layers, 297 edges, 613 files, 63 generated pages, and 31 authored pages. The focused ESLint run retained one non-blocking `set-state-in-effect` warning in `voice-interview-control.tsx`.

The proof-leaf route scan over `apps/brunch-agent`, `packages/`, and the Petrinaut local-storage demo found no production path that sends a Brunch turn through `/api/chat`: its live hits are the stock Petrinaut fallback and negative tests asserting the removed Brunch route returns 404. Current integration and topology references now name `/agents/chat/:instanceId`; archived missions, prior implementation evidence, and historical decision records retain `/api/chat` as provenance for the superseded door.

The Voice integration holds the finite Flue response stream open and asserts that `submission-admitted` arrives from the real `createFlueChatTransport().onAdmission` callback before composer submission completion. The Voice control tests also prove that a locally completed interactive-tool result remains pending until the subsequent client-tool-result admission and that cancellation releases the one-shot subscription. Bridge tests separately cover direct-message and client-tool-result matching, duplicate delivery, stale cancellation, mismatched ids, and submission-id-based canonical response selection.

## Human witness still required

Run `yarn dev:brunch` with `ANTHROPIC_API_KEY`, `PETRINAUT_OPENAI_VOICE_ENABLED=true`, and a dedicated `OPENAI_VOICE_API_KEY`, then perform this witness against source commit `2d4e81f3a4` or a descendant that changes evidence only:

1. Open one saved net, submit one typed panel turn, and confirm the network ledger contains conversation traffic only under `/agents/chat/:instanceId`.
2. Start Voice mode, accept the disclosure if required, speak one finalized answer, and confirm exactly one corresponding visible user message.
3. Confirm the content-free lifecycle ledger records one ordered admission, first canonical text, settlement, first TTS request, and first TTS audio sequence for the same opaque correlation id.
4. Compare the ordered canonical Brunch text with the exact `response_text` string array queued for speech. Record only matching hashes, lengths, and the boolean result; do not retain the text.
5. Interrupt assistant playback by speaking and confirm canonical history is unchanged.
6. Start another unsettled turn, select **Stop**, and confirm Flue records either an aborted settlement or the documented already-settled race rather than only cancelling the browser stream.
7. Reload or reopen the same net and confirm canonical messages reappear without a duplicate submission, a replayed tool effect, or Voice audio replay.

Retain these sanitized artifacts here:

1. `witness.md` — date, adjudicator, source/build commit, and observed outcome;
2. `voice-events.jsonl` — content-free admission, first canonical text, first TTS/audio, interruption, Stop, and settlement timing;
3. `network-routes.json` — method and route summary proving conversation traffic used only `/agents/chat/:instanceId`;
4. `flue-snapshot.json` — sanitized canonical snapshot after reopen;
5. `settlements.json` — settled, aborted, and abort-lost-to-completion outcomes;
6. `manifest.sha256` — hashes for the retained witness artifacts.

The witness must type one turn, speak one finalized answer, confirm exactly one visible user message, compare canonical text with the exact TTS request input, interrupt playback, durably stop one unsettled turn, and reopen without resubmission or audio replay. Do not retain transcript text, audio, credentials, SDP, prompts, tool payloads, or provider response bodies in ordinary telemetry.

## Human witness attempt — 2026-09-04

The local `yarn dev:brunch` pair ran against source commit `2d4e81f3a4` with the required Voice configuration available. The human observed:

- one typed turn completed through the Brunch panel;
- one finalized spoken answer produced exactly one visible user message;
- Brunch's visible response also played aloud, and speaking over it stopped playback without removing the visible response;
- the transcript was initially hidden behind a small **Show transcript** control;
- **Exit voice mode** stopped the audio session but did not durably stop an admitted Brunch submission; the partial spoken input was submitted and the response completed as text;
- using the chat composer's actual Stop control durably stopped the unsettled response and displayed **Response stopped** before reload; and
- after closing the panel, reloading, and reopening the same conversation, all message content returned, but typed/Voice provenance was absent and the stopped assistant entry appeared as ordinary truncated content. The global stopped status remained visible.

The reopen gate failed because the transcript did not return exactly as left. Absence of duplicate submission and audio replay was not fully adjudicated after this failure, and the required content-free event, route, snapshot, settlement, and hash artifacts were not retained. The owner chose not to expand Mission 5 with immediate product remediation. Mission 6 owns preserving per-message typed/Voice provenance and stopped-turn presentation across its second-tab resume proof; its cut should also account for the observed discoverability gap between transcript reveal, local Voice exit, and durable conversation Stop.
