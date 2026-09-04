# Mission 5 question replay and direct-user provenance decision

## Decision

The owner approved two changes to the live FE-1580 authority on 2026-09-04:

1. Brunch may expose a non-interactive, model-facing question-marker tool. The
   marker identifies exact assistant-authored question text for Voice replay,
   but it never suspends a response, renders an answer affordance, accepts an
   answer, or changes Voice path B.
2. Direct-user Voice provenance must wait for an upstream Flue contract that
   durably projects caller metadata on a canonical `kind: "user"` message. This
   branch must not patch Flue locally or approximate provenance with a second
   signal admission, browser storage, or encoded user text.

## Exact question marker

Brunch core owns a `brunch_mark_question` server tool and a
`data-brunch-question` client marker. Before asking the user a direct question,
the model calls the tool with the exact question text. The tool writes a durable
data part containing that text and its Flue `toolCallId`, then returns a small
acknowledgement. It does not terminate the response. Brunch instructions require
the same exact text to appear in ordinary assistant prose after the tool call.

The browser transport hides the marker tool's implementation call while
retaining the data part. This keeps an internal annotation out of Petrinaut's
tool-activity UI without creating another conversation representation. Both the
live stream and canonical snapshot projection apply the same hidden-tool rule.

Canonical speech accepts a question marker only when all of these facts hold:

- the marker has a non-empty string question and non-empty `toolCallId`;
- it belongs to an assistant message;
- the same assistant message contains the exact marked string in finalized
  ordinary text; and
- the marker data part is complete and canonical, not provisional Voice state.

Malformed, unmatched, stale, or absent markers do not enable **Repeat
question**. The final text segment and punctuation are never used as fallback
question authority. The selected question segment derives stable identity from
the assistant message id, marker tool-call id, and exact-text hash. Full-response
speech remains the ordered ordinary text segments and is not rewritten or
duplicated by the marker.

The Voice controller carries the selected question separately from the full
response. **Repeat question** reuses the existing exact canonical queue and the
same settlement, output-completion, idle-input, submission, cancellation,
capture, pause, and error gates as **Read full response**. The control remains
disabled when the settled response has no matching marker.

## Production proof

Tests are written and observed failing before implementation. Closing evidence
must cover:

- Brunch's built Flue agent mounting `brunch_mark_question` while continuing to
  omit `brunch_ask`;
- a real server-tool call writing a durable `data-brunch-question` part;
- live transport and snapshot projection hiding the implementation tool while
  retaining the marker;
- canonical selection rejecting malformed and unmatched markers and preserving
  exact text and stable identity for a valid marker;
- the production Voice host registering `repeatQuestion` and the panel invoking
  it only when `canRepeatQuestion` is true; and
- controller and preview integration proving exact question-only replay after
  correlated Brunch settlement and matching Realtime output completion, with
  every existing replay exclusion still enforced.

## Direct-user Voice provenance

Flue 2.0.3 and current upstream `main` accept only `body` and image
`attachments` on `kind: "user"`. The caller's idempotency key is irreversibly
hashed into `submissionId`; canonical snapshots do not expose that key or
caller-authored user metadata. Agent-authored response metadata cannot annotate
the canonical user message.

The accepted route is an upstream Flue extension that admits caller metadata on
the user delivery, persists it atomically with the canonical user record, and
projects it on live and historical user messages. FE-1580 can adopt that seam
only after a released dependency is available and the branch is explicitly
authorized to upgrade. The closing oracle is a snapshot-only fresh-process test
that restores the Voice marker without browser correlation state.

Rejected alternatives:

- a local Yarn patch to Flue, because it forks substrate persistence and wire
  projection inside this product PR;
- a correlated provenance signal, because it is a second, non-atomic admission
  that can independently fail or wake the agent;
- browser or application sidecar storage, because it becomes a second durable
  authority; and
- hidden transcript, attachment, or visible-text encoding, because it changes
  the canonical user representation or smuggles metadata through content.

Until the upstream contract is released and adopted, direct spoken user text
remains canonically durable but its Voice chip after reopen remains blocked and
must not be reported as complete.
