# Petrinaut attach — surviving contracts

> Historical integration hypothesis, collapsed 2026-09-07 so it cannot keep drifting.
> Full prior text, including the September user-story list and testing-decisions spike
> record, is pinned at
> `ed9edfe7f0:libs/@hashintel/brunch-agent/docs/specs/petrinaut-integration.md`.
> Live authority is root [`MISSION.md`](../../MISSION.md).

**Decision record:** [ADR-0004](../adr/0004-in-petrinaut-staging-and-the-monorepo-import.md).
Amended by FE-1506, ADR-0009, and Mission 5 / FE-1574.

## What still holds

The Brunch elicitor is a long-running Flue server. The Petrinaut host derives one guarded
`/agents/chat/:instanceId` URL, creates a public `@flue/sdk` client, and supplies a browser
`ChatTransport` from `transport-aisdk`. That package projects one admitted Flue submission into
the finite AI SDK stream `useChat` renders. It imports `@flue/sdk` and `ai` only — never
`@flue/runtime`, core, a plugin, or a binding.

Client tools use Petrinaut's exported schemas. The panel executes known UI tools and returns one
`client-tool-result` signal. Flue history is the conversation log. The workpiece is
per-conversation Markdown, not a capture store or typed IR. The stock Petrinaut `/api/chat`
route is a separate fallback and never carries Brunch turns. Applications may compose Brunch
and Petrinaut; reusable libraries stay mutually unaware.

## Attach contract

1. **Conversation transport.** `FlueClient.send()` against `/agents/chat/:instanceId`; the host
   `ChatTransport` follows only the admitted submission.
2. **Principal.** Every request carries one non-empty opaque principal in `x-brunch-principal`.
   Local UID is identification, not authentication.
3. **Composer and Voice.** Keyboard and finalized Voice share the same `useChat` submission
   path and conversation identity. No second conversation, mutable transcript, or direct Voice
   send. Realtime remains the media plane; Brunch remains the control plane ([ADR-0009](../adr/0009-openai-voice-ui-turn-shell.md)).
4. **Question affordance.** Structured `brunch_ask` is not a current product path. Exact
   question replay uses the hidden marker only. Re-entry of interactive questions is the
   unallocated structured-question backlog in [`MISSION.next.md`](../../MISSION.next.md).

## Rejected by later missions

Durable capture, completion accounting, and a live interpretation panel as the demo claim;
server-side `/api/chat` as the Brunch door; capture-envelope provenance; treating this file as
permission to remount ask/sweep or grow a second attach surface.
