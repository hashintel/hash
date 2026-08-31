# Mission 1 — bare Petrinaut ↔ Flue chat

## Status

Accepted 2026-08-27. Evidence of what was proven, not execution authority. Re-earn
before building on it, same as an ADR.

The live mission is [`MISSION.md`](../../MISSION.md). Successor clusters:
[`MISSION.next.md`](../../MISSION.next.md).

## Imperative

Prove the real Petrinaut demo can hold a durable, observable conversation with a plain Flue agent
before Brunch adds capture or elicitation semantics. This mission retires integration uncertainty;
it does not advance the intended harness design.

## Throughline

One interaction crosses this production path:

`Petrinaut assistant panel → AI SDK /api/chat → Brunch-hosted plain Flue agent → model and server tool → AI SDK stream → Petrinaut client tool → correlated result → same Flue conversation`

Simplify the current implementation in place:

- mount one minimal plain-Flue chat agent in `apps/brunch-agent`;
- shrink `@hashintel/brunch-agent-transport-aisdk` to the Flue ↔ AI SDK wire seam it actually
  exercises, with no dependency on Brunch core, bindings, or plugins;
- make `@apps/brunch-agent` consume no Brunch package except that adapter;
- remove the current SDCPN/Gherkin harness composition from the active chat path and delete or
  replace tests that exist only to prove that superseded topology;
- keep Petrinaut's existing assistant panel and client-tool machinery unless the real throughline
  exposes a missing seam;
- use Flue's canonical conversation as the only persisted session log.

The voice dock is the narrow point where another input modality can submit into the same principal,
conversation, and response-stream contract. Mission 1 establishes and names that point; it does not
implement voice or introduce a voice-specific server route.

## Proof

This proof establishes that the production path exists and is durable. It does not discharge the
elicitation-harness contract.

From a clean checkout, a human can follow one documented start command or short command sequence and
observe all of the following through the real demo and service:

1. A message from Petrinaut reaches the mounted Flue agent and streamed assistant text returns.
2. The panel visibly distinguishes pending/thinking or equivalent work-in-progress from completion.
3. One minimal server-side tool runs, its call/result are visible, and its result returns to the
   model.
4. One existing, read-only Petrinaut client tool runs in the browser, its result is correlated to
   the originating call, and the same Flue conversation resumes and responds.
5. Browser reload/reconnection reconstructs the conversation from Flue history rather than from a
   second server-side transcript.
6. The configured Flue database preserves that conversation across the service restart behavior
   claimed by the runbook.
7. A supported built-in Pi/Flue session API converts the persisted log into human-readable
   transcript evidence, including user text, assistant text, and both tool interactions; no custom
   shadow log or replacement event model is added.
8. KA's voice-mode work has one documented integration point and the minimum input/output contract
   needed to join this conversation without owning a second history or transport.

Prefer one production-path integration test plus a recorded human run over a broad replacement
suite. Unit tests should protect only parsing or correlation invariants that failed or proved easy
to regress.

**Bonus, not completion-critical:** address the mounted agent with `@flue/sdk` from a script or test
using the same public conversation URL. Do not add a diagnostic protocol or second server for
generative testing.

## Constraints

- `@flue/runtime`, `@flue/sdk`, `@flue/react`, and `@flue/vite` are already pinned to npm's current
  Flue 2.0 release (`2.0.3`). Follow its documented happy paths; do not perform an upgrade or a
  broad Flue-conformance audit unless the registry changes or the throughline exposes drift.
- No dependency from the active app or adapter to Brunch core, binding-flue, plugin-gherkin, or
  plugin-sdcpn. Do not copy their protocol types into a renamed abstraction.
- No capture, sweep, plugin schema, repertoire, IR, completion accounting, issue model, correction
  workflow, or target-document persistence.
- No second conversation log. Flue history is authoritative; browser message persistence is a UI
  cache only and must reconcile to the same conversation identity.
- Use one stable principal + conversation identity across chat, reload, client-tool follow-up,
  transcript export, and the voice dock. Protect the mounted Flue route wherever it is reachable;
  direct agent access must not bypass the same ownership rule.
- The client-tool proof should be read-only. Do not make editor mutation semantics part of this
  mission.
