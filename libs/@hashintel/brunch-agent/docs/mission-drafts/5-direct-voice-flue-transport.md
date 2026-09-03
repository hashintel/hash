# Draft Mission 5 — Direct Voice over canonical Flue transport

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

## Cold-start reads

- [`../../MISSION.md`](../../MISSION.md) — Mission 4 closure pointer; no live Brunch mission exists.
- [`../../MISSION.next.md`](../../MISSION.next.md) — shared contracts, parallel-track rules, and current sequencing.
- [`../evidence/implementations/mission-4-voice-integration-handoff.md`](../evidence/implementations/mission-4-voice-integration-handoff.md) — observed Voice stack, conflict surfaces, and the package-composition invariant.
- [`../../packages/core/src/flue.ts`](../../packages/core/src/flue.ts) and [`../../../../../apps/brunch-agent/src/app.ts`](../../../../../apps/brunch-agent/src/app.ts) — accepted `useBrunchAgent()` + `useSdcpnPlugin()` agent composition and mounted Flue route.
- [`../../../../../apps/brunch-agent/src/http/petrinaut-chat.ts`](../../../../../apps/brunch-agent/src/http/petrinaut-chat.ts), [`../../../../../apps/brunch-agent/src/conversation/ui-stream.ts`](../../../../../apps/brunch-agent/src/conversation/ui-stream.ts), and [`../../packages/transport-aisdk/src/index.ts`](../../packages/transport-aisdk/src/index.ts) — current AI SDK adapter and Flue-to-UI projection; these are terrain, not a required Voice path.
- Flue [`FlueClient`](https://flueframework.com/docs/sdk/flue-client/) and React client documentation — supported `send`, `read`, `observe`, `history`, `abort`, offsets, submission correlation, and conversation incarnation semantics.
- Voice PRs #9496, #9507, and #9512 at their current accepted tips; do not reconstruct their behavior from this draft.

## Visible product advance

A person speaks one finalized answer in the Voice surface and hears the canonical Brunch reply begin through TTS while the same answer and reply appear exactly once in the owning Flue conversation. Voice connects through Flue's supported conversation protocol rather than submitting through the Petrinaut AI SDK chat composer, and no secondary model rewrites Brunch's reply before speech.

The existing Petrinaut AI assistant may remain temporarily present during integration, but it is not the conversation authority or required transport for this proof. Removal of obsolete assistant UI and deletion of `transport-aisdk` are consequences only after dependency inspection proves they have no surviving consumer.

## Contract stratum

Close the **one-turn direct Voice/Flue transport stratum** for finalized input, streamed canonical output, cancellation, and conversation resumption.

The accepted objects are one stable logical conversation id, one admitted submission id, one finalized user message, one canonical assistant response, and one Voice playback lifecycle. `conversationId` is the durable logical reference; `submissionId` correlates one admitted turn and supports reattachment; stream offsets are opaque Flue cursors; `uid` identifies one current Flue incarnation and must not become the durable demo/session id.

## Boundary crossings and current throughline hypothesis

```text
microphone → provisional STT (ephemeral)
→ one finalized transcript
→ supported FlueClient send to the owning Brunch conversation
→ accepted useBrunchAgent() + useSdcpnPlugin() composition
→ canonical Flue response chunks and settlement
→ exact canonical text projected to Voice
→ ordinary TTS playback
→ history/observe rehydration of the same conversation after reopen
```

Authentication, principal ownership, CORS or a same-origin protocol-preserving proxy remain host obligations. “Direct Flue” means use of `@flue/sdk`/`@flue/react`, not handwritten SSE parsing or an unauthenticated public agent route.

## Throughline proof floor

From the real Voice surface, one finalized spoken answer produces exactly one visible user message in canonical Flue history; one canonical Brunch response streams to both visible text and TTS without a generative simplification pass; interruption stops local playback and the selected durable abort action has its documented effect; reopening the conversation reconstructs the same settled turn without duplicate submission or playback.

The retained proof artifact is the canonical Flue snapshot plus the Voice event ledger for STT finalization, admission/submission id, text/TTS projection, cancellation, settlement, and reopen. This does not prove client-side Petrinaut mutations, workpiece viability, broad Voice UX, remote deployment, or that the AI SDK adapter is removable.

## Readiness ratchet

### Inherited stratum closure

- Preserve Mission 4 package composition; never restore the deleted app-local stub `ChatAgent` to resolve Voice conflicts.
- Preserve canonical Flue history as the sole conversation authority and exact finalized-answer correlation from the Voice work.
- Preserve principal/ownership semantics even if the AI SDK adapter is bypassed.

### Readiness gate after the new throughline

Before this one-turn capability is accepted, close provisional-versus-final transcript deduplication, submission correlation, replay/reopen behavior, TTS cancellation, durable abort races, visible failed/aborted settlement, authentication/origin handling at the claimed host boundary, and exact canonical spoken/visible correspondence. Carry only broader speech ergonomics, multi-turn barge-in tuning, and obsolete-adapter/UI deletion, each after observed strain or dependency proof.

## Candidate evidence and oracles

| Claim leaf | Candidate oracle |
| --- | --- |
| Finalized speech enters one canonical conversation once | Snapshot inspection shows one user message with the expected text and one admission/submission id; provisional STT never appears in history. |
| Voice bypasses AI SDK UI-message transport | Network/source inspection shows the supported Flue conversation protocol and no Voice request to the AI SDK chat route. |
| Spoken output is canonical | Captured TTS input equals the canonical response text selected by the documented deterministic policy; no secondary generation call occurs. |
| Cancellation and abort remain distinct | Voice event ledger plus Flue settlement/history distinguish local playback cancellation, local observation cancellation, and durable conversation abort. |
| Reopen resumes rather than duplicates | A second surface rehydrates the same conversation and settled submission from `history()`/`observe()` without a new user message or automatic replay. |
| Accepted agent architecture survives reconciliation | Composition/dependency test and code inspection retain `useBrunchAgent()` + `useSdcpnPlugin()` and exclude the older stub agent. |

## Verification approach

- **Inner:** deterministic tests for finalized-transcript deduplication, canonical text selection, TTS cancellation, submission correlation, and rehydration.
- **Middle:** run the real Brunch agent behind Flue and drive one Voice turn through `send` plus `observe` or `read`, retaining canonical history and the Voice ledger.
- **Outer:** a human speaks, hears the response begin, interrupts once, reopens the same conversation, and confirms visible/spoken/history agreement. Browser-only mocks or a server-only Flue call do not establish the Voice advance.

## Inputs and joins

- This mission may cut from Mission 4 independently of the fixture/workpiece mission; neither mission is a prerequisite for the other's first tracer.
- The Voice branch supplies STT, TTS, playback, and answer-correlation behavior. Mission 4 supplies the current Brunch composition and canonical conversation runtime.
- A later integration mission may reuse this direct client to service Petrinaut client tools, but this mission does not need tool mutation to prove transport.

## Risks and assumptions

- If canonical Mission 4 replies remain too long for speech, first try deterministic question-focused presentation or Brunch-owned spoken-mode instruction; re-admit secondary generative preparation only after measured failure and with visible canonical/spoken distinction.
- If browser-to-Flue auth/CORS cannot be made safe directly, use the thinnest same-origin proxy that preserves Flue semantics rather than translating into AI SDK messages.
- If `transport-aisdk` or the existing assistant UI has another live consumer, retain it; this mission establishes that Voice does not require it, not that the repository does not.

## Accepted constraints and guarded invariants

- One canonical Flue history; no Voice-side transcript authority.
- One finalized answer submission; provisional speech remains ephemeral.
- No lossy generative simplification in the tracer.
- Voice owns audio interaction and playback; Brunch owns canonical response content.
- Use supported Flue client APIs; do not hand-roll offset, retry, or stream reduction.
- Preserve ownership/authentication and make failures visible.
- Do not restore the old app-local Brunch agent or splice Voice into the stock assistant's history.

## Cross-cutting obligations

Record latency to admission, first canonical text, first audio, and settlement; distinguish local cancellation from durable abort; keep content out of ordinary telemetry; and update Voice/Petrinaut user documentation if the visible interaction or assistant surface changes.

## Expected touched paths

```text
Voice-stack application paths                                      ~ direct Flue client host, STT/TTS projection, cancellation
apps/brunch-agent/src/app.ts                                      ? protocol/auth mounting only if the existing route is insufficient
apps/brunch-agent/src/agents/chat-agent/                           ~ preserve current package composition during reconciliation
apps/brunch-agent/src/conversation/                                ? only shared identity/tool-result mechanics actually reused
libs/@hashintel/brunch-agent/packages/transport-aisdk/             ? retain or remove only after consumer inspection
libs/@hashintel/petrinaut/src/ui/                                  ? remove/replace obsolete assistant surface only if separately admitted
```

## Fog-line

- The exact Voice-stack source after its PRs settle and the selected integration order.
- Whether `FlueClient.read` or a maintained `observe({ live: "sse" })` store best fits the existing Voice state machine.
- The authenticated production URL/proxy and origin policy.
- The deterministic policy for which canonical text is spoken if a response contains multiple text blocks or interactive tool parts.
- Whether any non-Voice consumer still needs `transport-aisdk` or the current assistant UI.

## Stop or reorient

Stop if integration creates a second conversation authority, submits provisional STT, rewrites canonical output through another model without an observed need, restores the old stub agent, exposes an unauthenticated Flue route, hand-rolls stream recovery, or claims adapter/UI removal before consumer inspection. Stop at a crisp host/auth blocker rather than rebuilding the AI SDK adapter under a new name.

## Carried evidence and rejected alternatives

The existing AI SDK transport remains a valid adapter for an AI SDK chat consumer; it is rejected only as an inherent Voice dependency. The older Voice simplifier was a workaround for pre-Mission-4 response shape, not permanent authority. Direct Flue preserves durable submission correlation, history, observation, and abort semantics while avoiding a second projection protocol.
