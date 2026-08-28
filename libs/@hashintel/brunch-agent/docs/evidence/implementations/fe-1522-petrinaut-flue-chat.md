# FE-1522 / Mission 1 — review follow-through

**Date:** 2026-08-27
**Source:** `ln/fe-1522-mission-1`
**Review:** `REVIEW-mission-1.md` (temporary; deleted after this pass)

## Code findings closed

- **S1.** `/agents/chat/:id` now requires `x-brunch-principal` and
  `x-brunch-conversation` and admits the request only when those re-derive the
  path id. Missing headers → 401; mismatch → 403. `/api/chat` turns stay
  in-process `init`+`dispatch`.
- **T1–T3.** Client-tool signal contract lives in `apps/brunch-agent/src/client-tool.ts`;
  output resolution and `ConversationIdentity` are local extracts. Transport keeps
  `providerExecuted === true` as the named panel-side check.
- **T4 kept / T5 left.** Inspect hook stays env-gated proof telemetry. Package
  `types` continue to point at source.

## Observed this session

The production-path integration test still proves `/api/chat` through server
`ping`, correlated `readPetrinautDoc` resume, Flue `history()` transcript, and
reload hydration. It now also proves the raw agent route: `history()` without
ownership headers is 401; a foreign principal against the hashed id is 403.

Against the running local servers (`http://127.0.0.1:4321`, panel
`http://127.0.0.1:4915`):

- `GET /agents/chat/:id` with no headers → 401 `unauthorized`
- same id, principal that does not re-derive it → 403 `forbidden`
- matching principal + conversation headers → admitted (Flue 404 on an unused id)
- `GET /api/chat` without principal → 400 `invalid_principal`

## Proof point 4 — not observed in-browser here

`ANTHROPIC_API_KEY` is present and `yarn dev:brunch` is up. Browser automation
in this environment could not attach (agent-browser CDP channel closed;
playwright-cli unix-socket `EPERM`). Panel-side execution of `readPetrinautDoc`
was therefore not watched. The integration test still correlates that tool via a
hand-built resume POST; that is not a substitute for the human run.

## Remaining human run

From the repository root, with the demo already started (`yarn dev:brunch`):

1. Open `http://127.0.0.1:4915`.
2. Send a message that causes the server `ping` tool and the existing
   `readPetrinautDoc` client tool.
3. Watch pending/thinking vs completion, the ping card, and the doc tool
   running in the browser, then the conversation resume.
4. Reload the page and confirm hydration from Flue history (`GET /api/chat?id=`).
5. Print the transcript with the UI-shell principal and conversation id from
   localStorage (`brunch-principal-v1`, `brunch-conversation-id-v1`):

```sh
yarn workspace @apps/brunch-agent transcript -- --principal <key> --id <conversationId>
```

Until that run is recorded, `MISSION.md` stays *Nominally complete; still under
verification.*

## Human run (later the same day)

Items 1–4 were witnessed in the Petrinaut panel by the driver. Items 5–8 were
witnessed against the live service: reload hydration, process bounce with the
same SQLite snapshot and panel conversation, `history()` transcript (and
`@flue/sdk` bonus), voice dock documented and checked against KA's `submitText`
path. Mission 1 is accepted; close report is
[`docs/mission-archive/1-bare-petrinaut-flue-chat.md`](../../mission-archive/1-bare-petrinaut-flue-chat.md).