- Update user-facing or runbook documentation only where the exercised behavior changes. Do not
  document speculative follow-on architecture.

## Fog-line

Do not design past these questions before running the simplest path that can answer them:

- Whether the adapter should project Flue's conversation stream directly or bridge Flue's
  programmatic `dispatch`/`read` events into AI SDK chunks.
- The smallest supported way for an AI SDK client-tool result to settle a Flue tool call and resume
  the same turn without Brunch ask/reply semantics.
- Which built-in Pi/Flue parser or serializer produces the required transcript evidence from the
  persisted canonical records.
- Whether reload needs server reattachment, browser hydration, or both once one conversation id is
  used consistently.
- The exact shape KA's in-progress voice mode can provide and consume at the dock.

Resolve each at the real boundary, record the observed answer in code/tests/runbook, and then
re-evaluate. Do not turn the open questions into an adapter framework.

## Stop or reorient

Stop and surface the evidence before continuing if:

- client-tool return requires importing Brunch ask/reply or capture semantics;
- the adapter begins defining a generalized harness event framework;
- persistence requires an application-owned duplicate of Flue conversation history;
- the voice dock requires Brunch to own provider-specific audio/session state;
- a passing test injects wiring absent from the real demo/service entrypoint;
- compatibility work expands beyond a concrete Flue 2.0 API used by this throughline;
- the server/client tool pair cannot be replayed into transcript evidence through supported APIs.

## Close

Witnessed 2026-08-27 on `ln/fe-1522-mission-1` (Linear FE-1522). Production-path test:
`apps/brunch-agent/test/petrinaut-chat.test.ts`. Human run: Petrinaut panel at
`http://127.0.0.1:4915` against brunch-agent at `:4321`. No GitHub PR at close; this section is
the close report until one exists.

### Proof

1. Panel message reached `ChatAgent`; streamed assistant text returned.
2. Panel distinguished pending/thinking from completion.
3. Server `ping` ran, was visible, and returned to the model.
4. Client `readPetrinautDoc` ran in the browser; correlated result resumed the same Flue
   conversation.
5. Reload hydrated from `GET /api/chat?id=` (Flue history), not from a second server log.
6. After bouncing the brunch process, SQLite at `apps/brunch-agent/.data-wipe-me/conversations.db`
   still held the same snapshot; the panel showed that conversation after reload.
7. `createFlueClient().history()` against the public `/agents/chat/:id` URL, projected by
   `formatFlueTranscript`, showed user text, assistant text, `ping`, and `readPetrinautDoc`. No
   shadow log.
8. Voice dock named in `apps/brunch-agent/README.md`: same `POST /api/chat` / `GET /api/chat?id=`
   contract, principal + conversation id, no Brunch-owned audio. Checked against
   `kostandin/h-6763-openai-canonical-speech` (`submitText` → that door).

Bonus: `@flue/sdk` against that same public URL succeeded.

### Fog-line answers

- **Stream projection.** The app `dispatch`es then `read`s Flue events and projects them into AI
  SDK UI chunks (`createFlueUiStream`). The transport does not import Flue.
- **Client-tool resume.** Awaiting sentinel plus `client-tool-result` signal on a follow-up
  `dispatch`; no Brunch ask/reply.
- **Transcript.** Public Flue `history()`, not a Pi session dump. Human-readable wrapping is a
  projector over that snapshot.
- **Reload.** Browser hydration from `GET /api/chat?id=`. LocalStorage `petrinaut-ai-messages` is
  a cache: replaced on a successful GET, kept only if GET fails. No server reattachment beyond
  hashing principal + conversation id to the Flue instance.
- **Voice dock.** Composer `submitText` aimed at `POST /api/chat`. Identity and follow-up
  contract as in the runbook. Conversation-id scheme vs KA's `petrinaut-preview:${netId}`, and
  stolen vs configured `/api/chat`, remain Host-trunk flags.

### Carried flags

- Net id as conversation discriminator is a working assumption, unproven across Petrinaut
  create/save/load.
- Compaction is Flue-default and unpinned.
- Two brains (stock modeller vs Brunch) is launch-time exclusive occupancy, not an in-app
  picker.
- Capture, sweep, plugins, IR, and target-document persistence were forbidden here; Mission 2
  re-enters only a thin capture pipe.
