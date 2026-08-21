# FE-1449 ask suspend/return implementation record

**Date:** 2026-08-19
**Source:** `ln/fe-1449-structured-ask`, stacked on the FE-1436 transport branch
**Sibling:** FE-1448 (hashintel/hash PR #9249) — the public host interactive-tool
registration API in `@hashintel/petrinaut` that renders what this record puts on the wire

## Outcome

The structured ask now crosses the wire as a suspension the panel can answer:

```text
brunch_ask tool call (Flue, terminate: true)
  -> transport-aisdk: awaiting client tool on the wire (tool-input-available,
     stable toolCallId, no providerExecuted, affordance output withheld)
  -> FE-1448-registered host component renders awaiting state, person submits
  -> AI SDK tool-output follow-up POST ({ answer } on the ask's toolCallId)
  -> wire-boundary admission against durable Flue history
  -> fresh user dispatch resumes the suspended conversation
  -> next agent turn streams in the same panel response
```

Two seams carry it. `transport-aisdk` holds the ask open: the harness's minted
affordance (its internal tool-output record) never reaches the wire, so the panel
sees an input-available dynamic tool and the registered component supplies the
output when the person submits. The application's new `askReply` seam then admits
the return POST: `admit` consults the projected durable history (`@brunch/core`'s
`pendingAskAffordanceId` + `decideAskReplyAdmission`), and `run` re-enters the
conversation as a fresh user dispatch (spec §7.4), which the binding mechanically
binds to the pending affordance — the submission becomes the one
`user-affordance-payload` entry.

## Provenance at the wire boundary

A human answer travels tool-output-shaped but is not a machine tool result. Only
the currently pending ask's correlated submission is admitted:

- **stale/duplicate** (ask already answered): `409 ask_not_pending`, nothing dispatched
- **forged/mismatched** tool-call id: `409 ask_mismatch`, nothing dispatched
- **malformed or ambiguous** submission (empty answer, wrong shape, two ask parts):
  `400 invalid_ask_submission`
- **machine-only follow-ups** (Petrinaut mutation outputs, the synthetic
  diagnostics message): still `422 tool_result_follow_up_not_supported` — the
  FE-1436 negative contract stands; FE-1438 owns that protocol
- concurrent duplicates collapse at the substrate: the dispatch idempotency key is
  `{conversationId}:ask:{toolCallId}`

The submitted-output contract is `{ answer: non-empty string }` (`AskSubmission`
in `@brunch/core`); the host component authors exactly this shape. The free-text
envelope is consumed as-is — no FE-1395 choice/questionnaire schema is invented.

## Inspection surface

The opt-in `TRANSPORT_AISDK` stream (unchanged opt-in, still structurally excluded
from evidence) gains three events: `ask-await` (suspension reached the wire),
`ask-reply-admitted`, and `ask-reply-refused` with the refusal reason. Together
with the existing request/turn/part events, awaiting → submitted → resumed and
every correlation id are observable without a debugger.

## Proof

- `test/transport-aisdk-ask-reply.test.ts` — wire contracts: the translated ask
  part (awaiting client tool, withheld output), the correlated return POST, each
  refusal class, and the seamless-absent default
- `packages/core/test/ask-protocol.test.ts` — pending-ask projection and
  admission decisions as pure protocol
- `apps/dev/test/petrinaut-ask.test.ts` — end-to-end over the committed
  application route: the actual elicitor invokes `brunch_ask`, the correlated
  submission resumes the same Flue conversation and produces the next visible
  turn, and a replayed duplicate is refused before dispatch

## What remains for the full FE-1449 acceptance

The hashintel/hash side: `apps/petrinaut-website` registers brunch's free-text
ask component through the FE-1448 `aiAssistant` API (rendering the question from
the ask's `input`, submitting `{ answer }`), plus a real-panel run or story
against this server path. That wiring is application code in the hash monorepo
and lands on its own branch there.
