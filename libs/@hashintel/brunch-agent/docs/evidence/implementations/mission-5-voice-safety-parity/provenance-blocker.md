# FE-1580 direct-user Voice provenance blocker

## Observed boundary

Flue 2.0.3 can durably preserve Voice provenance for client-tool results: the
existing client-tool result signal carries each Voice-origin tool-call id, and
canonical snapshot projection can reconstruct every surviving sibling origin.
Regression coverage preserves successful siblings after a partial failure,
projects both origins from the persisted signal, and restores them through the
production observation hook after unmount and reopen.

The corresponding direct-user seam does not exist in the installed public
contract:

- `DeliveredMessage` user input accepts only `body` and image `attachments`;
- the caller's `idempotencyKey` is accepted for admission but is not projected
  into `FlueConversationMessage` or `FlueConversationSettlement`;
- materialized user messages expose the generated `submissionId`, but no Voice
  source metadata; and
- snapshot `metadata` is agent-authored response metadata, not caller-authored
  user-message metadata.

The discarded implementation persisted Voice `submissionId` values in browser
storage and correlated them after hydration. That would create a second durable
store, which the mission explicitly names as a stop condition. Encoding the
origin in visible user text is also prohibited. Replacing the canonical direct
user message with a hidden Flue signal would change the delivery semantics and
require a synthetic second transcript projection, so it is not a transparent
representation of the existing path-B turn.

## Current disposition

Direct spoken user turns still render with a Voice chip while their AI SDK
message metadata is live. Their canonical text and submission survive Flue
hydration, but the Voice chip cannot be reconstructed after reopen. This portion
of section 6 is blocked rather than reported as complete.

Re-enter only when Flue projects caller metadata or the caller idempotency key
onto the canonical direct-user message, or when the product owner explicitly
authorizes a different durable representation. The oracle is a snapshot-only
test that reconstructs the Voice marker after a fresh process with no browser
correlation state.
