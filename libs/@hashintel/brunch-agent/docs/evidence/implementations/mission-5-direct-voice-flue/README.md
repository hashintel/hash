# Mission 5 direct Voice over Flue evidence

## Readiness status

Automated contract evidence passed on 2026-09-03. The real human Voice witness
required by proof leaf 8 has not been run, so this record does not claim Mission
5 product acceptance.

The implementation under test is:

- `e0d7ac6a82` — browser Flue `ChatTransport`, stream projector, history
  projection, and ownership headers;
- `f97f5723fa` — typed Petrinaut panel wiring and same-origin Flue proxy;
- `1411a28158` — removal of the Brunch `/api/chat` route;
- `3fbf9bc90dc0dc71cde61c5516a05fedee8825b1` — Voice submission correlation,
  canonical response selection, observation-based reopen, and durable Stop.

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
| `@apps/petrinaut-website`                      |         31 |   205 |
| `@hashintel/petrinaut`                         |         53 |   476 |
| `@hashintel/brunch-agent`                      |          9 |    77 |
| `@hashintel/brunch-agent-plugin-sdcpn`         |          2 |     8 |
| `@hashintel/brunch-agent-transport-aisdk`      |          3 |    14 |

`yarn workspace @local/petrinaut-arch-docs lint:arch-docs` also passed with 62
layers, 297 edges, 613 files, 63 generated pages, and 30 authored pages.

The route-name scan found no `/api/chat` reference in the Brunch transport
packages. Remaining live references are the stock Petrinaut fallback route and
the Brunch negative tests that assert its removed route returns 404.

## Human witness still required

Run `yarn dev:brunch` with the local Brunch preview and Voice credentials, then
perform the Mission 5 demo script. Retain sanitized artifacts here:

1. `witness.md` — date, adjudicator, source/build commit, and observed outcome;
2. `voice-events.jsonl` — content-free admission, first canonical text, first
   TTS/audio, interruption, Stop, and settlement timing;
3. `network-routes.json` — method and route summary proving conversation
   traffic used only `/agents/chat/:instanceId`;
4. `flue-snapshot.json` — sanitized canonical snapshot after reopen;
5. `settlements.json` — settled, aborted, and abort-lost-to-completion outcomes;
6. `manifest.sha256` — hashes for the retained witness artifacts.

The witness must type one turn, speak one finalized answer, confirm exactly one
visible user message, compare canonical text with the exact TTS request input,
interrupt playback, durably stop one unsettled turn, and reopen without
resubmission or audio replay. Do not retain transcript text, audio, credentials,
SDP, prompts, tool payloads, or provider response bodies in ordinary telemetry.
