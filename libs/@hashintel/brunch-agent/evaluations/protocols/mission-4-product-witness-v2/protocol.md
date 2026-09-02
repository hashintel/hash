# Mission 4 local/restricted product witness v2

Status: proposed procedure; not executed or accepted.

## Purpose

Prove that the final frozen Mission 4 production instrument crosses the real local/restricted Petrinaut panel → same-origin AI SDK route → production Flue `ChatAgent` boundary and obeys the routing contract. This is not remote deployment evidence.

## Preconditions

- The parent has frozen and committed the final production instrument.
- At least one valid member of the final accepted Mission 4 campaign identifies the same source commit, instrument fingerprint, and built-server artifact manifest.
- No instrument file has changed since that member, and the witness's Brunch bundle matches that retained built-server manifest byte for byte.
- The parent starts and records the production Brunch and Petrinaut entrypoints; stale bundles are rebuilt before the witness begins.
- The witness uses a fresh browser conversation and does not receive construction mode or construction tools.

If the product boundary exposes an instrument defect, stop. Any repair creates a new frozen candidate and invalidates same-instrument correspondence with the prior campaign; do not label a repaired rerun as the same witness.

## Interaction

1. Open the tracked Petrinaut AI assistant panel through its real local route.
2. Submit one bounded operational-process modelling request that requires interactive elicitation.
3. Observe skill activation and successful reads of `references/universal-elicitation.md` and `references/profile.md` before the first substantive question.
4. Answer that one focused question and request a recoverable workpiece without construction.
5. Observe a successful `templates/workpiece.md` read before the first `runbook-ir` creation.
6. Verify that no assistant turn asks more than one focused human-knowledge question, no construction resource/tool is exposed or used, no net mutates, and the visible panel renders the workpiece.

## Required retained evidence

Retain under the final accepted campaign's `product-witness/` evidence directory:

- screenshots of the submitted request, first question, resource/tool activity, and visible workpiece;
- browser accessibility snapshots for the same states;
- a browser network record binding the panel request to the same-origin `/api/chat` route;
- the exact raw Flue conversation snapshot and readable transcript, including conversation id, skill activation, ordered resource calls and outcomes, and mounted/called tool names;
- the Brunch built-server artifact manifest and its comparison with the selected campaign member;
- Brunch and Petrinaut start/build commands and relevant server logs;
- SHA-256 hashes for every retained artifact;
- an adjudication mapping each Mission 4 witness claim to exact raw evidence and stating what the witness does not prove.

Ignored `.playwright-cli/` scratch is not evidence. Copy only the required raw artifacts into the versioned evidence directory before stopping the servers or cleaning local state.

## Acceptance

The parent audits path and hash correspondence, confirms the campaign source commit matches the witness instrument, and presents the evidence to the owner. Only the owner accepts the witness. A runner, browser operator, or builder may report observations but may not declare witness acceptance, select the Mission 5 handoff, archive Mission 4, or close the mission.
