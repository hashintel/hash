# FE-1580 donor-behavior matrix

## Decision frame

This record pins the semantic disposition of the Voice donor branches for the live [FE-1580 mission](../../../../MISSION.md). The parent and donors are read-only source evidence at these exact heads:

| Source | Pinned head | Role |
| --- | --- | --- |
| Parent PR [#9528](https://github.com/hashintel/hash/pull/9528) | `036fb06ee83e840fd7a87dd1bc758a2dd49ddd4c` | Unified Flue route and path-B departure base |
| Donor PR [#9496](https://github.com/hashintel/hash/pull/9496) | `c7fe8a2e68e8fdc37018b21ec2e9daf4e9ef7c82` | Canonical TTS queue and replay mechanics |
| Donor PR [#9500](https://github.com/hashintel/hash/pull/9500) | `935aa9f02a5ac635a50eb8bc130edb3e258af8e4` | Completed-transcript authority |
| Donor PR [#9507](https://github.com/hashintel/hash/pull/9507) | `252b9dbb0c77fae8cee45a506f09cac3e20c381c` | Temporary `brunch_ask` shim, excluded |
| Donor PR [#9512](https://github.com/hashintel/hash/pull/9512) | `d13535d1077b3a78d6a1411031b7d0a0a78e3144` | Half-duplex cancellation, replay UX, and provenance |

No source is merged, cherry-picked, rebased, retargeted, rewritten, or closed by the implementation. Tests are transplanted first and adapted to the one Flue submission route; production behavior is reimplemented semantically.

The owner selected half-duplex turn ownership on 2026-09-03: assistant output owns the audio turn until **Your turn** completes an acknowledged cancellation barrier. Automatic duplex is not an admissible fallback.

## Behavior disposition

| Source | Behavior | Disposition | Reason | Outstanding adaptation or proof |
| --- | --- | --- | --- | --- |
| #9528 | One `/agents/chat/:instanceId` product route, browser `ChatTransport`, one memoized client, path-B Voice submission through shared `useChat` | **Adopt** | This is the departure architecture and prevents a second admission authority. | Restack onto every new parent head; verify no successor code calls `send()` directly from Voice. |
| #9528 | Direct Voice `send()` as a fog-line fallback | **Reject** | It creates a second admission path and mutable coordination surface. The parent has already proved path B. | Mission authority now permits path B only. |
| #9528 | Claim that Flue 2.0.3 lacks caller idempotency | **Reject as factually false** | Installed typings expose `AgentPromptOptions.idempotencyKey`, `AgentSendResult.deduplicated`, and 409 `submission_conflict` with the existing `submissionId`. | Add transport tests and implementation for same-payload convergence, conflict recovery, and visible ambiguous admission. |
| #9528 | Parent-owned admission/Stop races, stream cancellation, hydration overwrite, client-tool classification, response/submission correlation, and PR/CI repairs | **Reject from successor scope** | Lu owns these defects; changing them here would make the stack compete with its parent. | Report blockers and restack onto fixes. The real reload witness remains blocked by hydration overwrite. |
| #9496 | Serialized canonical speech queue, retained exact source segments, response/output terminal gating | **Adopt mechanics** | Replay and ordinary TTS need one lifecycle-safe queue, and exact text preserves canonical authority. | Remove every preparation/simplifier dependency while adapting queue tests to the parent's canonical Flue segments. |
| #9496 | `canReadFullResponse`, `canRepeatQuestion`, `readFullResponse()`, `repeatQuestion()`, playback menu | **Adopt** | These are the missing Voice UX-parity controls. | Gate them during submission, capture, cancellation, pause, and errors; require matching response terminal plus output completion. |
| #9496 | Realtime-generated concise response preparation or any fallback that rewrites canonical text | **Reject** | Response simplification is a non-goal and violates exact canonical speech. | Tests compare retained segment ids and exact queued strings; no preparation API remains on this path. |
| #9500 | No Realtime tools, `tool_choice: "none"`, semantic VAD `create_response: false` | **Adopt** | Realtime detects/transcribes and renders supplied TTS only; it must not generate user meaning. | Adapt policy, session, and integration tests to the parent route. |
| #9500 | Only `conversation.item.input_audio_transcription.completed` can submit; model function arguments ignored | **Adopt** | Shape validation cannot prove model-generated arguments match the audio. | Transplant regression tests before replacing the parent bridge authority. |
| #9500 | Transcript identity `(connectionEpoch, itemId, contentIndex)`, stable submission id, trim plus Unicode whitespace collapse, 32,000-code-point limit | **Adopt** | This gives one deterministic logical Voice delivery and one normalization boundary. | Feed the derived identity through path B as the Flue idempotency key. |
| #9500 | Explicit duplicate, empty, failed, unavailable, and over-limit rejection; passive/recoverable not-heard UI; provisional display only | **Adopt** | Rejected audio must never become a turn, while ordinary silence/failure must not poison the session. | Preserve the reason-specific bridge events and controller recovery behavior. |
| #9500 | Silently settling ownership by discarding every playback-overlapping utterance without an explicit handoff | **Supersede** | It avoids echo but leaves users without a deliberate way to take the turn. | Use #9512 half-duplex `canTakeTurn`/`takeTurn()` and reject all speech captured before the completed handoff. |
| #9500 | `brunch_ask` answer/tool correlation and preparation code inherited from its base | **Reject** | Structured questions and response preparation are excluded. | Correlate the Voice delivery to its path-B submission and canonical response/question facts instead. |
| #9507 | Temporary `brunch_ask` registration, widget, correlated spoken ask answer, transcript formatting | **Reject entire shim** | The current transport only admits the supported follow-up set; a spoken ask can otherwise wait forever. Structured questions are a separate product decision. | Remove or gate dormant `brunchAskInteractiveTool` and `"brunch-ask"` canonical-speech recognition only if still present after restack. |
| #9512 | Half-duplex `canTakeTurn`, `takeTurn()`, `"cancelling"` output state, and **Your turn** control | **Adopt by owner decision** | It makes output/input ownership explicit and prevents assistant playback from becoming a false user turn. | Adapt public Voice state and panel controls without importing donor topology or ask widgets. |
| #9512 | Promise-returning `cancelOutput()` that waits for input/output clears, matching acknowledgements, and response terminal events | **Adopt** | The microphone cannot safely reopen on a fire-and-forget cancel. | Transplant acknowledgement/race tests first; preserve latest mute preference and fresh post-handoff capture. |
| #9512 | Replay availability tied to exact retained source, terminal response, and output completion | **Adopt with #9496 mechanics** | This closes replay races without changing canonical content. | Unify with the parent's segment/submission correlation rather than donor ask correlation. |
| #9512 | Voice answer icon/provenance before interactive answers | **Partially adopt; blocked for direct user turns** | Live attribution is useful but one origin per assistant message is insufficient after coalesced or sibling Voice deliveries. Flue's client-tool result signal can durably carry those origins. Its direct-user delivery and snapshot types expose no caller metadata or idempotency key, so a direct spoken user message cannot be identified after reopen without a forbidden second store or text encoding. | Keep `voiceToolCallIds`, preserve successful siblings on partial failure, and reconstruct supported tool-result origins from Flue signals. Re-enter direct-user attribution only when Flue provides a supported durable correlation seam. |
| #9512 | App-local agent topology, temporary ask UI, response preparation, or donor-specific host composition | **Reject** | The parent owns the one Flue route and current host composition; these mechanisms are obsolete or non-goals. | Reuse only state-machine, cancellation, replay, and attribution behavior. |

## Outstanding acceptance ledger

| Area | Required closing evidence | Current state |
| --- | --- | --- |
| Transcript authority | Transplanted-first session, bridge, controller, and integration regressions pass on path B. | Implemented. Focused policy, session, bridge, controller, control, and preview integration tests pass using completed transcripts only. |
| Admission idempotency | Typed and Voice logical replays converge on one `submissionId`; conflict metadata is narrowed safely; ambiguous outcome does not retry. | Implemented. Transport tests cover stable typed/Voice keys, deduplicated receipts, 409 conflicts, and non-retried ambiguity. |
| Cancellation barrier | Buffer acknowledgements and targeted response terminals settle before capture; stale/pre-handoff audio cannot submit; latest mute choice wins. | Implemented. Session/controller races and the preview integration cover acknowledged handoff and discarded overlap. |
| Canonical replay | Exact segment queue and playback menu pass availability/race tests without a simplifier. | Implemented. Controller and panel tests cover both replay actions, exact segments, terminal gating, and disabled states. |
| Durable provenance | Multiple origins and partial failure survive projection, hydration, and reopen without user-text encoding. | Partially implemented for assistant client-tool results through persisted Flue signals; multiple sibling origins survive projection and partial failure. Direct spoken user attribution is blocked because Flue 2.0.3 snapshots do not expose caller idempotency or user-message metadata. The rejected browser store would violate mission authority. |
| Dormant ask | No mounted Voice ask capability remains, or the parent commit that removed it is recorded. | Implemented. The website no longer registers the ask widget and canonical speech ignores `brunch_ask`; dormant source files remain unmounted. |
| Real witness | Microphone, handoff, unsettled Stop, reload, canonical snapshot, settlement, and same-origin absolute-`streamUrl` artifacts are retained with hashes. | Blocked by the parent's hydration overwrite. |
| Donor retirement | Replacement accepted and each donor owner explicitly approves closure. | Deferred; no donor or stakeholder issue may be closed now. |
